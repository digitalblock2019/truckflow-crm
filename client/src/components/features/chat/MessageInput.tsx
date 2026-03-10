"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSendMessage, useEditMessage } from "@/lib/hooks";
import { useChatStore } from "@/lib/chatStore";
import { getSocket } from "@/lib/socket";
import EmojiPicker from "./EmojiPicker";

interface Props {
  conversationId: string;
  canPost: boolean;
}

export default function MessageInput({ conversationId, canPost }: Props) {
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const sendMsg = useSendMessage();
  const editMsg = useEditMessage();
  const replyTo = useChatStore((s) => s.replyTo);
  const editingMessage = useChatStore((s) => s.editingMessage);
  const setReplyTo = useChatStore((s) => s.setReplyTo);
  const setEditingMessage = useChatStore((s) => s.setEditingMessage);

  // When editing, populate textarea
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.content);
      textareaRef.current?.focus();
    }
  }, [editingMessage]);

  // Auto-expand textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }
  }, [text]);

  const broadcastTyping = useCallback((typing: boolean) => {
    const socket = getSocket();
    if (!socket) return;
    if (typing && !isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit("typing:start", { conversationId });
    }
    if (!typing && isTypingRef.current) {
      isTypingRef.current = false;
      socket.emit("typing:stop", { conversationId });
    }
  }, [conversationId]);

  const handleChange = (val: string) => {
    setText(val);
    broadcastTyping(true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => broadcastTyping(false), 2000);
  };

  const handleSend = () => {
    const content = text.trim();
    if (!content) return;

    if (editingMessage) {
      editMsg.mutate({ conversationId, messageId: editingMessage.id, content });
      setEditingMessage(null);
    } else {
      sendMsg.mutate({ conversationId, content, reply_to_id: replyTo?.id });
      setReplyTo(null);
    }
    setText("");
    broadcastTyping(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape") {
      setReplyTo(null);
      setEditingMessage(null);
      setText("");
    }
  };

  if (!canPost) {
    return (
      <div className="px-5 py-3 bg-white border-t border-border text-center text-[12px] text-txt-light">
        Only admins can post in this channel
      </div>
    );
  }

  return (
    <div className="bg-white border-t border-border">
      {/* Reply preview */}
      {replyTo && (
        <div className="px-5 pt-2 flex items-center gap-2">
          <div className="flex-1 px-3 py-1.5 bg-surface rounded-lg border-l-2 border-blue text-[11px]">
            <span className="font-medium text-blue">{replyTo.sender_name}</span>
            <span className="text-txt-light ml-1.5 truncate">{replyTo.content}</span>
          </div>
          <button onClick={() => setReplyTo(null)} className="text-txt-light hover:text-txt text-[16px]">&times;</button>
        </div>
      )}

      {/* Edit indicator */}
      {editingMessage && (
        <div className="px-5 pt-2 flex items-center gap-2">
          <div className="flex-1 px-3 py-1.5 bg-amber-50 rounded-lg border-l-2 border-amber-400 text-[11px] text-amber-700">
            Editing message
          </div>
          <button onClick={() => { setEditingMessage(null); setText(""); }} className="text-txt-light hover:text-txt text-[16px]">&times;</button>
        </div>
      )}

      {/* Input row */}
      <div className="px-5 py-3 flex items-end gap-2">
        {/* Emoji button */}
        <div className="relative">
          <button
            onClick={() => setShowEmoji(!showEmoji)}
            className="p-2 rounded-lg hover:bg-surface text-txt-light hover:text-txt transition-colors"
          >
            {"\u{1F600}"}
          </button>
          {showEmoji && (
            <EmojiPicker
              onSelect={(emoji) => {
                setText((prev) => prev + emoji);
                setShowEmoji(false);
                textareaRef.current?.focus();
              }}
              onClose={() => setShowEmoji(false)}
            />
          )}
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 px-3 py-2 border border-border rounded-lg text-[13px] resize-none focus:outline-none focus:border-blue-light leading-relaxed"
          style={{ maxHeight: 120 }}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className="px-4 py-2 bg-blue text-white text-[13px] font-medium rounded-lg hover:bg-blue-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          {editingMessage ? "Save" : "Send"}
        </button>
      </div>
    </div>
  );
}
