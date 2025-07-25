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


// Function to get tenant-specific database connection
export async function getTenantConnection(socket: Socket) {
  console.log(`[SOCKET TENANT DEBUG] Starting tenant connection for socket: ${socket.id}`);
  
  // Prefer tenant from handshake query param
  const tenantParam = socket.handshake.query.tenant as string | undefined;
  let subdomain = '';
  let dbHost = '157.180.50.29';
  let dbName = '';
  let dbUser = '';
  let dbPass = '';
  let useTenantDbLookup = false;

  if (tenantParam) {
    subdomain = tenantParam;
    console.log(`[SOCKET TENANT DEBUG] Using tenant from handshake query param: '${subdomain}'`);
    if (subdomain === 'dev') {
      dbHost = '88.198.32.140';
      useTenantDbLookup = true;
    } else if (subdomain === 'localhost' || subdomain === '127.0.0.1') {
      dbHost = '88.198.32.140';
      dbName = 'pos_new';
      dbUser = 'root';
      dbPass = 'TryHarderplease!@#$2232';
    } else if (subdomain === 'vercel' || subdomain === 'brain-space2.vercel.app') {
      dbHost = '88.198.32.140';
      dbName = 'pos_new';
      dbUser = 'root';
      dbPass = 'TryHarderplease!@#$2232';
    } else if (subdomain === '') {
      dbName = 'brain_space';
      dbUser = 'brain';
      dbPass = '8MUG3eT9GYXT298xtRKg';
    } else {
      useTenantDbLookup = true;
    }
  } else {
    // Fallback to Origin header if no tenant param
    const origin = socket.handshake.headers.origin as string | undefined;
    console.log(`[SOCKET TENANT DEBUG] Origin header: '${origin}'`);
    if (!origin) {
      throw new Error('No origin header provided and no tenant param');
    }
    try {
      const originUrl = new URL(origin);
      const hostname = originUrl.hostname;
      const parts = hostname.split('.');
      console.log(`[SOCKET TENANT DEBUG] Origin hostname: '${hostname}', parts:`, parts);
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        dbHost = '88.198.32.140';
        dbName = 'pos_new';
        dbUser = 'root';
        dbPass = 'TryHarderplease!@#$2232';
      } else if (hostname === 'brain-space2.vercel.app') {
        dbHost = '88.198.32.140';
        dbName = 'pos_new';
        dbUser = 'root';
        dbPass = 'TryHarderplease!@#$2232';
      } else if (
        parts.length >= 3 &&
        parts[parts.length - 2] === 'brain-space' &&
        parts[parts.length - 1] === 'app'
      ) {
        subdomain = parts[0];
        if (subdomain === 'chat' || subdomain === 'www') {
          throw new Error('Invalid subdomain');
        }
        if (subdomain === 'dev') {
          dbHost = '88.198.32.140';
          useTenantDbLookup = true;
        } else if (subdomain === '') {
          dbName = 'brain_space';
          dbUser = 'brain';
          dbPass = '8MUG3eT9GYXT298xtRKg';
        } else {
          useTenantDbLookup = true;
        }
      } else {
        throw new Error('Origin not allowed');
      }
    } catch (err) {
      throw new Error('Invalid origin URL');
    }
  }

  // If using special config (localhost, vercel)
  if (dbName && dbUser && dbPass) {
    const specialSequelize = new Sequelize(dbName, dbUser, dbPass, {
      host: dbHost,
      dialect: 'mysql',
      logging: false,
      pool: { max: 5, min: 0, idle: 10000 }
    });
    await specialSequelize.authenticate();
    const models = defineModels(specialSequelize);
    return { sequelize: specialSequelize, models };
  }

  // If using tenant DB lookup
  if (useTenantDbLookup) {
    const tenantConn = await mysql.createConnection(tenantDbConfig);
    const [rows]: any = await tenantConn.execute(
      'SELECT db_name, db_user, db_pass FROM tenants WHERE subdomain = ? LIMIT 1',
      [subdomain]
    );
    await tenantConn.end();
    if (!rows.length) {
      throw new Error('Tenant not found');
    }
    const { db_name, db_user, db_pass } = rows[0];
    const tenantSequelize = new Sequelize(db_name, db_user, db_pass, {
      host: dbHost,
      dialect: 'mysql',
      logging: false,
      pool: { max: 5, min: 0, idle: 10000 }
    });
    await tenantSequelize.authenticate();
    const models = defineModels(tenantSequelize);
    return { sequelize: tenantSequelize, models };
  }

  throw new Error('Invalid tenant configuration');
}

// Function to get default database connection
async function getDefaultConnection() {
  console.log(`[SOCKET TENANT DEBUG] Getting default database connection`);
  
  console.log(`[SOCKET TENANT DEBUG] Creating new default database connection`);
  console.log(`[SOCKET TENANT DEBUG] Default DB config:`, {
    host: defaultDbConfig.host,
    user: defaultDbConfig.user,
    database: defaultDbConfig.database
  });

  try {
    // Create default database connection
    const defaultSequelizeInstance = new Sequelize(defaultDbConfig.database, defaultDbConfig.user, defaultDbConfig.password, {
      host: defaultDbConfig.host,
      dialect: 'mysql',
      logging: false,
      pool: { max: 5, min: 0, idle: 10000 }
    });

    // Test the connection
    await defaultSequelizeInstance.authenticate();
    console.log(`[SOCKET TENANT DEBUG] Default database connection authenticated successfully`);

    const models = defineModels(defaultSequelizeInstance);
    return { sequelize: defaultSequelizeInstance, models };
  } catch (error) {
    console.error(`[SOCKET TENANT ERROR] Failed to connect to default database:`, error);
    throw error;
  }
}

const onlineUsers = new Map<string, Set<string>>();
const messageTimestamps = new Map<string, number[]>(); 

export function chatSocket(io: Server) {
  io.on('connection', async (socket: Socket) => {
    console.log(`[SOCKET] New connection attempt: ${socket.id}`);
    try {
      // Get tenant-aware database connection
      console.log(`[SOCKET] Getting tenant connection for socket: ${socket.id}`);
      const { models } = await getTenantConnection(socket);
      console.log(`[SOCKET] Tenant connection established for socket: ${socket.id}`);
      
      const { User, ChatConversation, ChatMessage } = models;
      const userId = socket.data.user.id;
      console.log(`[SOCKET] User ${userId} connecting with socket: ${socket.id}`);
      
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
      console.log(`[SOCKET] User ${userId} joined room user_${userId}`);
      socket.join(`role_${socket.data.user.role}`);
      console.log(`[SOCKET] User ${userId} joined room role_${socket.data.user.role}`);

      if (isFirstConnection) {
        console.log(`[SOCKET] First connection for user ${userId}, updating status to Online`);
        // Mark user as online in DB
        try {
          await User.update(
            { status: 'Online', last_seen: null },
            { where: { id: userId } }
          );
          console.log(`[SOCKET] Successfully updated user ${userId} status to Online`);
          socket.broadcast.emit('user_online', { userId });
          io.emit('user_status_changed', { userId, status: 'Online' });
        } catch (updateError) {
          console.error(`[SOCKET ERROR] Failed to update user ${userId} status:`, updateError);
        }
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
      console.log(`[SOCKET] send_message event received from user ${userId}:`, data);
      try {
        // Get fresh tenant connection for this operation
        const { models: currentModels } = await getTenantConnection(socket);
        const { User: CurrentUser, ChatConversation: CurrentChatConversation, ChatMessage: CurrentChatMessage } = currentModels;

        const sender_id = socket.data.user.id;
        const { receiver_id, message, message_type, file_url, file_name, file_extension, file_size, tempId, reply } = data;
        console.log(`[SOCKET] Processing message from ${sender_id} to ${receiver_id}`);

        // Only accept file_url, file_name, file_extension, file_size if already uploaded via REST
        const now = Date.now();
        const times = messageTimestamps.get(sender_id) || [];
        // Remove timestamps older than 2 seconds
        const recent = times.filter((t) => now - t < 2000);
        if (recent.length >= 5) {
          console.log(`[SOCKET] Rate limit exceeded for user ${sender_id}`);
          socket.emit('rate_limited', { message: 'Too many messages, slow down.' });
          return;
        }
        recent.push(now);
        messageTimestamps.set(sender_id, recent);

        // Find or create conversation
        let conversationId = data.conversation_id;
        let conversation;
        let isNewConversation = false;
        console.log(`[SOCKET] Looking for conversation between ${sender_id} and ${receiver_id}`);

        conversation = await CurrentChatConversation.findOne({
          where: {
            [Op.or]: [
              { user_one: sender_id, user_two: receiver_id },
              { user_one: receiver_id, user_two: sender_id }
            ]
          }
        });

        if (!conversation) {
          console.log(`[SOCKET] Creating new conversation between ${sender_id} and ${receiver_id}`);
          conversation = await CurrentChatConversation.create({
            user_one: sender_id,
            user_two: receiver_id
          });
          isNewConversation = true;
          console.log(`[SOCKET] New conversation created with ID: ${conversation.id}`);
        } else {
          console.log(`[SOCKET] Found existing conversation with ID: ${conversation.id}`);
        }
        conversationId = conversation.id;

        // Save to DB, then emit to room
        let msg;
        try {
          console.log(`[SOCKET] Creating message in conversation ${conversationId}`);
          msg = await CurrentChatMessage.create({
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
            reply: reply || null,
          });
          console.log(`[SOCKET] Message created successfully with ID: ${msg.id}`);
        } catch (dbErr) {
          console.error(`[SOCKET ERROR] Message creation error:`, dbErr);
          socket.emit('error', { message: 'Failed to save message', details: dbErr });
          return;
        }

        const fullMsg = await CurrentChatMessage.findByPk(msg.id, {
          include: [
            { model: CurrentUser, as: 'sender', attributes: ['id', 'name', 'user_name', 'main_image'] },
            { model: CurrentUser, as: 'receiver', attributes: ['id', 'name', 'user_name', 'main_image'] },
          ],
        });

        let plainMsg: any = null;
        if (fullMsg) {
          plainMsg = fullMsg.toJSON();
          plainMsg.tempId = tempId;
        }
        console.log(`[SOCKET] Full message prepared for emission:`, plainMsg);
        if (callback) {
          console.log(`[SOCKET] Sending callback response for message ${msg.id}`);
          callback({ success: true, data: plainMsg });
        }
        if (isNewConversation) {
          console.log(`[SOCKET] Emitting new_conversation event for conversation ${conversationId}`);
          // Fetch the full conversation object with users and messages
          const fullConversation = await CurrentChatConversation.findByPk(conversationId, {
            include: [
              {
                model: CurrentChatMessage,
                include: [
                  { model: CurrentUser, as: 'sender', attributes: ['id', 'name', 'user_name', 'main_image'] },
                  { model: CurrentUser, as: 'receiver', attributes: ['id', 'name', 'user_name', 'main_image'] },
                ],
                order: [['createdAt', 'ASC']],
              },
              { model: CurrentUser, as: 'userOne', attributes: ['id', 'name', 'user_name', 'main_image', 'status', 'last_seen'] },
              { model: CurrentUser, as: 'userTwo', attributes: ['id', 'name', 'user_name', 'main_image', 'status', 'last_seen'] },
            ],
          });
          io.to(`conversation_${conversationId}`).emit('new_conversation', { conversation: fullConversation, message: plainMsg });
        } else {
          console.log(`[SOCKET] Emitting new_message event to conversation_${conversationId}`);
          io.to(`conversation_${conversationId}`).emit('new_message', plainMsg);
        }
        // Emit notification to receiver's user room
        if (fullMsg && (fullMsg as any).sender) {
          console.log(`[SOCKET] Emitting notification to user_${receiver_id}`);
          io.to(`user_${receiver_id}`).emit('notification', {
            sender_image: (fullMsg as any).sender.main_image,
            sender_name: (fullMsg as any).sender.name,
            message: fullMsg.message,
            file_type: fullMsg.file_url ? fullMsg.message_type : null,
            conversation_id: fullMsg.conversation_id,
            message_id: fullMsg.id,
          });
          // Emit updated unread count to receiver
          try {
            const unreadCount = await CurrentChatMessage.count({
              where: {
                receiver_id: receiver_id,
                is_read: false,
              },
            });
            io.to(`user_${receiver_id}`).emit('unread_count', { count: unreadCount, hasUnread: unreadCount > 0 });
          } catch (err) {
            console.error('Failed to fetch unread count for receiver:', err);
          }
        }
      } catch (err) {
        console.error(`[SOCKET ERROR] send_message error for user ${userId}:`, err);
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
      // Enhanced bulk mark as read
      // Accepts conversation_id, marks all unread messages as read for this user in the conversation
      // Emits messages_read and updates unread count, supports callback
      const userId = socket.data.user.id;
      // Accept both messageId (legacy) and conversation_id (bulk)
      if (typeof arguments[0] === 'object' && arguments[0].conversation_id) {
        const { conversation_id } = arguments[0];
        const callback = typeof arguments[1] === 'function' ? arguments[1] : undefined;
        try {
          // Mark all unread messages as read for this user in the conversation
          const [updatedCount] = await ChatMessage.update(
            { is_read: true },
            {
              where: {
                conversation_id,
                receiver_id: userId,
                is_read: false,
                deleted_by: { [Op.not]: { [Op.contains]: [userId] } },
              },
            }
          );
          // Optionally, fetch all message IDs that were updated
          const updatedMessages = await ChatMessage.findAll({
            where: {
              conversation_id,
              receiver_id: userId,
              is_read: true,
            },
            attributes: ['id'],
          });
          const messageIds = updatedMessages.map(msg => msg.id);
          // Emit to all clients in the conversation
          io.to(`conversation_${conversation_id}`).emit('messages_read', { conversation_id, userId, messageIds });
          // Update unread count for the user
          const unreadCount = await ChatMessage.count({
            where: {
              receiver_id: userId,
              is_read: false,
              deleted_by: { [Op.not]: { [Op.contains]: [userId] } },
            },
          });
          io.to(`user_${userId}`).emit('unread_count', { count: unreadCount, hasUnread: unreadCount > 0 });
          callback && callback({ success: true, data: { updatedCount, messageIds } });
        } catch (err) {
          console.error('Bulk mark_read error:', err);
          callback && callback({ success: false, error: err as any });
        }
      } else {
        // Legacy: mark a single message as read
        const messageId = arguments[0]?.messageId || arguments[0];
        const msg = await ChatMessage.findByPk(messageId);
        if (msg && msg.receiver_id === userId) {
          msg.is_read = true;
          await msg.save();
          io.to(`conversation_${msg.conversation_id}`).emit('message_read', { messageId, userId });
        }
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