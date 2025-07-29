import { Router } from 'express';
import { getUsers, getJwt, updateAllowNotification } from '../controllers/userController';

const router = Router();

router.get('/', getUsers); 
router.put('/update-allow-notification', updateAllowNotification);
export default router;