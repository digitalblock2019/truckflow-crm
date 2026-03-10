"use client";

import { useState, useMemo } from "react";
import { useConversations, useTogglePin } from "@/lib/hooks";
import { useAuthStore } from "@/lib/auth";
import { useChatStore } from "@/lib/chatStore";
import type { Conversation } from "@/types";
import ConversationItem from "./ConversationItem";
import NewChatModal from "./NewChatModal";
import Link from "next/link";

export default function ChatSidebar() {
  const [search, setSearch] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const { data: conversations } = useConversations();
  const userId = useAuthStore((s) => s.user?.id) ?? "";
  const userRole = useAuthStore((s) => s.user?.role);
  const { activeConversationId, setActiveConversation } = useChatStore();
  const togglePin = useTogglePin();
  const isAdmin = userRole === "admin";

  const filtered = useMemo(() => {
    if (!conversations) return [];
    const q = search.toLowerCase();
    return conversations.filter((c) => {
      const name = c.type === "direct" && c.dm_partner ? c.dm_partner.full_name : c.name;
      return !q || name?.toLowerCase().includes(q) || c.last_message_preview?.toLowerCase().includes(q);
    });
  }, [conversations, search]);

  const pinned = filtered.filter((c) => c.is_pinned);
  const dms = filtered.filter((c) => !c.is_pinned && c.type === "direct");
  const groups = filtered.filter((c) => !c.is_pinned && c.type === "group");
  const announcements = filtered.filter((c) => !c.is_pinned && c.type === "announcement");

  const sections: { title: string; items: Conversation[] }[] = [
    ...(pinned.length ? [{ title: "Pinned", items: pinned }] : []),
    ...(announcements.length ? [{ title: "Announcements", items: announcements }] : []),
    ...(dms.length ? [{ title: "Direct Messages", items: dms }] : []),
    ...(groups.length ? [{ title: "Groups", items: groups }] : []),
  ];

  return (
    <>
      <div className="w-[280px] bg-[#1e2a3a] flex flex-col shrink-0 h-full">
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between">
          <h2 className="text-[14px] font-semibold text-white">Messages</h2>
          <button
            onClick={() => setShowNewChat(true)}
            className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white/70 hover:bg-white/20 hover:text-white text-[16px] transition-colors"
            title="New conversation"
          >
            +
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pb-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="w-full px-3 py-1.5 bg-white/10 border-none rounded-lg text-[12px] text-white placeholder-white/40 focus:outline-none focus:bg-white/15"
          />
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {sections.map((section) => (
            <div key={section.title}>
              <div className="px-4 py-1.5 text-[9px] font-mono uppercase tracking-[1.5px] text-white/25">
                {section.title}
              </div>
              {section.items.map((c) => (
                <div
                  key={c.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    togglePin.mutate(c.id);
                  }}
                >
                  <ConversationItem
                    conversation={c}
                    isActive={c.id === activeConversationId}
                    userId={userId}
                    onClick={() => setActiveConversation(c.id)}
                  />
                </div>
              ))}
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-[12px] text-white/30">
              {search ? "No matches found" : "No conversations yet"}
            </div>
          )}
        </div>

        {/* Admin monitor link */}
        {isAdmin && (
          <Link
            href="/chat/monitor"
            className="px-4 py-2.5 border-t border-white/10 text-[11px] text-white/40 hover:text-white/70 hover:bg-white/[0.04] transition-colors flex items-center gap-2"
          >
            <span>{"\u{1F441}"}</span> Monitor All Chats
          </Link>
        )}
      </div>

      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onCreated={(id) => setActiveConversation(id)}
        />
      )}
    </>
  );
}
