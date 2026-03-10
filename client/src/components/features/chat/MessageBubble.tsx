"use client";

import { useState } from "react";
import type { ChatMessage } from "@/types";
import { useAddReaction, useRemoveReaction, useDeleteMessage } from "@/lib/hooks";
import { useChatStore } from "@/lib/chatStore";
import EmojiPicker from "./EmojiPicker";

interface Props {
  message: ChatMessage;
  isOwn: boolean;
  userId: string;
  conversationId: string;
}

export default function MessageBubble({ message: m, isOwn, userId, conversationId }: Props) {
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const addReaction = useAddReaction();
  const removeReaction = useRemoveReaction();
  const deleteMessage = useDeleteMessage();
  const { setReplyTo, setEditingMessage } = useChatStore();

  // Deleted placeholder
  if (m.is_deleted) {
    return (
      <div className={`flex ${isOwn ? "flex-row-reverse" : "flex-row"} gap-2 px-5`}>
        <div className="w-7 h-7" />
        <div className="px-3.5 py-2 text-[12px] italic text-txt-light/60 bg-surface rounded-lg border border-border/50">
          This message was deleted
        </div>
      </div>
    );
  }

  const handleReaction = (emoji: string) => {
    const existing = m.reactions.find((r) => r.emoji === emoji && r.user_id === userId);
    if (existing) {
      removeReaction.mutate({ conversationId, messageId: m.id, emoji });
    } else {
      addReaction.mutate({ conversationId, messageId: m.id, emoji });
    }
    setShowEmojiPicker(false);
  };

  // Group reactions by emoji
  const groupedReactions: { emoji: string; count: number; users: string[]; hasOwn: boolean }[] = [];
  const emojiMap = new Map<string, { count: number; users: string[]; hasOwn: boolean }>();
  for (const r of m.reactions) {
    const entry = emojiMap.get(r.emoji) || { count: 0, users: [], hasOwn: false };
    entry.count++;
    entry.users.push(r.user_name);
    if (r.user_id === userId) entry.hasOwn = true;
    emojiMap.set(r.emoji, entry);
  }
  for (const [emoji, val] of emojiMap) {
    groupedReactions.push({ emoji, ...val });
  }

  const isImage = (mime: string) => mime?.startsWith("image/");
  const time = new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div
      className={`flex ${isOwn ? "flex-row-reverse" : "flex-row"} gap-2 group px-5`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => { setShowActions(false); setShowEmojiPicker(false); }}
    >
      {/* Avatar */}
      <div className="shrink-0 mt-1">
        {m.sender_avatar ? (
          <img src={m.sender_avatar} alt="" className="w-7 h-7 rounded-full object-cover" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-blue flex items-center justify-center text-[10px] font-bold text-white">
            {(m.sender_name ?? "?")[0]?.toUpperCase()}
          </div>
        )}
      </div>

      {/* Bubble */}
      <div className={`max-w-[480px] ${isOwn ? "items-end" : "items-start"} flex flex-col`}>
        {/* Sender + time */}
        <div className={`text-[10px] mb-1 ${isOwn ? "text-right" : ""} text-txt-light flex items-center gap-1.5`}>
          {!isOwn && <span className="font-medium">{m.sender_name}</span>}
          <span>{time}</span>
          {m.edited_at && <span className="italic text-txt-light/50">(edited)</span>}
        </div>

        {/* Reply quote */}
        {m.reply_to && (
          <div className={`mb-1 px-2.5 py-1.5 rounded-lg text-[11px] bg-surface border-l-2 border-blue max-w-full ${isOwn ? "ml-auto" : ""}`}>
            <div className="font-medium text-blue text-[10px]">{m.reply_to.sender_name}</div>
            <div className="text-txt-light truncate">{m.reply_to.content}</div>
          </div>
        )}

        {/* Content */}
        <div
          className={`px-3.5 py-2.5 text-[13px] leading-relaxed ${
            isOwn
              ? "bg-blue text-white rounded-[16px_4px_16px_16px]"
              : "bg-white border border-border text-txt rounded-[4px_16px_16px_16px]"
          }`}
        >
          {m.content}
        </div>

        {/* Attachments */}
        {m.attachments.length > 0 && (
          <div className="mt-1.5 space-y-1">
            {m.attachments.map((a) => (
              <div key={a.id}>
                {isImage(a.mime_type) ? (
                  <img
                    src={a.file_path}
                    alt={a.file_name}
                    className="max-w-[280px] max-h-[200px] rounded-lg object-cover border border-border"
                  />
                ) : (
                  <a
                    href={a.file_path}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] ${
                      isOwn ? "bg-blue-dark text-white/90" : "bg-surface border border-border text-txt"
                    }`}
                  >
                    <span>{"\u{1F4CE}"}</span>
                    <span className="truncate">{a.file_name}</span>
                    <span className="text-[10px] opacity-60 shrink-0">
                      {(a.file_size_bytes / 1024).toFixed(0)}KB
                    </span>
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Reactions */}
        {groupedReactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {groupedReactions.map((r) => (
              <button
                key={r.emoji}
                onClick={() => handleReaction(r.emoji)}
                className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[12px] border transition-colors ${
                  r.hasOwn
                    ? "bg-blue/10 border-blue/30 text-blue"
                    : "bg-surface border-border text-txt-light hover:border-blue/30"
                }`}
                title={r.users.join(", ")}
              >
                <span>{r.emoji}</span>
                <span className="text-[10px] font-medium">{r.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* Hover action bar */}
        {showActions && (
          <div className={`flex items-center gap-0.5 mt-1 ${isOwn ? "flex-row-reverse" : ""}`}>
            <button
              onClick={() => setReplyTo({ id: m.id, content: m.content ?? "", sender_name: m.sender_name ?? "" })}
              className="p-1 rounded hover:bg-surface text-txt-light hover:text-txt text-[12px]"
              title="Reply"
            >
              {"\u21A9"}
            </button>
            <div className="relative">
              <button
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="p-1 rounded hover:bg-surface text-txt-light hover:text-txt text-[12px]"
                title="React"
              >
                {"\u{1F600}"}
              </button>
              {showEmojiPicker && (
                <EmojiPicker
                  onSelect={handleReaction}
                  onClose={() => setShowEmojiPicker(false)}
                />
              )}
            </div>
            {isOwn && (
              <>
                <button
                  onClick={() => setEditingMessage({ id: m.id, content: m.content ?? "" })}
                  className="p-1 rounded hover:bg-surface text-txt-light hover:text-txt text-[12px]"
                  title="Edit"
                >
                  {"\u270F"}
                </button>
                <button
                  onClick={() => { if (confirm("Delete this message?")) deleteMessage.mutate({ conversationId, messageId: m.id }); }}
                  className="p-1 rounded hover:bg-red-50 text-txt-light hover:text-red-500 text-[12px]"
                  title="Delete"
                >
                  {"\u{1F5D1}"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
