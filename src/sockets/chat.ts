import { Server, Socket } from 'socket.io';
import { ChatMessage } from '../models/ChatMessage';
import { User } from '../models/User';
import { ChatConversation } from '../models/ChatConversation';
import { Op } from 'sequelize';

const onlineUsers = new Map<string, string>(); 
const messageTimestamps = new Map<string, number[]>(); 

export function chatSocket(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log(`Socket connected: ${socket.id}`);
    // Join all rooms for this user
    socket.on('join', async ({ userId, conversationIds }) => {
      if (!userId) return;
      onlineUsers.set(userId, socket.id);
      if (Array.isArray(conversationIds)) {
        conversationIds.forEach((cid) => {
          socket.join(`conversation_${cid}`);
          console.log(`User ${userId} joined room conversation_${cid}`);
        });
      }
      console.log(`User ${userId} joined. Socket: ${socket.id}`);
      // Notify contacts this user is online
      socket.broadcast.emit('user_online', { userId });
    });

    // Typing indicator
    socket.on('typing', ({ conversationId, userId }) => {
      socket.to(`conversation_${conversationId}`).emit('typing', { conversationId, userId });
    });
    socket.on('stop_typing', ({ conversationId, userId }) => {
      socket.to(`conversation_${conversationId}`).emit('stop_typing', { conversationId, userId });
    });

    // Send message with rate limiting
    socket.on('send_message', async (data) => {
      const { sender_id, receiver_id } = data;
      console.log(`User ${sender_id} is sending a message to ${receiver_id}`);
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
      if (!conversationId || conversationId === 'undefined' || conversationId === 'null') {
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
          console.log(`Created new conversation between ${sender_id} and ${receiver_id}`);
        }
        conversationId = conversation.id.toString();
        data.conversation_id = conversationId;
      } else {
        conversation = await ChatConversation.findByPk(conversationId);
        if (!conversation) {
          socket.emit('error', { message: 'Conversation not found' });
          return;
        }
      }

      // Save to DB, then emit to room
      const msg = await ChatMessage.create(data);
      const fullMsg = await ChatMessage.findByPk(msg.id, {
        include: [
          { model: User, as: 'sender', attributes: ['id', 'name', 'user_name', 'main_image'] },
          { model: User, as: 'receiver', attributes: ['id', 'name', 'user_name', 'main_image'] },
        ],
      });
      io.to(`conversation_${data.conversation_id}`).emit('new_message', fullMsg);
      console.log(`Message sent in conversation_${data.conversation_id} by user ${sender_id}`);
    });

    // Edit message
    socket.on('edit_message', async ({ messageId, message, userId }) => {
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
    socket.on('delete_message', async ({ messageId, userId }) => {
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
    socket.on('mark_read', async ({ messageId, userId }) => {
      const msg = await ChatMessage.findByPk(messageId);
      if (msg && msg.receiver_id === userId) {
        msg.is_read = true;
        await msg.save();
        io.to(`conversation_${msg.conversation_id}`).emit('message_read', { messageId, userId });
      }
    });

    // User online (handled in join)
    socket.on('user_online', ({ userId }) => {
      onlineUsers.set(userId, socket.id);
      socket.broadcast.emit('user_online', { userId });
    });

    // User offline
    socket.on('disconnect', async () => {
      // Find userId by socketId
      for (const [userId, sid] of onlineUsers.entries()) {
        if (sid === socket.id) {
          onlineUsers.delete(userId);
          // Update last_seen in DB
          await User.update({ last_seen: new Date() }, { where: { id: userId } });
          socket.broadcast.emit('user_offline', { userId, last_seen: new Date() });
          console.log(`User ${userId} disconnected. Socket: ${socket.id}`);
          break;
        }
      }
    });

    // Change user status
    socket.on('change_status', async ({ userId, status }) => {
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
  });
} 