"use client";

import { type FormEvent, useRef } from "react";
import { Send, Camera, X, ScanBarcode } from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

interface ChatInputProps {
  input: string;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  isLoading: boolean;
  pendingImage: File | null;
  imagePreviewUrl: string | null;
  onImageSelect: (file: File | null) => void;
  isUploading?: boolean;
  onBarcodeScan?: () => void;
}

export default function ChatInput({
  input,
  onInputChange,
  onSubmit,
  isLoading,
  pendingImage,
  imagePreviewUrl,
  onImageSelect,
  isUploading = false,
  onBarcodeScan,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) {
        const form = e.currentTarget.closest("form");
        form?.requestSubmit();
      }
    }
  }

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onInputChange(e);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "auto";
      // Cap at 5 lines (~100px) so the input never dominates the screen on mobile
      ta.style.height = `${Math.min(ta.scrollHeight, 100)}px`;
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    onImageSelect(file);
    e.target.value = ""; // reset so same file can be re-selected
  }

  const busy = isLoading || isUploading;
  // Allow send when there's text OR a pending image (and not busy)
  const canSend = (input.trim().length > 0 || !!pendingImage) && !busy;

  return (
    <div className="bg-white border-t border-gray-100 px-3 py-2 pb-safe flex-shrink-0">
      {/* Image preview strip */}
      {imagePreviewUrl && (
        <div className="mb-2 flex items-start gap-2">
          <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200 flex-shrink-0">
            <Image src={imagePreviewUrl} alt="Photo to log" fill className="object-cover" />
            {isUploading && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          {!isUploading && (
            <button
              type="button"
              onClick={() => onImageSelect(null)}
              className="w-5 h-5 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center transition-colors mt-0.5"
              aria-label="Remove photo"
            >
              <X className="w-3 h-3 text-gray-600" />
            </button>
          )}
          <p className="text-xs text-gray-400 mt-1">
            {isUploading ? "Uploading…" : "Photo ready — add a note or send as-is"}
          </p>
        </div>
      )}

      <form onSubmit={onSubmit} className="flex items-end gap-2">
        {/* Hidden file input — camera on mobile, file picker on desktop */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Camera / attach button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
          className={cn(
            "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors",
            pendingImage
              ? "text-brand-500 bg-brand-50"
              : "text-gray-400 hover:text-gray-600 hover:bg-gray-100",
            busy && "opacity-40 cursor-not-allowed"
          )}
          aria-label="Attach photo"
        >
          <Camera className="w-5 h-5" />
        </button>

        {/* Barcode scan button */}
        {onBarcodeScan && (
          <button
            type="button"
            onClick={onBarcodeScan}
            disabled={busy}
            className={cn(
              "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-colors",
              "text-gray-400 hover:text-gray-600 hover:bg-gray-100",
              busy && "opacity-40 cursor-not-allowed"
            )}
            aria-label="Scan barcode"
          >
            <ScanBarcode className="w-5 h-5" />
          </button>
        )}

        {/* Text input */}
        <div className="flex-1 relative bg-gray-100 rounded-2xl flex items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={pendingImage ? "Add a note (optional)…" : "Log food, exercise, sleep, mood…"}
            rows={1}
            disabled={busy}
            className="flex-1 resize-none bg-transparent px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none max-h-[100px] overflow-y-auto leading-relaxed"
          />
        </div>

        {/* Send button */}
        <button
          type="submit"
          disabled={!canSend}
          className={cn(
            "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all",
            canSend
              ? "bg-brand-500 text-white shadow-sm hover:bg-brand-600 active:scale-95"
              : "bg-gray-200 text-gray-400"
          )}
          aria-label="Send message"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
