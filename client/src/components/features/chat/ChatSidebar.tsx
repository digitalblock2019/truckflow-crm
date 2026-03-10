"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { useConversations, useTogglePin } from "@/lib/hooks";
import { useAuthStore } from "@/lib/auth";
import { useChatStore } from "@/lib/chatStore";
import type { Conversation } from "@/types";
import ConversationItem from "./ConversationItem";
import NewChatModal from "./NewChatModal";
import Link from "next/link";

interface ContextMenuState {
  x: number;
  y: number;
  conversation: Conversation;
}

export default function ChatSidebar() {
  const [search, setSearch] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { data: conversations } = useConversations();
  const userId = useAuthStore((s) => s.user?.id) ?? "";
  const userRole = useAuthStore((s) => s.user?.role);
  const { activeConversationId, setActiveConversation } = useChatStore();
  const togglePin = useTogglePin();
  const isAdmin = userRole === "admin";

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [contextMenu]);

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

  const handleContextMenu = (e: React.MouseEvent, c: Conversation) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, conversation: c });
  };

  const handlePin = () => {
    if (contextMenu) {
      togglePin.mutate(contextMenu.conversation.id);
      setContextMenu(null);
    }
  };

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
                  onContextMenu={(e) => handleContextMenu(e, c)}
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

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-[100] bg-white rounded-lg shadow-lg border border-border py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={handlePin}
            className="w-full text-left px-3 py-2 text-[13px] text-txt hover:bg-surface flex items-center gap-2 transition-colors"
          >
            <span>{contextMenu.conversation.is_pinned ? "\u{274C}" : "\u{1F4CC}"}</span>
            {contextMenu.conversation.is_pinned ? "Unpin conversation" : "Pin conversation"}
          </button>
          <button
            onClick={() => setContextMenu(null)}
            className="w-full text-left px-3 py-2 text-[13px] text-txt-light hover:bg-surface transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {showNewChat && (
        <NewChatModal
          onClose={() => setShowNewChat(false)}
          onCreated={(id) => setActiveConversation(id)}
        />
      )}
    </>
  );
}
