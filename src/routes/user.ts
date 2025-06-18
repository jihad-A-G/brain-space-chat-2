import { Router } from 'express';
import { getUsers, getJwt } from '../controllers/userController';

const router = Router();

router.get('/', getUsers);  
export default router;