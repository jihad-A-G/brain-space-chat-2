import { Server, Socket } from 'socket.io';
import { ChatMessage } from '../models/ChatMessage';
import { User } from '../models/User';
import { ChatConversation } from '../models/ChatConversation';

const onlineUsers = new Map<string, string>(); 
const messageTimestamps = new Map<string, number[]>(); 

export function chatSocket(io: Server) {
  io.on('connection', (socket: Socket) => {
    // Join all rooms for this user
    socket.on('join', async ({ userId, conversationIds }) => {
      if (!userId) return;
      onlineUsers.set(userId, socket.id);
      if (Array.isArray(conversationIds)) {
        conversationIds.forEach((cid) => socket.join(`conversation_${cid}`));
      }
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
      const { sender_id } = data;
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
      // Save to DB, then emit to room
      const msg = await ChatMessage.create(data);
      const fullMsg = await ChatMessage.findByPk(msg.id, {
        include: [
          { model: User, as: 'sender', attributes: ['id', 'name', 'user_name', 'main_image'] },
          { model: User, as: 'receiver', attributes: ['id', 'name', 'user_name', 'main_image'] },
        ],
      });
      io.to(`conversation_${data.conversation_id}`).emit('new_message', fullMsg);
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
          break;
        }
      }
    });
  });
} 