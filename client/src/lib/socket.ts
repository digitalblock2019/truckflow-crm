"use client";

import { io, Socket } from "socket.io-client";
import { useAuthStore } from "./auth";

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

export function connectSocket(): Socket {
  if (socket?.connected) return socket;

  const token = useAuthStore.getState().tokens?.access_token;
  if (!token) throw new Error("No auth token");

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";

  socket = io(apiUrl, {
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
