import { Server, Socket } from 'socket.io';
import { defineModels } from '../models';
import { Sequelize, Op } from 'sequelize';
import { ChatMessage } from '../models/ChatMessage';
import { User } from '../models/User';
import { ChatConversation } from '../models/ChatConversation';
import mysql from 'mysql2/promise';

// Configuration for tenant lookup database
const tenantDbConfig = {
  host: '157.180.50.29',
  user: 'root',
  password: 'jWAC5hpomatL2',
  database: 'tenantDB',
  charset: 'utf8mb4'
};

// Configuration for default database
const defaultDbConfig = {
  host: '157.180.50.29',
  user: 'brain',
  password: '8MUG3eT9GYXT298xtRKg',
  database: 'brain_space',
  charset: 'utf8mb4'
};

// Cache for database connections (shared with middleware)
const sequelizeCache: Record<string, { sequelize: Sequelize, models: any }> = {};

// Function to get tenant-specific database connection
async function getTenantConnection(host: string | undefined) {
  if (!host) {
    // No host header, use default
    return await getDefaultConnection();
  }

  // Remove port if present
  const hostname = host.split(':')[0];
  const parts = hostname.split('.');
  let subdomain = '';
  
  // Check if this is brain-space.app domain structure
  if (parts.length >= 2 && parts[parts.length - 2] === 'brain-space' && parts[parts.length - 1] === 'app') {
    // If it's x.brain-space.app, subdomain is the first part
    if (parts.length > 2) {
      subdomain = parts[0];
    }
    // If it's just brain-space.app, subdomain is empty
  } else if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // For local development, use default database
    subdomain = '';
  } else {
    // For other domains, treat as default
    subdomain = '';
  }

  // If no subdomain, use default database
  if (!subdomain) {
    return await getDefaultConnection();
  }

  // Check cache for tenant-specific connection
  if (sequelizeCache[subdomain]) {
    return sequelizeCache[subdomain];
  }

  // Lookup tenant DB info from tenantDB
  const tenantConn = await mysql.createConnection(tenantDbConfig);
  const [rows]: any = await tenantConn.execute(
    'SELECT db_name, db_user, db_pass FROM tenants WHERE subdomain = ? LIMIT 1',
    [subdomain]
  );
  await tenantConn.end();

  if (!rows.length) {
    // If tenant not found, fallback to default
    return await getDefaultConnection();
  }

  const { db_name, db_user, db_pass } = rows[0];
  const tenantSequelize = new Sequelize(db_name, db_user, db_pass, {
    host: 'localhost',
    dialect: 'mysql',
    logging: false,
    pool: { max: 5, min: 0, idle: 10000 }
  });

  const models = defineModels(tenantSequelize);
  sequelizeCache[subdomain] = { sequelize: tenantSequelize, models };
  return sequelizeCache[subdomain];
}

// Function to get default database connection
async function getDefaultConnection() {
  // Check cache for default connection
  if (sequelizeCache['default']) {
    return sequelizeCache['default'];
  }

  // Create default database connection
  const defaultSequelizeInstance = new Sequelize(defaultDbConfig.database, defaultDbConfig.user, defaultDbConfig.password, {
    host: defaultDbConfig.host,
    dialect: 'mysql',
    logging: false,
    pool: { max: 5, min: 0, idle: 10000 }
  });

  const models = defineModels(defaultSequelizeInstance);
  sequelizeCache['default'] = { sequelize: defaultSequelizeInstance, models };
  return sequelizeCache['default'];
}

const onlineUsers = new Map<string, Set<string>>();
const messageTimestamps = new Map<string, number[]>(); 

export function chatSocket(io: Server) {
  io.on('connection', async (socket: Socket) => {
    try {
      // Get tenant-aware database connection
      const host = socket.handshake.headers.host as string;
      const { models } = await getTenantConnection(host);
      
      const { User, ChatConversation, ChatMessage } = models;
      const userId = socket.data.user.id;
      let userSockets = onlineUsers.get(userId);
      let isFirstConnection = false;
      if (!userSockets) {
        userSockets = new Set();
        onlineUsers.set(userId, userSockets);
        isFirstConnection = true;
      }
      userSockets.add(socket.id);

      // Ensure user joins their own user-specific room for notifications
      socket.join(`user_${userId}`);
      console.log(`User ${userId} joined room user_${userId}`);
      socket.join(`role_${socket.data.user.role}`);
      console.log(`User ${userId} joined room role_${socket.data.user.role}`);

      if (isFirstConnection) {
        // Mark user as online in DB
        await User.update(
          { status: 'Online', last_seen: null },
          { where: { id: userId } }
        );
        socket.broadcast.emit('user_online', { userId });
        io.emit('user_status_changed', { userId, status: 'Online' });
      }

    console.log(`Socket connected: ${socket.id}`);
    // Join all rooms for this user
    socket.on('join', async ({ conversationIds }) => {
      if (Array.isArray(conversationIds)) {
        conversationIds.forEach((cid) => {
          socket.join(`conversation_${cid}`);
          console.log(`User ${userId} joined room conversation_${cid}`);
        });
      }
      console.log(`User ${userId} joined. Socket: ${socket.id}`);
    });

    // Typing indicator
    socket.on('typing', ({ conversationId, userId }) => {
      socket.to(`conversation_${conversationId}`).emit('typing', { conversationId, userId });
    });
    socket.on('stop_typing', ({ conversationId, userId }) => {
      socket.to(`conversation_${conversationId}`).emit('stop_typing', { conversationId, userId });
    });

    // Send message with rate limiting
    socket.on('send_message', async (data, callback) => {
      console.log('send_message', data);
      try {
        const sender_id = socket.data.user.id;
        const { receiver_id, message, message_type, file_url, file_name, file_extension, file_size, tempId } = data;
        // Only accept file_url, file_name, file_extension, file_size if already uploaded via REST
        const now = Date.now();
        const times = messageTimestamps.get(sender_id) || [];
        // Remove timestamps older than 2 seconds
        const recent = times.filter((t) => now - t < 2000);
        if (recent.length >= 5) {
          socket.emit('rate_limited', { message: 'Too many messages, slow down.' });
          return;
        }
        recent.push(now);
        messageTimestamps.set(sender_id, recent);

        // Find or create conversation
        let conversationId = data.conversation_id;
        let conversation;
        let isNewConversation = false;
        conversation = await ChatConversation.findOne({
          where: {
            [Op.or]: [
              { user_one: sender_id, user_two: receiver_id },
              { user_one: receiver_id, user_two: sender_id }
            ]
          }
        });
        if (!conversation) {
          conversation = await ChatConversation.create({
            user_one: sender_id,
            user_two: receiver_id
          });
          isNewConversation = true;
        }
        conversationId = conversation.id;

        // Save to DB, then emit to room
        let msg;
        try {
          msg = await ChatMessage.create({
            conversation_id: conversationId,
            sender_id,
            receiver_id,
            message: message || '',
            message_type: message_type || 'text',
            file_url: file_url || null,
            file_name: file_name || null,
            file_extension: file_extension || null,
            file_size: file_size || null,
            is_read: false,
            deleted_by: [],
          });
        } catch (dbErr) {
          console.error('Message creation error:', dbErr);
          socket.emit('error', { message: 'Failed to save message', details: dbErr });
          return;
        }
        const fullMsg = await ChatMessage.findByPk(msg.id, {
          include: [
            { model: User, as: 'sender', attributes: ['id', 'name', 'user_name', 'main_image'] },
            { model: User, as: 'receiver', attributes: ['id', 'name', 'user_name', 'main_image'] },
          ],
        });
        let plainMsg: any = null;
        if (fullMsg) {
          plainMsg = fullMsg.toJSON();
          plainMsg.tempId = tempId;
        }
        console.log('plainMsg', plainMsg);
        if (callback) {
          callback({ success: true, data: plainMsg }); // Make sure fullMsg includes tempId!
        }
        if (isNewConversation) {
          // Fetch the full conversation object with users and messages
          const fullConversation = await ChatConversation.findByPk(conversationId, {
            include: [
              {
                model: ChatMessage,
                include: [
                  { model: User, as: 'sender', attributes: ['id', 'name', 'user_name', 'main_image'] },
                  { model: User, as: 'receiver', attributes: ['id', 'name', 'user_name', 'main_image'] },
                ],
                order: [['createdAt', 'ASC']],
              },
              { model: User, as: 'userOne', attributes: ['id', 'name', 'user_name', 'main_image', 'status', 'last_seen'] },
              { model: User, as: 'userTwo', attributes: ['id', 'name', 'user_name', 'main_image', 'status', 'last_seen'] },
            ],
          });
          io.to(`conversation_${conversationId}`).emit('new_conversation', { conversation: fullConversation, message: plainMsg });
        } else {
          io.to(`conversation_${conversationId}`).emit('new_message', plainMsg);
        }
        // Emit notification to receiver's user room
        if (fullMsg && (fullMsg as any).sender) {
          io.to(`user_${receiver_id}`).emit('notification', {
            sender_image: (fullMsg as any).sender.main_image,
            sender_name: (fullMsg as any).sender.name,
            message: fullMsg.message,
            file_type: fullMsg.file_url ? fullMsg.message_type : null,
            conversation_id: fullMsg.conversation_id,
            message_id: fullMsg.id,
          });
        }
      } catch (err) {
        console.error('send_message error:', err);
        socket.emit('error', { message: 'Failed to send message', details: err });
      }
    });

    // Edit message
    socket.on('edit_message', async ({ messageId, message }) => {
      const userId = socket.data.user.id;
      const msg = await ChatMessage.findByPk(messageId);
      if (msg && msg.sender_id === userId) {
        msg.message = message;
        await msg.save();
        io.to(`conversation_${msg.conversation_id}`).emit('message_edited', { messageId, message });
      } else {
        socket.emit('error', { message: 'Not allowed to edit this message.' });
      }
    });

    // Delete message
    socket.on('delete_message', async ({ messageId }) => {
      const userId = socket.data.user.id;
      const msg = await ChatMessage.findByPk(messageId);
      if (!msg) return;
      if (msg.sender_id === userId && !msg.is_read) {
        await msg.destroy();
        io.to(`conversation_${msg.conversation_id}`).emit('message_deleted', { messageId, both: true });
      } else {
        if (!msg.deleted_by.includes(userId)) {
          msg.deleted_by = [...msg.deleted_by, userId];
          await msg.save();
        }
        io.to(`conversation_${msg.conversation_id}`).emit('message_deleted', { messageId, both: false, userId });
      }
    });

    // Mark as read
    socket.on('mark_read', async ({ messageId }) => {
      const userId = socket.data.user.id;
      const msg = await ChatMessage.findByPk(messageId);
      if (msg && msg.receiver_id === userId) {
        msg.is_read = true;
        await msg.save();
        io.to(`conversation_${msg.conversation_id}`).emit('message_read', { messageId, userId });
      }
    });

    // User offline
    socket.on('disconnect', async () => {
      for (const [userId, sockets] of onlineUsers.entries()) {
        if (sockets.has(socket.id)) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            onlineUsers.delete(userId);
            // Update last_seen and status in DB
            await User.update(
              { last_seen: new Date(), status: 'Offline' },
              { where: { id: userId } }
            );
            socket.broadcast.emit('user_offline', { userId, last_seen: new Date() });
            io.emit('user_status_changed', { userId, status: 'Offline' });
            console.log(`User ${userId} disconnected. Socket: ${socket.id}`);
          }
          break;
        }
      }
    });

    // Change user status
    socket.on('change_status', async ({ status }) => {
      const userId = socket.data.user.id;
      const ALLOWED_STATUSES = ['online', 'busy', 'offline', 'away'];
      if (!ALLOWED_STATUSES.includes(status)) {
        socket.emit('error', { message: 'Invalid status' });
        return;
      }
      const user = await User.findByPk(userId);
      if (!user) {
        socket.emit('error', { message: 'User not found' });
        return;
      }
      user.status = status;
      await user.save();
      io.emit('user_status_changed', { userId, status });
      console.log(`User ${userId} changed status to ${status} (via socket)`);
    });
    
    } catch (error) {
      console.error('Socket connection error:', error);
      socket.emit('error', { message: 'Internal server error' });
    }
  });
} 