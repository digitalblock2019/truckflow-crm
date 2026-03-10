"use client";

import { useConversations } from "@/lib/hooks";
import { useAuthStore } from "@/lib/auth";
import { useChatStore } from "@/lib/chatStore";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";

export default function ChatWindow() {
  const { data: conversations } = useConversations();
  const userId = useAuthStore((s) => s.user?.id) ?? "";
  const userRole = useAuthStore((s) => s.user?.role) ?? "";
  const activeConversationId = useChatStore((s) => s.activeConversationId);

  const conversation = (conversations ?? []).find((c) => c.id === activeConversationId);

  if (!activeConversationId || !conversation) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-surface">
        <div className="w-16 h-16 rounded-full bg-blue/10 flex items-center justify-center mb-4">
          <span className="text-[28px]">{"\u{1F4AC}"}</span>
        </div>
        <h3 className="text-[15px] font-semibold text-navy mb-1">Start a Conversation</h3>
        <p className="text-[12px] text-txt-light max-w-[240px] text-center">
          Select a conversation from the sidebar or create a new one to get started.
        </p>
      </div>
    );
  }

  // For announcements, only admins can post
  const canPost = conversation.type === "announcement"
    ? conversation.is_admin
    : true;

  return (
    <div className="flex-1 flex flex-col bg-surface min-w-0">
      <ChatHeader conversation={conversation} userId={userId} />
      <MessageList conversationId={activeConversationId} conversation={conversation} userId={userId} />
      <MessageInput conversationId={activeConversationId} canPost={canPost} />
    </div>
  );
}
