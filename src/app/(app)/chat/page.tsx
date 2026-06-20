"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ProfileHeader from "@/components/shell/ProfileHeader";
import ChatSection from "@/components/chat/ChatSection";

function ChatContent() {
  const searchParams = useSearchParams();
  const huespedId = searchParams.get("huespedId") || undefined;

  return (
    <div className="absolute inset-0 bg-primary flex flex-col pt-[calc(4rem+env(safe-area-inset-top,0px))] pb-40 overflow-hidden">
      <ProfileHeader className="px-4 shrink-0 border-b border-border" />
      <ChatSection huespedId={huespedId} />
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="absolute inset-0 bg-primary flex items-center justify-center">
        <div className="animate-spin h-6 w-6 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    }>
      <ChatContent />
    </Suspense>
  );
}
