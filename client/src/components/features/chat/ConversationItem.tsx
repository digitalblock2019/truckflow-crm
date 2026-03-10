"use client";

import { useChatStore } from "@/lib/chatStore";
import type { Conversation } from "@/types";

function timeAgo(dateStr: string | null) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString([], { month: "short", day: "numeric" });
}

interface Props {
  conversation: Conversation;
  isActive: boolean;
  userId: string;
  onClick: () => void;
}

export default function ConversationItem({ conversation: c, isActive, userId, onClick }: Props) {
  const onlineUsers = useChatStore((s) => s.onlineUsers);

  const displayName = c.type === "direct" && c.dm_partner
    ? c.dm_partner.full_name
    : c.name ?? "Unnamed";

  const initial = displayName[0]?.toUpperCase() ?? "?";
  const isOnline = c.type === "direct" && c.dm_partner
    ? onlineUsers.has(c.dm_partner.id)
    : false;

  const avatarBg = c.type === "announcement" ? "bg-amber-500" : c.type === "group" ? "bg-emerald-500" : "bg-blue";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 cursor-pointer transition-colors flex items-center gap-2.5
        ${isActive ? "bg-white/10" : "hover:bg-white/[0.06]"}`}
    >
      {/* Avatar */}
      <div className="relative shrink-0">
        {c.type === "direct" && c.dm_partner?.profile_image_url ? (
          <img src={c.dm_partner.profile_image_url} alt="" className="w-9 h-9 rounded-full object-cover" />
        ) : (
          <div className={`w-9 h-9 rounded-full ${avatarBg} flex items-center justify-center text-[12px] font-bold text-white`}>
            {c.type === "announcement" ? "\u{1F4E2}" : c.type === "group" ? "\u{1F465}" : initial}
          </div>
        )}
        {isOnline && (
          <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-[#1e2a3a]" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[13px] font-medium text-white truncate">
            {c.is_pinned && <span className="mr-1 text-amber-400">{"\u{1F4CC}"}</span>}
            {displayName}
          </span>
          <span className="text-[10px] text-white/40 shrink-0">{timeAgo(c.last_message_at)}</span>
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <span className="text-[11px] text-white/50 truncate">
            {c.last_message_preview ?? "No messages yet"}
          </span>
          {c.unread_count > 0 && (
            <span className="shrink-0 min-w-[18px] h-[18px] flex items-center justify-center bg-accent text-white text-[10px] font-bold rounded-full px-1">
              {c.unread_count > 99 ? "99+" : c.unread_count}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
