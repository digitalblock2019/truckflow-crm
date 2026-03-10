import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { query } from './database';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

interface AuthUser {
  id: string;
  role: string;
  email: string;
}

// In-memory presence: userId -> Set of socketIds
const presenceMap = new Map<string, Set<string>>();
// Socket -> userId mapping
const socketUserMap = new Map<string, string>();

let io: Server;

export function initSocket(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.APP_URL || 'http://localhost:3001',
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // JWT auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      const payload = jwt.verify(token, JWT_SECRET) as AuthUser & { iat: number; exp: number };
      (socket as any).user = { id: payload.id, role: payload.role, email: payload.email };
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket: Socket) => {
    const user: AuthUser = (socket as any).user;
    if (!user) return socket.disconnect();

    // Track presence
    if (!presenceMap.has(user.id)) {
      presenceMap.set(user.id, new Set());
    }
    presenceMap.get(user.id)!.add(socket.id);
    socketUserMap.set(socket.id, user.id);

    // Update last_seen_at
    await query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [user.id]).catch(() => {});

    // Join rooms for all user's conversations
    const convos = await query(
      'SELECT conversation_id FROM chat_members WHERE user_id = $1 AND left_at IS NULL',
      [user.id]
    ).catch(() => ({ rows: [] }));

    for (const row of convos.rows) {
      socket.join(`conv:${row.conversation_id}`);
    }

    // Broadcast user coming online
    io.emit('presence:online', { userId: user.id });

    // Typing events
    socket.on('typing:start', (data: { conversationId: string }) => {
      socket.to(`conv:${data.conversationId}`).emit('typing:start', {
        conversationId: data.conversationId,
        userId: user.id,
        userName: '', // Client fills from cache
      });
    });

    socket.on('typing:stop', (data: { conversationId: string }) => {
      socket.to(`conv:${data.conversationId}`).emit('typing:stop', {
        conversationId: data.conversationId,
        userId: user.id,
      });
    });

    // Disconnect
    socket.on('disconnect', async () => {
      socketUserMap.delete(socket.id);
      const sockets = presenceMap.get(user.id);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          presenceMap.delete(user.id);
          // User fully offline
          await query('UPDATE users SET last_seen_at = NOW() WHERE id = $1', [user.id]).catch(() => {});
          io.emit('presence:offline', { userId: user.id });
        }
      }
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

export function emitToConversation(conversationId: string, event: string, data: any) {
  if (io) {
    io.to(`conv:${conversationId}`).emit(event, data);
  }
}

export function emitToUser(userId: string, event: string, data: any) {
  const sockets = presenceMap.get(userId);
  if (sockets && io) {
    for (const socketId of sockets) {
      io.to(socketId).emit(event, data);
    }
  }
}

export function getOnlineUsers(): string[] {
  return Array.from(presenceMap.keys());
}

export function joinConversationRoom(conversationId: string, userId: string) {
  const sockets = presenceMap.get(userId);
  if (sockets && io) {
    for (const socketId of sockets) {
      const socket = io.sockets.sockets.get(socketId);
      socket?.join(`conv:${conversationId}`);
    }
  }
}
