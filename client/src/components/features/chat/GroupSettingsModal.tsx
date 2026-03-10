"use client";

import { useState } from "react";
import {
  useConversationMembers,
  useUpdateConversation,
  useDeleteConversation,
  useAddMembers,
  useRemoveMember,
  usePromoteMember,
  useUserSearch,
} from "@/lib/hooks";
import { useChatStore } from "@/lib/chatStore";
import type { Conversation } from "@/types";

interface Props {
  conversation: Conversation;
  userId: string;
  onClose: () => void;
}

export default function GroupSettingsModal({ conversation: c, userId, onClose }: Props) {
  const [name, setName] = useState(c.name ?? "");
  const [description, setDescription] = useState(c.description ?? "");
  const [addSearch, setAddSearch] = useState("");
  const { data: members } = useConversationMembers(c.id);
  const { data: searchResults } = useUserSearch(addSearch);
  const updateConvo = useUpdateConversation();
  const deleteConvo = useDeleteConversation();
  const addMembers = useAddMembers();
  const removeMember = useRemoveMember();
  const promoteMember = usePromoteMember();
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);

  const isAdmin = c.is_admin;
  const memberIds = new Set((members ?? []).map((m) => m.user_id));
  const searchUsers = (searchResults?.data ?? []).filter((u) => !memberIds.has(u.id));

  const handleSave = () => {
    updateConvo.mutate({ id: c.id, name, description }, { onSuccess: onClose });
  };

  const handleDelete = () => {
    if (!confirm("Archive this conversation? It will be hidden from all members.")) return;
    deleteConvo.mutate(c.id, {
      onSuccess: () => {
        setActiveConversation(null);
        onClose();
      },
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-xl w-[480px] max-h-[600px] flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-navy">
            {c.type === "announcement" ? "Channel Settings" : "Group Settings"}
          </h3>
          <button onClick={onClose} className="text-txt-light hover:text-txt text-xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Name & Description */}
          {isAdmin && (
            <>
              <div>
                <label className="text-[11px] font-medium text-txt-light uppercase tracking-wide">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-[13px] focus:outline-none focus:border-blue-light"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-txt-light uppercase tracking-wide">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border border-border rounded-lg text-[13px] focus:outline-none focus:border-blue-light"
                />
              </div>
              <button
                onClick={handleSave}
                disabled={updateConvo.isPending}
                className="px-4 py-2 bg-blue text-white text-[12px] font-medium rounded-lg hover:bg-blue-dark disabled:opacity-40"
              >
                Save Changes
              </button>
            </>
          )}

          {/* Members */}
          <div>
            <div className="text-[11px] font-medium text-txt-light uppercase tracking-wide mb-2">
              Members ({members?.length ?? 0})
            </div>
            <div className="border border-border rounded-lg max-h-[200px] overflow-y-auto">
              {(members ?? []).map((m) => (
                <div key={m.user_id} className="flex items-center gap-2 px-3 py-2 border-b border-border last:border-0">
                  {m.profile_image_url ? (
                    <img src={m.profile_image_url} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-blue flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                      {m.full_name?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-txt truncate">
                      {m.full_name}
                      {m.user_id === userId && <span className="text-txt-light ml-1">(you)</span>}
                    </div>
                    <div className="text-[10px] text-txt-light capitalize">
                      {m.is_admin ? "Admin" : "Member"} &middot; {m.role?.replace(/_/g, " ")}
                    </div>
                  </div>
                  {isAdmin && m.user_id !== userId && (
                    <div className="flex gap-1">
                      {!m.is_admin && (
                        <button
                          onClick={() => promoteMember.mutate({ conversationId: c.id, userId: m.user_id })}
                          className="text-[10px] px-2 py-1 rounded bg-surface hover:bg-blue/10 text-txt-light hover:text-blue"
                          title="Promote to admin"
                        >
                          Promote
                        </button>
                      )}
                      <button
                        onClick={() => removeMember.mutate({ conversationId: c.id, userId: m.user_id })}
                        className="text-[10px] px-2 py-1 rounded bg-surface hover:bg-red-50 text-txt-light hover:text-red-500"
                        title="Remove"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Add members */}
          {isAdmin && (
            <div>
              <div className="text-[11px] font-medium text-txt-light uppercase tracking-wide mb-2">Add Members</div>
              <input
                type="text"
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                placeholder="Search people..."
                className="w-full px-3 py-2 border border-border rounded-lg text-[13px] focus:outline-none focus:border-blue-light"
              />
              {searchUsers.length > 0 && (
                <div className="mt-1 border border-border rounded-lg max-h-[150px] overflow-y-auto">
                  {searchUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        addMembers.mutate({ conversationId: c.id, member_ids: [u.id] });
                        setAddSearch("");
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-surface text-[12px] flex items-center gap-2 border-b border-border last:border-0"
                    >
                      <div className="w-6 h-6 rounded-full bg-blue flex items-center justify-center text-[9px] font-bold text-white">
                        {u.full_name?.[0]?.toUpperCase() ?? "?"}
                      </div>
                      <span className="text-txt">{u.full_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Delete */}
          {isAdmin && (
            <div className="pt-2 border-t border-border">
              <button
                onClick={handleDelete}
                className="text-[12px] text-red-500 hover:text-red-600 font-medium"
              >
                Archive Conversation
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
