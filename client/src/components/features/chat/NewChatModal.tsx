"use client";

import { useState } from "react";
import { useCreateConversation, useUserSearch } from "@/lib/hooks";
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
  const createConvo = useCreateConversation();
  const { data: searchResults } = useUserSearch(search);
  const userId = useAuthStore((s) => s.user?.id);
  const userRole = useAuthStore((s) => s.user?.role);
  const canCreateAnnouncement = userRole === "admin" || userRole === "supervisor";

  const users = (searchResults?.data ?? []).filter(
    (u) => u.id !== userId && !selectedUsers.some((s) => s.id === u.id)
  );

  const handleCreate = () => {
    const type = tab === "dm" ? "direct" : tab;
    const data: any = { type, member_ids: selectedUsers.map((u) => u.id) };
    if (tab !== "dm") {
      data.name = name || (tab === "group" ? "New Group" : "Announcement");
      if (description) data.description = description;
    }
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
                onClick={() => { setTab(t as any); setSelectedUsers([]); }}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                  tab === t ? "bg-blue text-white" : "bg-surface text-txt-light hover:text-txt"
                }`}
              >
                {t === "dm" ? "Direct Message" : t === "group" ? "Group" : "Announcement"}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {tab !== "dm" && (
            <>
              <div>
                <label className="text-[11px] font-medium text-txt-light uppercase tracking-wide">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={tab === "group" ? "Group name..." : "Channel name..."}
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-[13px] focus:outline-none focus:border-blue-light"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-txt-light uppercase tracking-wide">Description (optional)</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What's this about?"
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-[13px] focus:outline-none focus:border-blue-light"
                />
              </div>
            </>
          )}

          {tab !== "announcement" && (
            <>
              {/* Selected users */}
              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedUsers.map((u) => (
                    <span key={u.id} className="flex items-center gap-1 px-2 py-1 bg-blue/10 text-blue rounded-full text-[11px] font-medium">
                      {u.full_name}
                      <button onClick={() => setSelectedUsers((prev) => prev.filter((p) => p.id !== u.id))} className="hover:text-blue-dark">&times;</button>
                    </span>
                  ))}
                </div>
              )}

              {/* Search users */}
              <div>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search people..."
                  className="w-full px-3 py-2 border border-border rounded-lg text-[13px] focus:outline-none focus:border-blue-light"
                />
              </div>

              {/* Search results */}
              {users.length > 0 && (
                <div className="border border-border rounded-lg max-h-[200px] overflow-y-auto">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        if (tab === "dm") {
                          setSelectedUsers([{ id: u.id, full_name: u.full_name }]);
                        } else {
                          setSelectedUsers((prev) => [...prev, { id: u.id, full_name: u.full_name }]);
                        }
                        setSearch("");
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-surface text-[13px] flex items-center gap-2 border-b border-border last:border-0"
                    >
                      <div className="w-7 h-7 rounded-full bg-blue flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                        {u.full_name?.[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div>
                        <div className="font-medium text-txt">{u.full_name}</div>
                        <div className="text-[11px] text-txt-light">{u.crm_email || u.personal_email}</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "announcement" && (
            <p className="text-[12px] text-txt-light">
              All active users will be automatically added. Only admins and supervisors can post messages.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-txt-light hover:text-txt rounded-lg hover:bg-surface">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={
              createConvo.isPending ||
              (tab === "dm" && selectedUsers.length !== 1) ||
              (tab === "group" && selectedUsers.length === 0)
            }
            className="px-4 py-2 bg-blue text-white text-[13px] font-medium rounded-lg hover:bg-blue-dark disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {createConvo.isPending ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
