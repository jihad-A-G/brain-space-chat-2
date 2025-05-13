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

router.get('/', fetchChats);
router.get('/:conversationId', fetchChat);
router.post('/:conversationId/message', upload.single('file'), sendMessage);
router.patch('/messages/:messageId', editMessage);
router.delete('/messages/:messageId', deleteMessage);
router.delete('/:conversationId/messages', deleteChatMessages);
router.patch('/user/status', changeStatus);
router.put('/messages/mark-read', bulkMarkAsRead);

export default router; 