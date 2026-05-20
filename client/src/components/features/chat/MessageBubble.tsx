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

  function fileExt(name: string): string {
    const ext = name.split(".").pop();
    return ext && ext !== name ? ext.toUpperCase() : "FILE";
  }

  return (
    <div
      className={`flex ${isOwn ? "flex-row-reverse" : "flex-row"} gap-2 group px-5`}
      onMouseLeave={() => setShowEmojiPicker(false)}
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
      <div className={`max-w-[480px] ${isOwn ? "items-end" : "items-start"} flex flex-col relative`}>
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
          className={`px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words ${
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
                    className="block w-[260px] rounded-lg overflow-hidden border border-border bg-white hover:bg-bg transition-colors"
                  >
                    <div className="flex items-center justify-center h-[120px] bg-surface relative">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="w-14 h-14 text-blue">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9z" />
                      </svg>
                      <span className="absolute bottom-2 right-2 text-[9px] font-mono font-bold text-txt-light bg-white px-1.5 py-0.5 rounded border border-border tracking-wide">
                        {fileExt(a.file_name)}
                      </span>
                    </div>
                    <div className="px-3 py-2 text-txt">
                      <div className="text-[12px] font-medium truncate">{a.file_name}</div>
                      <div className="text-[10px] mt-0.5 font-mono text-txt-light">
                        {(a.file_size_bytes / 1024).toFixed(0)} KB
                      </div>
                    </div>
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

        {/* Hover action bar — absolutely positioned beside the bubble so it
            doesn't expand the column and push the input field below the fold. */}
        <div
          className={`absolute -top-3 ${isOwn ? "right-2" : "left-2"} flex items-center gap-0.5 bg-white border border-border rounded-full shadow-sm px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10`}
        >
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
                  align={isOwn ? "right" : "left"}
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
                  <span className="inline-block scale-x-[-1]">{"\u270F\uFE0F"}</span>
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
      </div>
    </div>
  );
}
