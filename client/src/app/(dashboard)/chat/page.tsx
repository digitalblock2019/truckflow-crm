"use client";

import { useState, useRef, useEffect } from "react";
import Topbar from "@/components/layout/Topbar";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { useConversations, useMessages, useSendMessage, useCreateConversation } from "@/lib/hooks";
import { useAuthStore } from "@/lib/auth";
import type { Conversation, ChatMessage } from "@/types";

export default function ChatPage() {
  const [activeConvo, setActiveConvo] = useState<string>("");
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const userId = useAuthStore((s) => s.user?.id);

  const { data: conversations } = useConversations();
  const { data: messagesData } = useMessages(activeConvo);
  const sendMsg = useSendMessage();
  const createConvo = useCreateConversation();

  const messages = messagesData?.messages ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = () => {
    if (!message.trim() || !activeConvo) return;
    sendMsg.mutate({ conversationId: activeConvo, content: message });
    setMessage("");
  };

  const activeConversation = (conversations ?? []).find((c: Conversation) => c.id === activeConvo);

  return (
    <>
      <Topbar
        title="Team Chat"
        subtitle="Internal messaging"
        actions={
          <Button
            size="sm"
            onClick={() =>
              createConvo.mutate(
                { type: "group", name: "New Group" },
                { onSuccess: (data) => setActiveConvo(data.id) }
              )
            }
          >
            + New Chat
          </Button>
        }
      />
      <div className="flex-1 flex overflow-hidden">
        {/* Conversation list */}
        <div className="w-[260px] border-r border-border bg-white overflow-y-auto shrink-0">
          <div className="px-4 py-3 border-b border-border">
            <input
              type="text"
              placeholder="Search conversations..."
              className="w-full px-3 py-1.5 border border-border rounded-[5px] text-xs bg-surface focus:outline-none focus:border-blue-light"
            />
          </div>
          {(conversations ?? []).map((c: Conversation) => (
            <button
              key={c.id}
              onClick={() => setActiveConvo(c.id)}
              className={`w-full text-left px-4 py-3 border-b border-[#f0f2f5] cursor-pointer transition-colors
                ${c.id === activeConvo ? "bg-[#f0f6ff]" : "hover:bg-[#f8faff]"}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-txt truncate">
                  {c.name ?? "Direct Message"}
                </span>
                {c.unread_count > 0 && (
                  <Badge color="orange">{c.unread_count}</Badge>
                )}
              </div>
              <div className="text-[11px] text-txt-light truncate mt-0.5">
                {c.last_message_preview ?? "No messages yet"}
              </div>
              <div className="text-[10px] text-txt-light/60 mt-0.5">
                {c.type === "announcement" ? "Announcement" : c.type === "group" ? "Group" : "DM"}
                {" · "}
                {c.participant_count} members
              </div>
            </button>
          ))}
          {(conversations ?? []).length === 0 && (
            <div className="p-4 text-xs text-txt-light text-center">No conversations</div>
          )}
        </div>

        {/* Message panel */}
        <div className="flex-1 flex flex-col bg-surface min-w-0">
          {activeConvo ? (
            <>
              {/* Header */}
              <div className="px-5 py-3 bg-white border-b border-border flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue flex items-center justify-center text-[11px] font-bold text-white">
                  {(activeConversation?.name ?? "?")[0]}
                </div>
                <div>
                  <div className="text-sm font-semibold text-navy">
                    {activeConversation?.name ?? "Conversation"}
                  </div>
                  <div className="text-[10px] text-txt-light">
                    {activeConversation?.participant_count} participants
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                {messages.map((m: ChatMessage) => {
                  const isOwn = m.sender_id === userId;
                  return (
                    <div key={m.id} className={`flex ${isOwn ? "flex-row-reverse" : "flex-row"} gap-2`}>
                      <div className="w-7 h-7 rounded-full bg-blue flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                        {(m.sender_name ?? "?")[0]}
                      </div>
                      <div>
                        <div className={`text-[10px] mb-1 ${isOwn ? "text-right" : ""} text-txt-light`}>
                          {m.sender_name} · {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                        <div
                          className={`px-3.5 py-2.5 max-w-[480px] text-[13px] ${
                            isOwn
                              ? "bg-blue text-white rounded-[10px_0_10px_10px]"
                              : "bg-white border border-border text-txt rounded-[0_10px_10px_10px]"
                          }`}
                        >
                          {m.content}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="px-5 py-3 bg-white border-t border-border flex gap-2">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 border border-border rounded-[5px] text-[13px] focus:outline-none focus:border-blue-light"
                />
                <Button onClick={handleSend} disabled={!message.trim()}>
                  Send
                </Button>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-txt-light">
              Select a conversation to start messaging
            </div>
          )}
        </div>
      </div>
    </>
  );
}
