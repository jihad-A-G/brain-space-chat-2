import { Request, Response } from 'express';
import { ChatConversation } from '../models/ChatConversation';
import { ChatMessage } from '../models/ChatMessage';
import { User } from '../models/User';
import { Op } from 'sequelize';
import { getIO } from '../server';

// Fetch all chats for the user, sorted by last message
export async function fetchChats(req: Request, res: Response) {
  try {
    // @ts-ignore
    const userId = req.user.id;
    // Find all conversations where user is user_one or user_two
    const conversations = await ChatConversation.findAll({
      where: {
        [Op.or]: [
          { user_one: userId },
          { user_two: userId },
        ],
      },
      include: [
        {
          model: ChatMessage,
          limit: 1,
          order: [['createdAt', 'DESC']],
        },
        {
          model: User,
          as: 'userOne',
          attributes: ['id', 'name', 'user_name', 'main_image', 'status', 'last_seen'],
        },
        {
          model: User,
          as: 'userTwo',
          attributes: ['id', 'name', 'user_name', 'main_image', 'status', 'last_seen'],
        },
      ],
    });

    if( conversations.length === 0 ) {
      return res.status(404).json({ message: 'No conversations found' });
    }
    // Sort by last message createdAt desc
    const sorted = conversations.sort((a: any, b: any) => {
      const aMsg = a.ChatMessages[0];
      const bMsg = b.ChatMessages[0];
      if (!aMsg && !bMsg) return 0;
      if (!aMsg) return 1;
      if (!bMsg) return -1;
      return bMsg.createdAt - aMsg.createdAt;
    });
    res.json(sorted);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching chats', error: err });
  }
}

// Fetch a specific chat (conversation) and its messages
export async function fetchChat(req: Request, res: Response) {
  try {
    // @ts-ignore
    const userId = req.user.id;
    const { conversationId } = req.params;
    const conversation = await ChatConversation.findByPk(conversationId, {
      include: [
        {
          model: ChatMessage,
          where: {
            deleted_by: {
              [Op.notILike]: `%${userId}%`,
            },
          },
          required: false,
          include: [
            { model: User, as: 'sender', attributes: ['id', 'name', 'user_name', 'main_image'] },
            { model: User, as: 'receiver', attributes: ['id', 'name', 'user_name', 'main_image'] },
          ],
          order: [['createdAt', 'ASC']],
        },
        { model: User, as: 'userOne', attributes: ['id', 'name', 'user_name', 'main_image'] },
        { model: User, as: 'userTwo', attributes: ['id', 'name', 'user_name', 'main_image'] },
      ],
    });
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    res.json(conversation);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching chat', error: err });
  }
}

// Send a message (with optional attachment)
export async function sendMessage(req: Request, res: Response) {
  try {
    // @ts-ignore
    const userId = req.user.id;
    let { conversationId } = req.params;
    const { message, receiver_id, message_type } = req.body;
    let file_url = null, file_name = null, file_extension = null, file_size = null;
    if (req.file) {
      file_url = `/uploads/${req.file.filename}`;
      file_name = req.file.originalname;
      file_extension = req.file.originalname.split('.').pop();
      file_size = req.file.size.toString();
    }
    let conversation;
    // If conversationId is not provided or invalid, find or create a conversation
    if (!conversationId || conversationId === 'undefined' || conversationId === 'null') {
      conversation = await ChatConversation.findOne({
        where: {
          [Op.or]: [
            { user_one: userId, user_two: receiver_id },
            { user_one: receiver_id, user_two: userId }
          ]
        }
      });
      if (!conversation) {
        conversation = await ChatConversation.create({
          user_one: userId,
          user_two: receiver_id
        });
      }
      conversationId = conversation.id.toString();
    } else {
      conversation = await ChatConversation.findByPk(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: 'Conversation not found' });
      }
    }
    const msg = await ChatMessage.create({
      conversation_id: conversationId,
      sender_id: userId,
      receiver_id,
      message: message || '',
      message_type: message_type || (req.file ? req.file.mimetype.split('/')[0] : 'text'),
      file_url,
      file_name,
      file_extension,
      file_size,
      is_read: false,
      deleted_by: [],
    });
    const fullMsg = await ChatMessage.findByPk(msg.id, {
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'user_name', 'main_image'] },
        { model: User, as: 'receiver', attributes: ['id', 'name', 'user_name', 'main_image'] },
      ],
    });
    // Emit socket event for new message
    getIO().to(`conversation_${conversationId}`).emit('new_message', fullMsg);
    res.status(201).json(fullMsg);
  } catch (err) {
    res.status(500).json({ message: 'Error sending message', error: err });
  }
}

// Edit a message
export async function editMessage(req: Request, res: Response) {
  try {
    // @ts-ignore
    const userId = req.user.id;
    const { messageId } = req.params;
    const { message } = req.body;
    const msg = await ChatMessage.findByPk(messageId);
    if (!msg) return res.status(404).json({ message: 'Message not found' });
    if (msg.sender_id !== userId) return res.status(403).json({ message: 'Not allowed' });
    if (msg.deleted_by.includes(userId)) return res.status(403).json({ message: 'Message already deleted by you' });
    msg.message = message;
    await msg.save();
    const fullMsg = await ChatMessage.findByPk(msg.id, {
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'user_name', 'main_image'] },
        { model: User, as: 'receiver', attributes: ['id', 'name', 'user_name', 'main_image'] },
      ],
    });
    // Emit socket event for message edited
    getIO().to(`conversation_${msg.conversation_id}`).emit('message_edited', { messageId, message });
    res.json(fullMsg);
  } catch (err) {
    res.status(500).json({ message: 'Error editing message', error: err });
  }
}

// Delete a message (from one or both sides)
export async function deleteMessage(req: Request, res: Response) {
  try {
    // @ts-ignore
    const userId = req.user.id;
    const { messageId } = req.params;
    const msg = await ChatMessage.findByPk(messageId);
    if (!msg) return res.status(404).json({ message: 'Message not found' });
    // If sender deletes and receiver hasn't read, delete from DB
    if (msg.sender_id === userId && !msg.is_read) {
      await msg.destroy();
      // Emit socket event for message deleted (both sides)
      getIO().to(`conversation_${msg.conversation_id}`).emit('message_deleted', { messageId, both: true });
      return res.json({ message: 'Message deleted for both sides' });
    }
    // Otherwise, add user to deleted_by
    if (!msg.deleted_by.includes(userId)) {
      msg.deleted_by = [...msg.deleted_by, userId];
      await msg.save();
    }
    // Emit socket event for message deleted (one side)
    getIO().to(`conversation_${msg.conversation_id}`).emit('message_deleted', { messageId, both: false, userId });
    res.json({ message: 'Message deleted from your side' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting message', error: err });
  }
}

// Delete all chat messages from user's side
export async function deleteChatMessages(req: Request, res: Response) {
  try {
    // @ts-ignore
    const userId = req.user.id;
    const { conversationId } = req.params;
    // Find all messages in the conversation sent or received by the user
    const messages = await ChatMessage.findAll({
      where: {
        conversation_id: conversationId,
        [Op.or]: [
          { sender_id: userId },
          { receiver_id: userId },
        ],
      },
    });
    if (!messages.length) return res.status(404).json({ message: 'No messages found' });
    for (const msg of messages) {
      if (!msg.deleted_by.includes(userId)) {
        msg.deleted_by = [...msg.deleted_by, userId];
        await msg.save();
      }
    }
    res.json({ message: 'All your messages in this chat deleted from your side' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting chat messages', error: err });
  }
}

const ALLOWED_STATUSES = ['online', 'busy', 'offline', 'away'];

export async function changeStatus(req: Request, res: Response) {
  try {
    // @ts-ignore
    const userId = req.user.id;
    const { status } = req.body;
    if (!ALLOWED_STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    const user = await User.findByPk(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.status = status;
    await user.save();
    // Emit socket event for status change
    getIO().emit('user_status_changed', { userId, status });
    res.json({ message: 'Status updated', user });
  } catch (err) {
    res.status(500).json({ message: 'Error updating status', error: err });
  }
}

export async function bulkMarkAsRead(req: Request, res: Response) {
  try {
    // @ts-ignore
    const userId = req.user.id;
    const { conversationId } = req.body;
    // Mark all unread messages in this conversation as read for this user (receiver)
    await ChatMessage.update(
      { is_read: true },
      {
        where: {
          conversation_id: conversationId,
          receiver_id: userId,
          is_read: false,
        },
      }
    );
    // Return updated messages
    const updatedMessages = await ChatMessage.findAll({
      where: {
        conversation_id: conversationId,
        receiver_id: userId,
        is_read: true,
      },
    });
    // Emit socket event for each message read
    const io = getIO();
    for (const msg of updatedMessages) {
      io.to(`conversation_${conversationId}`).emit('message_read', { messageId: msg.id, userId });
    }
    res.json({ success: true, updatedMessages });
  } catch (err) {
    res.status(500).json({ message: 'Error marking messages as read', error: err });
  }
} 