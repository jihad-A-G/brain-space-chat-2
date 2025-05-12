import http from 'http';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import sequelize from './config/db-connection';
import cors from 'cors';
import { setupAssociations } from './models/associations';
import './models/User';
import './models/ChatConversation';
import './models/ChatMessage';
import './models/ChatBlockedUser';
import './models/ChatDeletedMessage';
import jwt from 'jsonwebtoken';
import { chatSocket } from './sockets/chat';
import userRoutes from './routes/user';
import chatRoutes from './routes/chat';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);


setupAssociations();

sequelize.sync()
  .then(() => {
    console.log('Database synced');
    const server = http.createServer(app);
    const io = new SocketIOServer(server, {
      cors: {
        origin: '*',
      },
    });

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
    module.exports.io = io;
  })
  .catch((err) => {
    console.error('DB sync error:', err);
  }); 