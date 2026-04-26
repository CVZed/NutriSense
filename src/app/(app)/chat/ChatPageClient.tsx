"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ChatInterface from "@/components/chat/ChatInterface";
import type { Message } from "ai";
import type { QuickLogButton } from "@/types/database";

interface ChatPageClientProps {
  initialMessages: Message[];
  onboardingComplete: boolean;
  quickLogButtons: QuickLogButton[];
}

export default function ChatPageClient({
  initialMessages,
  onboardingComplete: initialOnboardingComplete,
  quickLogButtons,
}: ChatPageClientProps) {
  const router = useRouter();
  const [onboardingComplete, setOnboardingComplete] = useState(
    initialOnboardingComplete
  );

  function handleOnboardingComplete() {
    setOnboardingComplete(true);
    // Refresh the server component so profile data is up to date
    router.refresh();
  }

  return (
    <div className="h-[calc(100dvh-64px)] flex justify-center bg-gray-50">
      <div className="w-full md:max-w-2xl md:shadow-xl md:border-x md:border-gray-200 bg-white h-full">
        <ChatInterface
          initialMessages={initialMessages}
          onboardingComplete={onboardingComplete}
          onOnboardingComplete={handleOnboardingComplete}
          quickLogButtons={quickLogButtons}
        />
      </div>
    </div>
  );
}
