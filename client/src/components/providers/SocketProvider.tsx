"use client";

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { connectSocket, disconnectSocket } from "@/lib/socket";
import { useChatStore } from "@/lib/chatStore";
import { useAuthStore } from "@/lib/auth";
import { useConversations } from "@/lib/hooks";

// Notification sound using Web Audio API
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
    osc.type = "sine";
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
    // Second beep
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.setValueAtTime(1100, ctx.currentTime + 0.15); // C#6
    osc2.type = "sine";
    gain2.gain.setValueAtTime(0.12, ctx.currentTime + 0.15);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
    osc2.start(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.45);
  } catch {
    // Audio not available
  }
}

export default function SocketProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.tokens?.access_token);
  const userId = useAuthStore((s) => s.user?.id);
  const { setOnlineUsers, addOnlineUser, removeOnlineUser, setTyping } = useChatStore();
  const activeConvoRef = useRef<string | null>(null);

  // Keep active conversation ref in sync
  useEffect(() => {
    return useChatStore.subscribe((state) => {
      activeConvoRef.current = state.activeConversationId;
    });
  }, []);

  // Compute total unread from conversations
  const { data: conversations } = useConversations();
  useEffect(() => {
    if (conversations) {
      const total = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
      useChatStore.getState().setTotalUnread(total);
      if (total > 0) {
        document.title = `(${total}) TruckFlow CRM`;
      } else {
        document.title = "TruckFlow CRM";
      }
    }
  }, [conversations]);

  useEffect(() => {
    if (!token) return;

    try {
      const socket = connectSocket();

      // Fetch initial presence
      fetch(`${process.env.NEXT_PUBLIC_API_URL || ""}/api/chat/presence`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.json())
        .then((data) => setOnlineUsers(data.online || []))
        .catch(() => {});

      socket.on("presence:online", ({ userId: uid }: { userId: string }) => {
        addOnlineUser(uid);
      });

      socket.on("presence:offline", ({ userId: uid }: { userId: string }) => {
        removeOnlineUser(uid);
      });

      socket.on("message:new", (msg: any) => {
        qc.invalidateQueries({ queryKey: ["messages", msg.conversation_id] });
        qc.invalidateQueries({ queryKey: ["conversations"] });
        // Play sound if message is from someone else
        if (msg.sender_id !== userId) {
          playNotificationSound();
        }
      });

      socket.on("message:edited", () => {
        qc.invalidateQueries({ queryKey: ["messages"] });
      });

      socket.on("message:deleted", () => {
        qc.invalidateQueries({ queryKey: ["messages"] });
      });

      socket.on("message:attachment", () => {
        qc.invalidateQueries({ queryKey: ["messages"] });
      });

      socket.on("reaction:added", () => {
        qc.invalidateQueries({ queryKey: ["messages"] });
      });

      socket.on("reaction:removed", () => {
        qc.invalidateQueries({ queryKey: ["messages"] });
      });

      socket.on("read:update", () => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
      });

      socket.on("conversation:new", () => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
      });

      socket.on("conversation:updated", () => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
      });

      socket.on("conversation:deleted", () => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
      });

      socket.on("conversation:removed", () => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
      });

      socket.on("members:added", () => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
        qc.invalidateQueries({ queryKey: ["conversation-members"] });
      });

      socket.on("members:removed", () => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
        qc.invalidateQueries({ queryKey: ["conversation-members"] });
      });

      socket.on("member:promoted", () => {
        qc.invalidateQueries({ queryKey: ["conversation-members"] });
      });

      socket.on("typing:start", ({ conversationId, userId: uid }: { conversationId: string; userId: string }) => {
        if (uid !== userId) setTyping(conversationId, uid, true);
      });

      socket.on("typing:stop", ({ conversationId, userId: uid }: { conversationId: string; userId: string }) => {
        setTyping(conversationId, uid, false);
      });

      return () => {
        disconnectSocket();
      };
    } catch {
      // Socket connection failed, app still works via REST
    }
  }, [token]);

  return <>{children}</>;
}
