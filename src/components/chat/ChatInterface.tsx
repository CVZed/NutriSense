"use client";

import { useEffect, useRef, useCallback, useState, type ChangeEvent } from "react";
import { useChat } from "ai/react";
import { createClient } from "@/lib/supabase/client";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";
import ChatInput from "./ChatInput";
import LogEntryCard from "./LogEntryCard";
import BarcodeScanner from "./BarcodeScanner";
import type { Message } from "ai";
import type { QuickLogButton } from "@/types/database";
import type { BarcodeResult } from "@/app/api/barcode/route";

type LogEntry = Record<string, unknown>;

/** Read a File as a raw base64 string (no data-URL prefix) via FileReader. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const commaIdx = result.indexOf(",");
      resolve(commaIdx !== -1 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

interface ChatInterfaceProps {
  initialMessages: Message[];
  onboardingComplete: boolean;
  onOnboardingComplete?: () => void;
  quickLogButtons?: QuickLogButton[];
}

export default function ChatInterface({
  initialMessages,
  onboardingComplete,
  onOnboardingComplete,
  quickLogButtons = [],
}: ChatInterfaceProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasNotifiedCompletion = useRef(false);

  const [sessionId] = useState(() => crypto.randomUUID());

  // ── Image attachment state ────────────────────────────────────────────────
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // ── Barcode scanner state ─────────────────────────────────────────────────
  const [showScanner, setShowScanner] = useState(false);
  const [barcodeLoading, setBarcodeLoading] = useState(false);

  function handleImageSelect(file: File | null) {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setPendingImage(file);
    setImagePreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  // ── Log entry cards ───────────────────────────────────────────────────────
  const [currentLogEntries, setCurrentLogEntries] = useState<LogEntry[]>([]);
  const dataLengthRef = useRef(0);

  const { messages, data, input, handleInputChange, handleSubmit, append, isLoading, error } =
    useChat({
      api: "/api/chat",
      initialMessages,
      body: { sessionId, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
      onFinish: (message) => {
        if (
          !onboardingComplete &&
          !hasNotifiedCompletion.current &&
          (message.content.includes("all set") ||
            message.content.includes("daily target") ||
            message.content.includes("calorie"))
        ) {
          hasNotifiedCompletion.current = true;
          onOnboardingComplete?.();
        }
      },
    });

  useEffect(() => {
    if (isLoading) {
      dataLengthRef.current = data?.length ?? 0;
      setCurrentLogEntries([]);
    } else {
      const newItems = (data ?? []).slice(dataLengthRef.current);
      const newEntries = newItems
        .filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (d): d is any =>
            typeof d === "object" &&
            d !== null &&
            (d as Record<string, unknown>).type === "log_entries"
        )
        .flatMap((d: { entries: LogEntry[] }) => d.entries);
      if (newEntries.length > 0) setCurrentLogEntries(newEntries);
    }
  }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Barcode detected → look up nutrition → send to AI ────────────────────
  const handleBarcodeDetected = useCallback(async (barcode: string) => {
    setShowScanner(false);
    setBarcodeLoading(true);
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    try {
      const res = await fetch(`/api/barcode?upc=${encodeURIComponent(barcode)}`);
      const barcodeData: BarcodeResult = await res.json();

      let message: string;
      if (barcodeData.found && barcodeData.name) {
        const lines: string[] = [
          `I just scanned a barcode. Please call create_log_entry right now to log this as food:`,
          `- food_name: ${barcodeData.name}`,
        ];
        if (barcodeData.brand) lines.push(`- brand: ${barcodeData.brand}`);
        if (barcodeData.servingSize) lines.push(`- serving size: ${barcodeData.servingSize}`);
        if (barcodeData.calories != null) lines.push(`- calories: ${barcodeData.calories}`);
        if (barcodeData.protein_g != null) lines.push(`- protein_g: ${barcodeData.protein_g}`);
        if (barcodeData.carbs_g != null) lines.push(`- carbs_g: ${barcodeData.carbs_g}`);
        if (barcodeData.fat_g != null) lines.push(`- fat_g: ${barcodeData.fat_g}`);
        if (barcodeData.fiber_g != null) lines.push(`- fiber_g: ${barcodeData.fiber_g}`);
        if (barcodeData.sodium_mg != null) lines.push(`- sodium_mg: ${barcodeData.sodium_mg}`);
        lines.push(`- data_source: text`);
        lines.push(`- ai_confidence: high`);
        lines.push(`(Data from barcode database — use these exact values, no need to look them up.)`);
        message = lines.join("\n");
      } else {
        message = `I scanned a food barcode: ${barcode}. It wasn't in the database. What food is this — can you help me log it?`;
      }

      void append(
        { role: "user", content: message },
        { body: { sessionId, timezone: tz } }
      );
    } catch {
      void append(
        { role: "user", content: `I scanned a food barcode: ${barcode}. Please help me log it.` },
        { body: { sessionId, timezone: tz } }
      );
    } finally {
      setBarcodeLoading(false);
    }
  }, [append, sessionId]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  // ── Custom submit: upload image first, then hand off to useChat ──────────
  const handleFormSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!input.trim() && !pendingImage) return;

      if (pendingImage) {
        setIsUploading(true);
        let uploadedUrl: string | null = null;
        let imageBase64: string | null = null;
        const imageMimeType = pendingImage.type || "image/jpeg";

        // Read file as base64 via FileReader — simple, reliable, no canvas needed.
        // This is sent as a body field (we confirmed body fields reach the server).
        try {
          imageBase64 = await fileToBase64(pendingImage!);
        } catch {
          // FileReader failed — server will fall back to fetching imageUrl
        }

        // Also upload to Supabase Storage for persistent thumbnail display
        try {
          const supabase = createClient();
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            const ext = pendingImage.name.split(".").pop() ?? "jpg";
            const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
            const { error: uploadError } = await supabase.storage
              .from("meal-photos")
              .upload(path, pendingImage, { contentType: pendingImage.type, upsert: false });

            if (!uploadError) {
              const { data: urlData } = supabase.storage
                .from("meal-photos")
                .getPublicUrl(path);
              uploadedUrl = urlData.publicUrl;
            }
          }
        } catch {
          // Upload failed — image won't have a persistent thumbnail, but logging still works
        } finally {
          setIsUploading(false);
        }

        // Clear preview state
        if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
        setPendingImage(null);
        setImagePreviewUrl(null);

        // Send imageBase64 as a plain body field — confirmed to reach the server
        // (imageUrl already proves body fields work). imageUrl is also kept for
        // thumbnail display in log entry cards.
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        void append(
          { role: "user", content: input.trim() || "📷" },
          { body: { sessionId, timezone: tz, imageUrl: uploadedUrl, imageBase64, imageMimeType } }
        );

        // Clear the text input manually (append doesn't do this automatically)
        handleInputChange({ target: { value: "" } } as ChangeEvent<HTMLInputElement>);
        return;
      }

      // No image — normal submit
      handleSubmit(e);
    },
    [input, pendingImage, imagePreviewUrl, handleSubmit, append, handleInputChange, sessionId]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Barcode scanner overlay */}
      {showScanner && (
        <BarcodeScanner
          onDetected={handleBarcodeDetected}
          onClose={() => setShowScanner(false)}
        />
      )}
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 pt-safe flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center">
          <span className="text-white text-sm font-bold">N</span>
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">NutriSense</p>
          <p className="text-xs text-gray-400">
            {onboardingComplete ? "Your health companion" : "Setting up your profile"}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-3">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {isLoading && <TypingIndicator />}

        {error && (
          <div className="mx-4 p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-600">
            Something went wrong. Please try again.
          </div>
        )}

        {/* Log entry cards from the most recent AI response */}
        {currentLogEntries.length > 0 && !isLoading && (
          <div className="px-4 space-y-2">
            {currentLogEntries.map((entry, i) => (
              <LogEntryCard
                key={i}
                entryType={String(entry.entry_type ?? "note")}
                data={entry}
                loggedAt={entry.logged_at ? String(entry.logged_at) : undefined}
              />
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Quick-log buttons */}
      {onboardingComplete && quickLogButtons.filter(b => b.enabled).length > 0 && (
        <div className="bg-white border-t border-gray-100 px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar">
          {quickLogButtons.filter(b => b.enabled).map(btn => (
            <button
              key={btn.id}
              disabled={isLoading}
              onClick={() => {
                // Subtle haptic tap on supported devices (Android Chrome, etc.)
                if (typeof navigator !== "undefined" && "vibrate" in navigator) {
                  navigator.vibrate(10);
                }
                const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                void append(
                  { role: "user", content: btn.message },
                  { body: { sessionId, timezone: tz } }
                );
              }}
              className="flex-shrink-0 flex items-center gap-1.5 bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full text-xs font-medium active:bg-blue-100 disabled:opacity-40 transition-colors"
            >
              {btn.emoji} {btn.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <ChatInput
        input={input}
        onInputChange={handleInputChange}
        onSubmit={handleFormSubmit}
        isLoading={isLoading || barcodeLoading}
        pendingImage={pendingImage}
        imagePreviewUrl={imagePreviewUrl}
        onImageSelect={handleImageSelect}
        isUploading={isUploading}
        onBarcodeScan={() => setShowScanner(true)}
      />
    </div>
  );
}
