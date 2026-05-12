"use client";

import { type FormEvent, useRef, useState, useEffect } from "react";
import { Send, Camera, ScanBarcode, Sparkles, Zap, Image as ImageIcon } from "lucide-react";
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
  // Smart chips toggle
  onToggleSmartChips?: () => void;
  smartChipsVisible?: boolean;
  // Quick log toggle
  onToggleQuickLog?: () => void;
  quickLogVisible?: boolean;
  hasQuickLogButtons?: boolean;
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
  onToggleSmartChips,
  smartChipsVisible,
  onToggleQuickLog,
  quickLogVisible,
  hasQuickLogButtons,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cameraFileInputRef = useRef<HTMLInputElement>(null);   // capture="environment"
  const galleryFileInputRef = useRef<HTMLInputElement>(null);  // no capture (library)
  const cameraMenuRef = useRef<HTMLDivElement>(null);

  const [showCameraMenu, setShowCameraMenu] = useState(false);

  // Close camera menu on outside click
  useEffect(() => {
    if (!showCameraMenu) return;
    function handleClick(e: MouseEvent) {
      if (cameraMenuRef.current && !cameraMenuRef.current.contains(e.target as Node)) {
        setShowCameraMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showCameraMenu]);

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
      ta.style.height = `${Math.min(ta.scrollHeight, 100)}px`;
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    onImageSelect(file);
    e.target.value = "";
    setShowCameraMenu(false);
  }

  const hasContent = input.trim().length > 0 || !!pendingImage;
  // Allow sending (or queuing) as long as we're not actively uploading
  const canSend = hasContent && !isUploading;

  return (
    <div className="bg-white border-t border-gray-100 px-3 pt-2 pb-4 flex-shrink-0">
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
              <span className="text-xs text-gray-600 leading-none">×</span>
            </button>
          )}
          <p className="text-xs text-gray-400 mt-1">
            {isUploading ? "Uploading…" : "Photo ready — add a note or send as-is"}
          </p>
        </div>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        {/* Hidden file inputs */}
        <input
          ref={cameraFileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
        />
        <input
          ref={galleryFileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Row 1: Text area */}
        <div className="bg-gray-100 rounded-2xl flex items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder={pendingImage ? "Add a note (optional)…" : "Log everything…"}
            rows={1}
            className="flex-1 resize-none bg-transparent px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none max-h-[100px] overflow-y-auto leading-relaxed"
          />
        </div>

        {/* Row 2: Action buttons */}
        <div className="flex items-center gap-2">

          {/* Camera — tap to open action menu */}
          <div className="relative flex-shrink-0" ref={cameraMenuRef}>
            <button
              type="button"
              onClick={() => setShowCameraMenu(v => !v)}
              disabled={isUploading}
              className={cn(
                "w-9 h-9 rounded-full flex items-center justify-center transition-colors",
                pendingImage
                  ? "text-brand-500 bg-brand-50"
                  : showCameraMenu
                  ? "text-gray-700 bg-gray-200"
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-100",
                isUploading && "opacity-40 cursor-not-allowed"
              )}
              aria-label="Photo options"
            >
              <Camera className="w-5 h-5" />
            </button>

            {/* Camera action sheet */}
            {showCameraMenu && (
              <div className="absolute bottom-full left-0 mb-2 z-50 bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden w-48">
                <button
                  type="button"
                  onClick={() => cameraFileInputRef.current?.click()}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Camera className="w-4 h-4 text-gray-500" />
                  Take Photo
                </button>
                <div className="border-t border-gray-100" />
                <button
                  type="button"
                  onClick={() => galleryFileInputRef.current?.click()}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <ImageIcon className="w-4 h-4 text-gray-500" />
                  Photo Library
                </button>
                {onBarcodeScan && (
                  <>
                    <div className="border-t border-gray-100" />
                    <button
                      type="button"
                      onClick={() => { setShowCameraMenu(false); onBarcodeScan(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <ScanBarcode className="w-4 h-4 text-gray-500" />
                      Scan Barcode
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Smart chips toggle (brain/sparkle icon) */}
          {onToggleSmartChips && (
            <button
              type="button"
              onClick={onToggleSmartChips}
              className={cn(
                "flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors",
                smartChipsVisible
                  ? "text-brand-600 bg-brand-50"
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              )}
              aria-label="Toggle suggestions"
            >
              <Sparkles className="w-5 h-5" />
            </button>
          )}

          {/* Quick log toggle (bolt icon) — only when there are pinned buttons */}
          {onToggleQuickLog && hasQuickLogButtons && (
            <button
              type="button"
              onClick={onToggleQuickLog}
              className={cn(
                "flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors",
                quickLogVisible
                  ? "text-blue-600 bg-blue-50"
                  : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              )}
              aria-label="Toggle quick log"
            >
              <Zap className="w-5 h-5" />
            </button>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Send — also works as queue trigger when AI is busy */}
          <button
            type="submit"
            disabled={!canSend}
            className={cn(
              "flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all",
              canSend
                ? isLoading
                  ? "bg-gray-400 text-white shadow-sm active:scale-95"
                  : "bg-brand-500 text-white shadow-sm hover:bg-brand-600 active:scale-95"
                : "bg-gray-200 text-gray-400"
            )}
            aria-label={isLoading ? "Add to queue" : "Send message"}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
