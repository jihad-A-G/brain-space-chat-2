import { Router } from 'express';
import {
  fetchChats,
  fetchChat,
  sendMessage,
  editMessage,
  deleteMessage,
  deleteChatMessages,
  changeStatus,
  bulkMarkAsRead,
} from '../controllers/chatController';
import { upload } from '../middlewares/upload';

const router = Router();

router.get('/chats', fetchChats);
router.get('/chats/:conversationId', fetchChat);
router.post('/chats/:conversationId/message', upload.single('file'), sendMessage);
router.patch('/messages/:messageId', editMessage);
router.delete('/messages/:messageId', deleteMessage);
router.delete('/chats/:conversationId/messages', deleteChatMessages);
router.patch('/user/status', changeStatus);
router.put('/messages/mark-read', bulkMarkAsRead);

export default router; 