import http from 'http';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import './models/User';
import './models/ChatConversation';
import './models/ChatMessage';
import './models/ChatBlockedUser';
import './models/ChatDeletedMessage';
import { chatSocket } from './sockets/chat';
import userRoutes from './routes/user';
import chatRoutes from './routes/chat';
import dotenv from 'dotenv';
import { authenticateJWT } from './middlewares/auth';
import jwt from 'jsonwebtoken';
import path from 'path';
import { notifyUsers } from './controllers/chatController';
import { getJwt } from './controllers/userController';
import tenantSequelizeMiddleware from './middlewares/tenantSequelize';
dotenv.config();
//Welcome to test the script

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
app.use(tenantSequelizeMiddleware);
app.post('/api/notify', notifyUsers);
app.post('/api/users/jwt', getJwt);
app.use(authenticateJWT);
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);

let ioInstance: SocketIOServer | null = null;

(async () => {
  try {
    const server = http.createServer(app);
    const io = new SocketIOServer(server, {
      cors: {
        origin: '*',
      },
    });
    ioInstance = io;

    // JWT auth middleware for Socket.IO
    io.use((socket, next) => {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }
      try {
        const payload = jwt.verify(token, JWT_SECRET);
        socket.data.user = payload;
        next();
      } catch (err) {
        next(new Error('Authentication error: Invalid token'));
      }
    });

    // Pass io to chatSocket for event handling
    chatSocket(io);

    server.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('DB sync error:', err);
  }
})();

export function getIO() {
  if (!ioInstance) throw new Error('Socket.IO not initialized yet');
  return ioInstance;
}  