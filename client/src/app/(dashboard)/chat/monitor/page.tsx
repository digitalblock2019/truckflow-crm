"use client";

import { useState } from "react";
import { useAllConversations, useAllMessages } from "@/lib/hooks";
import { useAuthStore } from "@/lib/auth";
import { useRouter } from "next/navigation";
import Topbar from "@/components/layout/Topbar";
import type { ChatMessage } from "@/types";

export default function ChatMonitorPage() {
  const [selectedConvo, setSelectedConvo] = useState("");
  const { data: conversations, isLoading } = useAllConversations();
  const { data: messagesData } = useAllMessages(selectedConvo);
  const role = useAuthStore((s) => s.user?.role);
  const router = useRouter();

  // Admin-only guard
  if (role !== "admin") {
    router.replace("/chat");
    return null;
  }

  const messages = messagesData?.messages ?? [];
  const sorted = [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return (
    <>
      <Topbar
        title="Chat Monitor"
        subtitle="Admin-only read-only view of all conversations"
      />
      <div className="flex-1 flex overflow-hidden">
        {/* Conversation list */}
        <div className="w-[300px] border-r border-border bg-white overflow-y-auto shrink-0">
          <div className="px-4 py-3 border-b border-border text-[11px] font-medium text-txt-light uppercase tracking-wide">
            All Conversations ({conversations?.length ?? 0})
          </div>
          {isLoading && <div className="p-4 text-xs text-txt-light">Loading...</div>}
          {(conversations ?? []).map((c: any) => (
            <button
              key={c.id}
              onClick={() => setSelectedConvo(c.id)}
              className={`w-full text-left px-4 py-3 border-b border-[#f0f2f5] transition-colors ${
                c.id === selectedConvo ? "bg-[#f0f6ff]" : "hover:bg-[#f8faff]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-txt truncate">
                  {c.name ?? "Direct Message"}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-txt-light capitalize">
                  {c.type}
                </span>
              </div>
              <div className="text-[10px] text-txt-light mt-0.5">
                {c.member_count} members &middot; {c.message_count} messages
              </div>
            </button>
          ))}
        </div>

        {/* Messages */}
        <div className="flex-1 flex flex-col bg-surface min-w-0">
          {selectedConvo ? (
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2">
              {sorted.map((m: ChatMessage) => (
                <div key={m.id} className="flex gap-2">
                  <div className="w-7 h-7 rounded-full bg-blue flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5">
                    {(m.sender_name ?? "?")[0]?.toUpperCase()}
                  </div>
                  <div>
                    <div className="text-[10px] text-txt-light">
                      <span className="font-medium">{m.sender_name}</span>
                      {" \u00B7 "}
                      {new Date(m.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {m.is_deleted && <span className="text-red-400 ml-1">(deleted)</span>}
                      {m.edited_at && <span className="text-amber-500 ml-1">(edited)</span>}
                    </div>
                    <div className="text-[13px] text-txt mt-0.5">
                      {m.is_deleted ? <span className="italic text-txt-light">Message deleted</span> : m.content}
                    </div>
                  </div>
                </div>
              ))}
              {sorted.length === 0 && (
                <div className="text-center text-sm text-txt-light py-8">No messages in this conversation</div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-txt-light">
              Select a conversation to view messages
            </div>
          )}
        </div>
      </div>
    </>
  );
}
