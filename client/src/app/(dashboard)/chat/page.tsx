"use client";

import ChatSidebar from "@/components/features/chat/ChatSidebar";
import ChatWindow from "@/components/features/chat/ChatWindow";

export default function ChatPage() {
  return (
    <div className="flex-1 flex overflow-hidden h-screen">
      <ChatSidebar />
      <ChatWindow />
    </div>
  );
}
