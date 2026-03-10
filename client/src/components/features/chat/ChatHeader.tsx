"use client";

import { useState } from "react";
import { useChatStore } from "@/lib/chatStore";
import type { Conversation } from "@/types";
import GroupSettingsModal from "./GroupSettingsModal";

function lastSeenText(lastSeen: string | null, isOnline: boolean) {
  if (isOnline) return "Online";
  if (!lastSeen) return "Offline";
  const diff = Date.now() - new Date(lastSeen).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `Last seen ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Last seen ${hrs}h ago`;
  return `Last seen ${Math.floor(hrs / 24)}d ago`;
}

interface Props {
  conversation: Conversation;
  userId: string;
}

export default function ChatHeader({ conversation: c, userId }: Props) {
  const [showSettings, setShowSettings] = useState(false);
  const onlineUsers = useChatStore((s) => s.onlineUsers);

  const displayName = c.type === "direct" && c.dm_partner
    ? c.dm_partner.full_name
    : c.name ?? "Conversation";

  const isOnline = c.type === "direct" && c.dm_partner ? onlineUsers.has(c.dm_partner.id) : false;

  const subtitle = c.type === "direct" && c.dm_partner
    ? lastSeenText(c.dm_partner.last_seen_at, isOnline)
    : `${c.participant_count} members`;

  const avatarBg = c.type === "announcement" ? "bg-amber-500" : c.type === "group" ? "bg-emerald-500" : "bg-blue";
  const initial = displayName[0]?.toUpperCase() ?? "?";

  return (
    <>
      <div className="px-5 py-3 bg-white border-b border-border flex items-center gap-3">
        {/* Avatar */}
        <div className="relative">
          {c.type === "direct" && c.dm_partner?.profile_image_url ? (
            <img src={c.dm_partner.profile_image_url} alt="" className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <div className={`w-9 h-9 rounded-full ${avatarBg} flex items-center justify-center text-[12px] font-bold text-white`}>
              {c.type === "announcement" ? "\u{1F4E2}" : c.type === "group" ? "\u{1F465}" : initial}
            </div>
          )}
          {isOnline && (
            <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-white" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-navy truncate">{displayName}</div>
          <div className="text-[10px] text-txt-light">{subtitle}</div>
        </div>

        {/* Settings button (for groups/announcements) */}
        {c.type !== "direct" && (
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-lg hover:bg-surface transition-colors text-txt-light hover:text-txt"
            title="Settings"
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        )}
      </div>

      {showSettings && (
        <GroupSettingsModal
          conversation={c}
          userId={userId}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
}
