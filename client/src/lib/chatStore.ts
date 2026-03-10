"use client";

import { create } from "zustand";

interface ChatState {
  activeConversationId: string | null;
  onlineUsers: Set<string>;
  typingUsers: Map<string, Set<string>>; // conversationId -> Set of userIds
  totalUnread: number;
  replyTo: { id: string; content: string; sender_name: string } | null;
  editingMessage: { id: string; content: string } | null;
  setActiveConversation: (id: string | null) => void;
  setOnlineUsers: (ids: string[]) => void;
  addOnlineUser: (id: string) => void;
  removeOnlineUser: (id: string) => void;
  setTyping: (conversationId: string, userId: string, isTyping: boolean) => void;
  setTotalUnread: (count: number) => void;
  setReplyTo: (msg: { id: string; content: string; sender_name: string } | null) => void;
  setEditingMessage: (msg: { id: string; content: string } | null) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  activeConversationId: null,
  onlineUsers: new Set(),
  typingUsers: new Map(),
  totalUnread: 0,
  replyTo: null,
  editingMessage: null,

  setActiveConversation: (id) => set({ activeConversationId: id, replyTo: null, editingMessage: null }),

  setOnlineUsers: (ids) => set({ onlineUsers: new Set(ids) }),

  addOnlineUser: (id) => {
    const s = new Set(get().onlineUsers);
    s.add(id);
    set({ onlineUsers: s });
  },

  removeOnlineUser: (id) => {
    const s = new Set(get().onlineUsers);
    s.delete(id);
    set({ onlineUsers: s });
  },

  setTyping: (conversationId, userId, isTyping) => {
    const map = new Map(get().typingUsers);
    const users = new Set(map.get(conversationId) || []);
    if (isTyping) users.add(userId);
    else users.delete(userId);
    if (users.size === 0) map.delete(conversationId);
    else map.set(conversationId, users);
    set({ typingUsers: map });
  },

  setTotalUnread: (count) => set({ totalUnread: count }),

  setReplyTo: (msg) => set({ replyTo: msg, editingMessage: null }),

  setEditingMessage: (msg) => set({ editingMessage: msg, replyTo: null }),
}));
