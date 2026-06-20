"use client";

import ProfileHeader from "@/components/shell/ProfileHeader";
import ChatSection from "@/components/chat/ChatSection";

export default function ChatPage() {
  return (
    <div className="h-full bg-primary flex flex-col pt-[calc(4rem+env(safe-area-inset-top,0px))] pb-40">
      <ProfileHeader className="px-4 shrink-0 pb-3 border-b border-border" />
      <ChatSection />
    </div>
  );
}
