"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { connectSocket, disconnectSocket, getSocket } from "@/lib/socket";
import { useChatStore } from "@/lib/chatStore";
import { useAuthStore } from "@/lib/auth";
import { useConversations } from "@/lib/hooks";

export default function SocketProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.tokens?.access_token);
  const userId = useAuthStore((s) => s.user?.id);
  const { setOnlineUsers, addOnlineUser, removeOnlineUser, setTyping, activeConversationId } = useChatStore();
  const activeConvoRef = useRef(activeConversationId);
  activeConvoRef.current = activeConversationId;

  // Compute total unread from conversations
  const { data: conversations } = useConversations();
  useEffect(() => {
    if (conversations) {
      const total = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);
      useChatStore.getState().setTotalUnread(total);
      // Update browser title
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
      });

      socket.on("message:edited", ({ messageId }: { messageId: string }) => {
        qc.invalidateQueries({ queryKey: ["messages"] });
      });

      socket.on("message:deleted", ({ messageId }: { messageId: string }) => {
        qc.invalidateQueries({ queryKey: ["messages"] });
      });

      socket.on("message:attachment", () => {
        qc.invalidateQueries({ queryKey: ["messages"] });
      });

      socket.on("reaction:added", (data: any) => {
        qc.invalidateQueries({ queryKey: ["messages"] });
      });

      socket.on("reaction:removed", (data: any) => {
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
