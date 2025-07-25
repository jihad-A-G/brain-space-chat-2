import { Request, Response } from 'express';
import { Op, Sequelize } from 'sequelize';
import { getIO } from '../server';
import fs from 'fs';
import path from 'path';

// Fetch all chats for the user, sorted by last message
export async function fetchChats(req: Request, res: Response) {
  try {
    // @ts-ignore
    const userId = req.user.id;
    // @ts-ignore
    const { ChatConversation, ChatMessage, User } = req.tenant.models;
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
          required: false,
          where: Sequelize.literal(`NOT JSON_CONTAINS(\`ChatMessages\`.\`deleted_by\`, '[${userId}]')`),
          order: [['createdAt', 'ASC']],
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
    // Filter out conversations where all messages are deleted for the user
    const filtered = conversations.filter((conv: any) => {
      if (!conv.ChatMessages || conv.ChatMessages.length === 0) return false;
      // At least one message is not deleted for the user
      return conv.ChatMessages.length > 0;
    });
    // Sort by last message createdAt desc
    const sorted = filtered.sort((a: any, b: any) => {
      // Use the last message in each conversation for sorting
      const aMsgs = a.ChatMessages;
      const bMsgs = b.ChatMessages;
      const aLastMsg = aMsgs && aMsgs.length > 0 ? aMsgs[aMsgs.length - 1] : null;
      const bLastMsg = bMsgs && bMsgs.length > 0 ? bMsgs[bMsgs.length - 1] : null;
      if (!aLastMsg && !bLastMsg) return 0;
      if (!aLastMsg) return 1;
      if (!bLastMsg) return -1;
      return new Date(bLastMsg.createdAt).getTime() - new Date(aLastMsg.createdAt).getTime();
    });
    // Transform to use 'me' and 'other'
    const transformed = sorted.map((conv: any) => {
      let me, other;
      if (conv.userOne.id === userId) {
        me = conv.userOne;
        other = conv.userTwo;
      } else {
        me = conv.userTwo;
        other = conv.userOne;
      }
      const convObj = conv.toJSON();
      return {
        ...convObj,
        me,
        other,
        userOne: undefined,
        userTwo: undefined,
      };
    });
    res.json(transformed);
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
    // @ts-ignore
    const { ChatConversation, ChatMessage, User } = req.tenant.models;
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
  console.log("And here");
  try {
    // @ts-ignore
    const userId = req.user.id;
    let { conversationId } = req.params;
    const { message, receiver_id, message_type,reply } = req.body;
    console.log("receiver_id", receiver_id);
    console.log("conversationId", conversationId);
    let file_url = null, file_name = null, file_extension = null, file_size = null;
    if (req.file) {
      file_url = `/uploads/${req.file.filename}`;
      file_name = req.file.originalname;
      file_extension = req.file.originalname.split('.').pop();
      file_size = req.file.size.toString();
    }
    let conversation;
    let isNewConversation = false;
    // @ts-ignore
    const { ChatConversation, ChatMessage, User } = req.tenant.models;
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
      isNewConversation = true;
    }
    const msg = await ChatMessage.create({
      conversation_id: conversation.id,
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
      reply: reply || null
    });
    const fullMsg = await ChatMessage.findByPk(msg.id, {
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'user_name', 'main_image'] },
        { model: User, as: 'receiver', attributes: ['id', 'name', 'user_name', 'main_image'] },
      ],
    });
    if (isNewConversation) {
      // Fetch the full conversation object with users and messages
      const fullConversation = await ChatConversation.findByPk(conversation.id, {
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
      getIO().to(`conversation_${conversation.id}`).emit('new_conversation', { conversation: fullConversation, message: fullMsg });
    } else {
      // Emit socket event for new message
      getIO().to(`conversation_${conversation.id}`).emit('new_message', fullMsg);
    }
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
    // @ts-ignore
    const { ChatMessage, User } = req.tenant.models;
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
    // @ts-ignore
    const { ChatMessage } = req.tenant.models;
    const msg = await ChatMessage.findByPk(messageId);
    if (!msg) return res.status(404).json({ message: 'Message not found' });
    // If sender deletes and receiver hasn't read, delete from DB
    if (msg.sender_id === userId && !msg.is_read) {
      // Delete file if exists
      if (msg.file_url) {
        const filePath = path.join(__dirname, '../../', msg.file_url);
        fs.unlink(filePath, (err) => {
          if (err) {
            console.error('Failed to delete file:', filePath, err);
          }
        });
      }
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
    // @ts-ignore
    const { ChatMessage } = req.tenant.models;
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
    // @ts-ignore
    const { User } = req.tenant.models;
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
    // @ts-ignore
    const { ChatMessage } = req.tenant.models;
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

export async function createChat(req: Request, res: Response) {
  try {
    const { user_one, user_two } = req.body;
    if (!user_one || !user_two) {
      return res.status(400).json({ message: 'user_one and user_two are required' });
    }
    // @ts-ignore
    const { ChatConversation } = req.tenant.models;
    // Check if a conversation already exists
    let conversation = await ChatConversation.findOne({
      where: {
        [Op.or]: [
          { user_one, user_two },
          { user_one: user_two, user_two: user_one }
        ]
      }
    });
    if (conversation) {
      return res.status(200).json({ message: 'Conversation already exists', conversation });
    }
    conversation = await ChatConversation.create({ user_one, user_two });
    res.status(201).json({ message: 'Conversation created', conversation });
  } catch (err) {
    res.status(500).json({ message: 'Error creating conversation', error: err });
  }
}

// Delete a conversation for a user (one-sided)
export async function deleteChatForUser(req: Request, res: Response) {
  try {
    // @ts-ignore
    const userId = req.user.id;
    const { conversationId } = req.params;
    // @ts-ignore
    const { ChatConversation, ChatMessage } = req.tenant.models;
    // Find the conversation
    const conversation = await ChatConversation.findByPk(conversationId);
    if (!conversation) return res.status(404).json({ message: 'Conversation not found' });
    // Find all messages in the conversation
    const messages = await ChatMessage.findAll({
      where: { conversation_id: conversationId },
    });
    if (!messages.length) return res.status(404).json({ message: 'No messages found' });
    // Mark all messages as deleted for this user
    for (const msg of messages) {
      if (!msg.deleted_by.includes(userId)) {
        msg.deleted_by = [...msg.deleted_by, userId];
        await msg.save();
      }
    }
    // Check if all messages are deleted by both users
    const userIds = [conversation.user_one, conversation.user_two].map(String);
    const allDeleted = messages.every((msg: any) =>
      userIds.every((uid) => msg.deleted_by.includes(uid))
    );
    if (allDeleted) {
      // Physically delete all messages and the conversation
      await ChatMessage.destroy({ where: { conversation_id: conversationId } });
      await ChatConversation.destroy({ where: { id: conversationId } });
      return res.json({ message: 'Conversation and all messages permanently deleted' });
    }
    res.json({ message: 'Conversation deleted for user' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting conversation', error: err });
  }
}

// Notify users endpoint: supports type 'role', 'user', and 'broadcast'
export async function notifyUsers(req: Request, res: Response) {
  try {
    // @ts-ignore
    const { type, role, userIds, notification } = req.body;
    const io = getIO();

    if (!type || !notification) {
      return res.status(400).json({ message: 'type and notification are required' });
    }

    if (type === 'role') {
      if (!role) return res.status(400).json({ message: 'role is required for role notifications' });
      // Find all users with this role
        io.to(`role_${role}`).emit('php_notification', notification); // Also emit to role room
    
      return res.json({ success: true, notified: role });
    }

    if (type === 'user') {
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({ message: 'userIds array is required for user notifications' });
      }
      userIds.forEach((id: number) => {
        io.to(`user_${id}`).emit('php_notification', notification);
      });
      return res.json({ success: true, notified: userIds });
    }

    if (type === 'broadcast') {
      io.emit('php_notification', notification);
      return res.json({ success: true, notified: 'all' });
    }

    return res.status(400).json({ message: 'Invalid type' });
  } catch (err) {
    res.status(500).json({ message: 'Error sending notification', error: err });
  }
}
