"use client";

import { useState, useMemo } from "react";
import { useCreateConversation, useChatUsers } from "@/lib/hooks";
import { useChatStore } from "@/lib/chatStore";
import { useAuthStore } from "@/lib/auth";

interface Props {
  onClose: () => void;
  onCreated: (id: string) => void;
}

export default function NewChatModal({ onClose, onCreated }: Props) {
  const [tab, setTab] = useState<"dm" | "group" | "announcement">("dm");
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<{ id: string; full_name: string }[]>([]);
  const [dmLoading, setDmLoading] = useState<string | null>(null);
  const createConvo = useCreateConversation();
  const { data: allUsers, isLoading: usersLoading } = useChatUsers();
  const userId = useAuthStore((s) => s.user?.id);
  const userRole = useAuthStore((s) => s.user?.role);
  const onlineUsers = useChatStore((s) => s.onlineUsers);
  const canCreateAnnouncement = userRole === "admin" || userRole === "supervisor";

  const filteredUsers = useMemo(() => {
    if (!allUsers) return [];
    const q = search.toLowerCase();
    return allUsers.filter(
      (u) =>
        u.id !== userId &&
        !selectedUsers.some((s) => s.id === u.id) &&
        (!q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    );
  }, [allUsers, search, userId, selectedUsers]);

  // DM: click a person → create/open DM instantly
  const handleDMClick = (user: { id: string; full_name: string }) => {
    setDmLoading(user.id);
    createConvo.mutate(
      { type: "direct", member_ids: [user.id] },
      {
        onSuccess: (conv) => {
          onCreated(conv.id);
          onClose();
        },
        onError: () => setDmLoading(null),
      }
    );
  };

  // Group/Announcement: traditional create flow
  const handleGroupCreate = () => {
    const type = tab;
    const data: any = { type, member_ids: selectedUsers.map((u) => u.id) };
    data.name = name || (tab === "group" ? "New Group" : "Announcement");
    if (description) data.description = description;
    createConvo.mutate(data, {
      onSuccess: (conv) => {
        onCreated(conv.id);
        onClose();
      },
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl w-[440px] max-h-[600px] flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-border">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-semibold text-navy">New Conversation</h3>
            <button onClick={onClose} className="text-txt-light hover:text-txt text-xl">&times;</button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-3">
            {(["dm", "group", ...(canCreateAnnouncement ? ["announcement"] : [])] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t as any); setSelectedUsers([]); setSearch(""); }}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                  tab === t ? "bg-blue text-white" : "bg-surface text-txt-light hover:text-txt"
                }`}
              >
                {t === "dm" ? "Direct Message" : t === "group" ? "Group" : "Announcement"}
              </button>
            ))}
          </div>
        </div>

        {/* ── DM Tab ── */}
        {tab === "dm" && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="px-5 pt-4 pb-2">
              <p className="text-[12px] text-txt-light mb-2">Choose a person to message</p>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="w-full px-3 py-2 border border-border rounded-lg text-[13px] focus:outline-none focus:border-blue-light"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-3">
              {usersLoading && (
                <div className="px-3 py-6 text-center text-[12px] text-txt-light">Loading...</div>
              )}
              {!usersLoading && filteredUsers.length === 0 && (
                <div className="px-3 py-6 text-center text-[12px] text-txt-light">No users found</div>
              )}
              {filteredUsers.map((u) => {
                const isOnline = onlineUsers.has(u.id);
                const loading = dmLoading === u.id;
                return (
                  <button
                    key={u.id}
                    onClick={() => handleDMClick(u)}
                    disabled={!!dmLoading}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-[13px] flex items-center gap-3 hover:bg-surface transition-colors disabled:opacity-50"
                  >
                    <div className="relative shrink-0">
                      {u.profile_image_url ? (
                        <img src={u.profile_image_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-blue flex items-center justify-center text-[12px] font-bold text-white">
                          {u.full_name?.[0]?.toUpperCase() ?? "?"}
                        </div>
                      )}
                      {isOnline && (
                        <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-txt truncate">{u.full_name}</div>
                      <div className="text-[11px] text-txt-light truncate">
                        <span className="capitalize">{u.role?.replace(/_/g, " ")}</span>
                        {isOnline && <span className="ml-1.5 text-green-500 font-medium">Online</span>}
                      </div>
                    </div>
                    {loading && (
                      <div className="w-4 h-4 border-2 border-blue border-t-transparent rounded-full animate-spin shrink-0" />
                    )}
                    <svg className="w-4 h-4 text-txt-light/40 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Group Tab ── */}
        {tab === "group" && (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <div>
                <label className="text-[11px] font-medium text-txt-light uppercase tracking-wide">Group Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Dispatch Team, Sales..."
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-[13px] focus:outline-none focus:border-blue-light"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-txt-light uppercase tracking-wide">Description (optional)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What's this group about?"
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-[13px] focus:outline-none focus:border-blue-light"
                />
              </div>

              {/* Selected members */}
              {selectedUsers.length > 0 && (
                <div>
                  <label className="text-[11px] font-medium text-txt-light uppercase tracking-wide">
                    Members ({selectedUsers.length})
                  </label>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {selectedUsers.map((u) => (
                      <span key={u.id} className="flex items-center gap-1 px-2.5 py-1 bg-blue/10 text-blue rounded-full text-[11px] font-medium">
                        {u.full_name}
                        <button onClick={() => setSelectedUsers((prev) => prev.filter((p) => p.id !== u.id))} className="hover:text-blue-dark ml-0.5">&times;</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Add members */}
              <div>
                <label className="text-[11px] font-medium text-txt-light uppercase tracking-wide">Add Members</label>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search people..."
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-[13px] focus:outline-none focus:border-blue-light"
                />
              </div>
              <div className="border border-border rounded-lg max-h-[180px] overflow-y-auto">
                {usersLoading && (
                  <div className="px-3 py-4 text-center text-[12px] text-txt-light">Loading...</div>
                )}
                {!usersLoading && filteredUsers.length === 0 && (
                  <div className="px-3 py-4 text-center text-[12px] text-txt-light">No users found</div>
                )}
                {filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setSelectedUsers((prev) => [...prev, { id: u.id, full_name: u.full_name }]);
                      setSearch("");
                    }}
                    className="w-full text-left px-3 py-2.5 text-[13px] flex items-center gap-2.5 border-b border-border last:border-0 hover:bg-surface transition-colors"
                  >
                    {u.profile_image_url ? (
                      <img src={u.profile_image_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-blue flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                        {u.full_name?.[0]?.toUpperCase() ?? "?"}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-medium text-txt truncate">{u.full_name}</div>
                      <div className="text-[11px] text-txt-light truncate capitalize">{u.role?.replace(/_/g, " ")}</div>
                    </div>
                    <span className="ml-auto text-[11px] text-blue font-medium shrink-0">+ Add</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 text-[13px] text-txt-light hover:text-txt rounded-lg hover:bg-surface">
                Cancel
              </button>
              <button
                onClick={handleGroupCreate}
                disabled={createConvo.isPending || selectedUsers.length === 0}
                className="px-4 py-2 bg-blue text-white text-[13px] font-medium rounded-lg hover:bg-blue-dark disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {createConvo.isPending ? "Creating..." : `Create Group (${selectedUsers.length})`}
              </button>
            </div>
          </>
        )}

        {/* ── Announcement Tab ── */}
        {tab === "announcement" && (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <div>
                <label className="text-[11px] font-medium text-txt-light uppercase tracking-wide">Channel Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Company Updates, Policy Changes..."
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-[13px] focus:outline-none focus:border-blue-light"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-txt-light uppercase tracking-wide">Description (optional)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What will be announced here?"
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-[13px] focus:outline-none focus:border-blue-light"
                />
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-[12px] text-amber-700">
                All active users will be automatically added. Only admins and supervisors can post messages.
              </div>
            </div>

            <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 text-[13px] text-txt-light hover:text-txt rounded-lg hover:bg-surface">
                Cancel
              </button>
              <button
                onClick={handleGroupCreate}
                disabled={createConvo.isPending}
                className="px-4 py-2 bg-blue text-white text-[13px] font-medium rounded-lg hover:bg-blue-dark disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {createConvo.isPending ? "Creating..." : "Create Channel"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
