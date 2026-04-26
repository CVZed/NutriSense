"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AppError({ error, reset }: Props) {
  const router = useRouter();

  useEffect(() => {
    console.error("[App Error]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-[calc(100dvh-64px)] px-6 text-center bg-gray-50">
      <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mb-4">
        <span className="text-2xl">😬</span>
      </div>
      <h2 className="text-base font-semibold text-gray-900 mb-1">Oops, something went wrong</h2>
      <p className="text-sm text-gray-400 mb-6 max-w-xs">
        We hit an unexpected error. Your data is safe — try refreshing.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => router.push("/chat")}
          className="border border-gray-200 text-gray-600 rounded-xl px-4 py-2 text-sm font-medium"
        >
          Go to Chat
        </button>
        <button
          onClick={reset}
          className="bg-brand-500 text-white rounded-xl px-4 py-2 text-sm font-medium"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
