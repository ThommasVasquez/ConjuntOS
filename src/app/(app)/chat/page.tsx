"use client";

import ProfileHeader from "@/components/shell/ProfileHeader";
import ChatSection from "@/components/chat/ChatSection";

export default function ChatPage() {
  return (
    <div className="absolute inset-0 bg-primary flex flex-col pt-[calc(4rem+env(safe-area-inset-top,0px))] pb-40 overflow-hidden">
      <ProfileHeader className="px-4 shrink-0 border-b border-border" />
      <ChatSection />
    </div>
  );
}
