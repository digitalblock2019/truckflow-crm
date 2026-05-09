"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSendMessage, useEditMessage, useUploadChatFile } from "@/lib/hooks";
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
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);

  const sendMsg = useSendMessage();
  const editMsg = useEditMessage();
  const uploadFile = useUploadChatFile();
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

    if (editingMessage) {
      if (!content) return;
      editMsg.mutate({ conversationId, messageId: editingMessage.id, content });
      setEditingMessage(null);
      setText("");
      broadcastTyping(false);
      textareaRef.current?.focus();
      return;
    }

    if (pendingFile) {
      setUploadErr(null);
      uploadFile.mutate(
        { conversationId, file: pendingFile, content: content || undefined },
        {
          onSuccess: () => {
            setPendingFile(null);
            setText("");
            setReplyTo(null);
            broadcastTyping(false);
            textareaRef.current?.focus();
          },
          onError: (err: unknown) => {
            setUploadErr(err instanceof Error ? err.message : "Upload failed");
          },
        }
      );
      return;
    }

    if (!content) return;
    sendMsg.mutate({ conversationId, content, reply_to_id: replyTo?.id });
    setReplyTo(null);
    setText("");
    broadcastTyping(false);
    textareaRef.current?.focus();
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      // 25 MB cap matches server-side multer limit
      if (f.size > 25 * 1024 * 1024) {
        setUploadErr("File too large (max 25 MB)");
        e.target.value = "";
        return;
      }
      setUploadErr(null);
      setPendingFile(f);
    }
    e.target.value = "";
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

      {/* Pending attachment preview */}
      {pendingFile && (
        <div className="px-5 pt-2 flex items-center gap-2">
          <div className="flex-1 px-3 py-1.5 bg-blue/5 border border-blue/20 rounded-lg text-[11px] text-txt flex items-center gap-2">
            <span>{"\u{1F4CE}"}</span>
            <span className="truncate flex-1">{pendingFile.name}</span>
            <span className="text-txt-light text-[10px] shrink-0">{(pendingFile.size / 1024).toFixed(0)} KB</span>
          </div>
          <button onClick={() => setPendingFile(null)} className="text-txt-light hover:text-txt text-[16px]">&times;</button>
        </div>
      )}

      {/* Upload error */}
      {uploadErr && (
        <div className="px-5 pt-2">
          <div className="bg-red-50 border border-red-200 text-red-700 text-[11px] px-3 py-1.5 rounded">
            {uploadErr}
          </div>
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

        {/* Attach button — disabled while editing since edits are content-only */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFilePick}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!!editingMessage}
          title="Attach file"
          className="p-2 rounded-lg hover:bg-surface text-txt-light hover:text-txt transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {"\u{1F4CE}"}
        </button>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={pendingFile ? "Add a message (optional)..." : "Type a message..."}
          rows={1}
          className="flex-1 px-3 py-2 border border-border rounded-lg text-[13px] resize-none focus:outline-none focus:border-blue-light leading-relaxed"
          style={{ maxHeight: 120 }}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={(!text.trim() && !pendingFile) || uploadFile.isPending}
          className="px-4 py-2 bg-blue text-white text-[13px] font-medium rounded-lg hover:bg-blue-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
        >
          {uploadFile.isPending ? "Sending..." : editingMessage ? "Save" : "Send"}
        </button>
      </div>
    </div>
  );
}
