"use client";

import { useEffect, useRef, useState } from "react";
import { useMessages, useOlderMessages, useMarkRead } from "@/lib/hooks";
import { useChatStore } from "@/lib/chatStore";
import type { ChatMessage, Conversation } from "@/types";
import MessageBubble from "./MessageBubble";

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Today";
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
}

interface Props {
  conversationId: string;
  conversation: Conversation;
  userId: string;
}

export default function MessageList({ conversationId, conversation, userId }: Props) {
  const { data, isLoading } = useMessages(conversationId);
  const [cursor, setCursor] = useState<string | null>(null);
  const { data: olderData } = useOlderMessages(conversationId, cursor);
  const [allMessages, setAllMessages] = useState<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessageCount = useRef(0);
  const markRead = useMarkRead();
  const typingUsers = useChatStore((s) => s.typingUsers);
  const typingHere = typingUsers.get(conversationId);

  // Merge messages from main query and older pages
  useEffect(() => {
    const msgs = data?.messages ?? [];
    setAllMessages(msgs);
    setCursor(null); // Reset cursor on conversation change
  }, [data]);

  useEffect(() => {
    if (olderData?.messages) {
      setAllMessages((prev) => {
        const ids = new Set(prev.map((m) => m.id));
        const newMsgs = olderData.messages.filter((m: ChatMessage) => !ids.has(m.id));
        return [...prev, ...newMsgs];
      });
    }
  }, [olderData]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (allMessages.length > prevMessageCount.current) {
      bottomRef.current?.scrollIntoView({ behavior: allMessages.length - prevMessageCount.current <= 2 ? "smooth" : "auto" });
    }
    prevMessageCount.current = allMessages.length;
  }, [allMessages.length]);

  // Mark as read when viewing
  useEffect(() => {
    if (conversationId) {
      markRead.mutate(conversationId);
    }
  }, [conversationId, allMessages.length]);

  // Infinite scroll up
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop < 100 && data?.nextCursor && !cursor) {
      setCursor(data.nextCursor);
    }
  };

  // Messages come in DESC order, reverse for display
  const sorted = [...allMessages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-txt-light text-sm">Loading messages...</div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto py-4 space-y-2">
      {data?.nextCursor && (
        <div className="text-center py-2">
          <button
            onClick={() => setCursor(data.nextCursor)}
            className="text-[11px] text-blue hover:underline"
          >
            Load older messages
          </button>
        </div>
      )}

      {sorted.map((m, i) => {
        const showDate = i === 0 || !isSameDay(sorted[i - 1].created_at, m.created_at);
        return (
          <div key={m.id}>
            {showDate && (
              <div className="flex items-center gap-3 px-5 py-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] text-txt-light font-medium">{formatDate(m.created_at)}</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}
            <MessageBubble
              message={m}
              isOwn={m.sender_id === userId}
              userId={userId}
              conversationId={conversationId}
            />
          </div>
        );
      })}

      {/* Typing indicator */}
      {typingHere && typingHere.size > 0 && (
        <div className="px-5 py-1">
          <div className="flex items-center gap-2 text-[11px] text-txt-light italic">
            <span className="flex gap-0.5">
              <span className="w-1.5 h-1.5 bg-txt-light/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-txt-light/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-txt-light/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
            Someone is typing...
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
