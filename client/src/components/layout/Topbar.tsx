"use client";

import { useState, useRef, useEffect } from "react";
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@/lib/hooks";
import type { Notification } from "@/types";

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const items: Notification[] = data?.data ?? [];
  const unreadCount = (data as any)?.unread_count ?? items.filter((n) => !n.is_read).length;

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="relative p-1.5 rounded-md hover:bg-gray-100 transition-colors cursor-pointer"
        aria-label="Notifications"
      >
        <BellIcon className="text-txt-mid" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red text-white text-[10px] font-bold px-1 leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg shadow-lg border border-border z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
            <span className="text-xs font-semibold text-navy">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="text-[11px] text-blue hover:underline cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <div className="py-8 text-center text-xs text-txt-light">No notifications</div>
            ) : (
              items.slice(0, 20).map((n) => (
                <button
                  key={n.id}
                  onClick={() => { if (!n.is_read) markRead.mutate(n.id); }}
                  className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-surface transition-colors cursor-pointer ${!n.is_read ? "bg-blue/[0.03]" : ""}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.is_read && <span className="mt-1.5 w-2 h-2 rounded-full bg-blue shrink-0" />}
                    <div className={`flex-1 min-w-0 ${n.is_read ? "ml-4" : ""}`}>
                      <div className="text-xs font-semibold text-navy truncate">{n.title}</div>
                      <div className="text-[11px] text-txt-mid mt-0.5 line-clamp-2">{n.body}</div>
                      <div className="text-[10px] text-txt-light mt-1">{timeAgo(n.created_at)}</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Topbar({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="bg-white border-b border-border px-6 py-3 flex items-center gap-4 shrink-0">
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-semibold text-navy">{title}</h1>
        {subtitle && <p className="text-xs text-txt-light">{subtitle}</p>}
      </div>
      <NotificationBell />
      {actions && <div className="flex gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
