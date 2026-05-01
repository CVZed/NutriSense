"use client";

import { useEffect, useRef, useCallback, useState, useMemo, type ChangeEvent } from "react";
import { useChat } from "ai/react";
import { createClient } from "@/lib/supabase/client";
import MessageBubble from "./MessageBubble";
import TypingIndicator from "./TypingIndicator";
import ChatInput from "./ChatInput";
import LogEntryCard from "./LogEntryCard";
import BarcodeScanner from "./BarcodeScanner";
import { X } from "lucide-react";
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

// ── Queue ─────────────────────────────────────────────────────────────────────
interface QueueItem {
  id: string;
  text: string;
  previewUrl?: string;   // object URL for display (revoked after send)
  imageFile?: File;      // original File for upload when draining
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

  // ── Message queue state ───────────────────────────────────────────────────
  const [messageQueue, setMessageQueue] = useState<QueueItem[]>([]);

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

  // ── Smart contextual chips ────────────────────────────────────────────────
  const smartChips = useMemo(() => {
    const hour = new Date().getHours();
    let mealLabel = "🍽️ Suggest a meal";
    let mealMsg = "What should I eat? Ask me what I have available, then suggest 2–3 meal options that fit my remaining macros and calories for today.";
    if (hour >= 5  && hour < 10) { mealLabel = "🌅 Suggest breakfast"; mealMsg = "What should I have for breakfast? Ask me what I have available, then suggest 2–3 options that fit my remaining macros for today."; }
    else if (hour >= 10 && hour < 12) { mealLabel = "🍳 Suggest brunch";    mealMsg = "What should I have for brunch? Ask me what I have available, then suggest 2–3 options that fit my remaining macros for today."; }
    else if (hour >= 12 && hour < 15) { mealLabel = "☀️ Suggest lunch";     mealMsg = "What should I have for lunch? Ask me what I have available, then suggest 2–3 options that fit my remaining macros for today."; }
    else if (hour >= 15 && hour < 18) { mealLabel = "🍎 Suggest a snack";   mealMsg = "What should I snack on? Ask me what I have available, then suggest 2–3 options that fit my remaining macros for today."; }
    else if (hour >= 18 && hour < 21) { mealLabel = "🌙 Suggest dinner";    mealMsg = "What should I make for dinner? Ask me what I have available, then suggest 2–3 options that fit my remaining macros for today."; }
    return [
      { label: mealLabel,           message: mealMsg },
      { label: "💧 Log water",       message: "I just had a glass of water." },
      { label: "📊 Daily check-in",  message: "How am I tracking today? Give me a quick overview of my calories and macros." },
    ];
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Shared image upload helper ────────────────────────────────────────────
  const uploadImage = useCallback(async (file: File): Promise<{ imageBase64: string | null; imageUrl: string | null; imageMimeType: string }> => {
    const imageMimeType = file.type || "image/jpeg";
    let imageBase64: string | null = null;
    let imageUrl: string | null = null;

    try { imageBase64 = await fileToBase64(file); } catch { /* ignore */ }

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const ext = file.name.split(".").pop() ?? "jpg";
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("meal-photos")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from("meal-photos").getPublicUrl(path);
          imageUrl = urlData.publicUrl;
        }
      }
    } catch { /* ignore */ }

    return { imageBase64, imageUrl, imageMimeType };
  }, []);

  // ── Queue: add current input + image to queue ─────────────────────────────
  const handleQueueMessage = useCallback(() => {
    if (!input.trim() && !pendingImage) return;
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(10);

    const item: QueueItem = {
      id: crypto.randomUUID(),
      text: input.trim(),
      previewUrl: imagePreviewUrl ?? undefined,
      imageFile: pendingImage ?? undefined,
    };

    setMessageQueue(prev => [...prev, item]);

    // Clear input + image so the user can compose another message immediately
    handleInputChange({ target: { value: "" } } as ChangeEvent<HTMLInputElement>);
    setPendingImage(null);
    setImagePreviewUrl(null);
    // Don't revoke previewUrl yet — we still show it in the queue bubble
  }, [input, pendingImage, imagePreviewUrl, handleInputChange]);

  // ── Queue: remove an item ─────────────────────────────────────────────────
  const removeFromQueue = useCallback((id: string) => {
    setMessageQueue(prev => {
      const item = prev.find(i => i.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter(i => i.id !== id);
    });
  }, []);

  // ── Queue: send one item ──────────────────────────────────────────────────
  const sendQueuedItem = useCallback(async (item: QueueItem) => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

    if (item.imageFile) {
      setIsUploading(true);
      try {
        const { imageBase64, imageUrl, imageMimeType } = await uploadImage(item.imageFile);
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        void append(
          { role: "user", content: item.text || "📷" },
          { body: { sessionId, timezone: tz, imageUrl, imageBase64, imageMimeType } }
        );
      } finally {
        setIsUploading(false);
      }
    } else {
      void append(
        { role: "user", content: item.text },
        { body: { sessionId, timezone: tz } }
      );
    }
  }, [append, sessionId, uploadImage]);

  // ── Queue: auto-drain when AI finishes and input is empty ─────────────────
  const prevLoadingRef = useRef(false);
  const inputRef = useRef(input);
  const messageQueueRef = useRef(messageQueue);
  const sendQueuedItemRef = useRef(sendQueuedItem);
  useEffect(() => { inputRef.current = input; }, [input]);
  useEffect(() => { messageQueueRef.current = messageQueue; }, [messageQueue]);
  useEffect(() => { sendQueuedItemRef.current = sendQueuedItem; }, [sendQueuedItem]);

  useEffect(() => {
    const wasLoading = prevLoadingRef.current;
    prevLoadingRef.current = isLoading;

    // Only drain when loading transitions false AND user hasn't typed a reply
    if (wasLoading && !isLoading && messageQueueRef.current.length > 0 && !inputRef.current.trim()) {
      const timer = setTimeout(() => {
        const queue = messageQueueRef.current;
        if (queue.length === 0) return;
        const [next, ...rest] = queue;
        setMessageQueue(rest);
        void sendQueuedItemRef.current(next);
      }, 450);
      return () => clearTimeout(timer);
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
        try {
          const { imageBase64, imageUrl, imageMimeType } = await uploadImage(pendingImage);
          if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
          setPendingImage(null);
          setImagePreviewUrl(null);
          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
          void append(
            { role: "user", content: input.trim() || "📷" },
            { body: { sessionId, timezone: tz, imageUrl, imageBase64, imageMimeType } }
          );
          handleInputChange({ target: { value: "" } } as ChangeEvent<HTMLInputElement>);
        } finally {
          setIsUploading(false);
        }
        return;
      }

      // No image — normal submit
      handleSubmit(e);
    },
    [input, pendingImage, imagePreviewUrl, handleSubmit, append, handleInputChange, sessionId, uploadImage]
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
      <div className="bg-white border-b border-gray-100 px-4 py-3 pt-safe flex items-center gap-3 flex-shrink-0">
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

      {/* ── Queue bubbles ── */}
      {messageQueue.length > 0 && (
        <div className="bg-white border-t border-gray-100 px-3 pt-2 pb-1 space-y-1.5 flex-shrink-0">
          <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-widest px-1">
            Queued · {messageQueue.length}
          </p>
          {messageQueue.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-2xl px-3 py-1.5 min-w-0">
                {item.previewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.previewUrl} alt="" className="w-7 h-7 rounded-lg object-cover flex-shrink-0" />
                )}
                <span className="text-sm text-gray-500 truncate">
                  {item.text || (item.previewUrl ? "📷 Photo" : "")}
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeFromQueue(item.id)}
                className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors"
                aria-label="Remove from queue"
              >
                <X className="w-3 h-3 text-gray-500" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Smart contextual chips — visible when input is empty */}
      {onboardingComplete && !input.trim() && !isLoading && messageQueue.length === 0 && (
        <div className="bg-white border-t border-gray-100 px-3 pt-2 pb-1 flex gap-2 overflow-x-auto no-scrollbar flex-shrink-0">
          {smartChips.map((chip) => (
            <button
              key={chip.label}
              disabled={isLoading}
              onClick={() => {
                if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(10);
                const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                void append(
                  { role: "user", content: chip.message },
                  { body: { sessionId, timezone: tz } }
                );
              }}
              className="flex-shrink-0 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap disabled:opacity-40"
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* Quick-log buttons (user-configured) */}
      {onboardingComplete && quickLogButtons.filter(b => b.enabled).length > 0 && (
        <div className="bg-white px-4 py-2 flex gap-2 overflow-x-auto no-scrollbar flex-shrink-0">
          {quickLogButtons.filter(b => b.enabled).map(btn => (
            <button
              key={btn.id}
              disabled={isLoading}
              onClick={() => {
                if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(10);
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
        onQueue={handleQueueMessage}
      />
    </div>
  );
}
