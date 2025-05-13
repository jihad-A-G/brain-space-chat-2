import { Router } from 'express';
import { getUsers, getJwt } from '../controllers/userController';

const router = Router();

router.get('/', getUsers);  
router.post('/jwt', getJwt);

export default router;