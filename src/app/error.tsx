"use client";

import { useEffect } from "react";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    // Log to your error-tracking service here if needed
    console.error("[Global Error]", error);
  }, [error]);

  return (
    <html>
      <body>
        <div className="min-h-dvh flex flex-col items-center justify-center bg-gray-50 px-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mb-4">
            <span className="text-3xl">⚠️</span>
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mb-1">Something went wrong</h1>
          <p className="text-sm text-gray-500 mb-6 max-w-xs">
            An unexpected error occurred. Your data is safe.
          </p>
          <button
            onClick={reset}
            className="bg-brand-500 text-white rounded-xl px-6 py-2.5 text-sm font-medium"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
