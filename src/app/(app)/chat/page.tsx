"use client";

import ProfileHeader from "@/components/shell/ProfileHeader";
import ChatSection from "@/components/chat/ChatSection";

export default function ChatPage() {
  return (
    <div className="min-h-screen bg-primary flex flex-col pt-16 pb-40">
      <ProfileHeader className="px-4" />
      <ChatSection />
    </div>
  );
}
