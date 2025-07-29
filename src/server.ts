import http from 'http';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import './models/User';
import './models/ChatConversation';
import './models/ChatMessage';
import './models/ChatBlockedUser';
import './models/ChatDeletedMessage';
import { chatSocket, getTenantConnection } from './sockets/chat';
import userRoutes from './routes/user';
import chatRoutes from './routes/chat';
import dotenv from 'dotenv';
import  authMiddleware  from './middlewares/auth';
import jwt from 'jsonwebtoken';
import path from 'path';
import { broadcastRefresh, notifyUsers } from './controllers/chatController';
import { getJwt } from './controllers/userController';
import tenantSequelizeMiddleware from './middlewares/tenantSequelize';
dotenv.config();
//Welcome to test the script

const PORT = process.env.PORT || 8083;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';

const app = express();

app.set("trust proxy", 1); // 👈 TRUST FIRST PROXY

const allowedDomain = 'brain-space.app';

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, false); // block non-browser tools
    try {
      const url = new URL(origin);
      const hostname = url.hostname;
      console.log(`[CORS DEBUG] Origin: ${origin}, Hostname: ${hostname}`);
      
      if (
        hostname === allowedDomain ||
        hostname.endsWith(`${allowedDomain}`) ||
        hostname === 'brain-space2.vercel.app' ||
        hostname === 'localhost' ||
        hostname === '127.0.0.1'
      ) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    } catch (e) {
      callback(new Error('Invalid origin'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-tenant-subdomain'],
  credentials: true
}));
app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});
app.use(tenantSequelizeMiddleware);
app.post('/api/notify', notifyUsers);
app.post('/api/users/jwt', getJwt);
app.post('/api/broadcast-refresh', broadcastRefresh)
app.use(authMiddleware);
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);

let ioInstance: SocketIOServer | null = null;

(async () => {
  try {
    const server = http.createServer(app);
   const io = new SocketIOServer(server, {
    path: '/socket.io',
  connectTimeout: 45000,
  pingTimeout: 20000,
  pingInterval: 25000,
  transports: ["websocket"], // 👈 Try websocket first
  allowUpgrades: true, // 👈 Allow upgrades from polling to websocket
  perMessageDeflate: {
    threshold: 1024,
    concurrency: 10
  },
  httpCompression: true,
  cors: {
    origin: '*',
    methods: ["GET", "POST", "OPTIONS", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["content-type", "authorization", "x-tenant-subdomain"],
    credentials: true
  },
  cookie: {
    name: "io",
    path: "/",
    httpOnly: true,
    sameSite: "none",
    secure: true
  }
});

// Add this error handler
io.engine.on("connection_error", (err) => {
  console.error("WebSocket error:", err.req.headers, err.message, err.context);
});
    ioInstance = io;

    // Token auth middleware for Socket.IO (no JWT, check User table)
    io.use(async (socket, next) => {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }
      try {
        // Ensure tenant DB connection is established before checking token
        const tenantConn = await getTenantConnection(socket);
        if (!tenantConn || !tenantConn.sequelize) {
          console.error('[Socket Auth] Tenant DB connection not established for socket:', socket.id);
          return next(new Error('Authentication error: Tenant DB not connected'));
        }
        // Optionally, check connection state
        try {
          await tenantConn.sequelize.authenticate();
        } catch (dbErr) {
          console.error('[Socket Auth] DB authenticate() failed:', dbErr);
          return next(new Error('Authentication error: DB not connected'));
        }
        const { models } = tenantConn;
        const user = await models.User.findOne({ where: { token } });
        if (!user) {
          return next(new Error('Authentication error: Invalid token'));
        }
        socket.data.user = user;
        next();
      } catch (err) {
        console.error('[Socket Auth] Unexpected error:', err);
        next(new Error('Authentication error: DB error'));
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

//Testing git cron chat 2