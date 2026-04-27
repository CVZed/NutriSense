"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface BarcodeScannerProps {
  onDetected: (barcode: string) => void;
  onClose: () => void;
}

type ScanState = "starting" | "scanning" | "detected" | "error";

export default function BarcodeScanner({ onDetected, onClose }: BarcodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<ScanState>("starting");
  const [errorMsg, setErrorMsg] = useState("");
  const readerRef = useRef<import("@zxing/browser").BrowserMultiFormatReader | null>(null);

  useEffect(() => {
    let cancelled = false;
    let controls: { stop: () => void } | null = null;

    async function start() {
      try {
        // Dynamically import to keep the scanner out of the main bundle
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const { NotFoundException } = await import("@zxing/library");

        if (cancelled) return;

        const reader = new BrowserMultiFormatReader();
        readerRef.current = reader;

        // Use back camera on mobile; fall back to any camera
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        const backCamera = devices.find(
          (d) => /back|rear|environment/i.test(d.label)
        );
        const deviceId = backCamera?.deviceId ?? devices[0]?.deviceId;

        if (!videoRef.current) return;
        setState("scanning");

        controls = await reader.decodeFromVideoDevice(
          deviceId,
          videoRef.current,
          (result, err) => {
            if (cancelled) return;
            if (result) {
              setState("detected");
              controls?.stop();
              onDetected(result.getText());
            } else if (err && !(err instanceof NotFoundException)) {
              // NotFoundException fires continuously while no barcode is in frame — ignore it
              console.warn("[BarcodeScanner]", err);
            }
          }
        );
      } catch (err: unknown) {
        if (cancelled) return;
        const msg =
          err instanceof Error && err.message.includes("Permission")
            ? "Camera permission denied. Please allow camera access and try again."
            : "Could not start the camera. Try again or type the barcode manually.";
        setErrorMsg(msg);
        setState("error");
      }
    }

    void start();

    return () => {
      cancelled = true;
      controls?.stop();
      readerRef.current = null;
    };
  }, [onDetected]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-safe py-3 flex-shrink-0">
        <p className="text-white text-sm font-semibold">Scan Barcode</p>
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"
          aria-label="Close scanner"
        >
          <X className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Camera view */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
          autoPlay
        />

        {/* Dimmed overlay with cut-out viewfinder */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Top */}
          <div className="absolute top-0 left-0 right-0 h-[28%] bg-black/55" />
          {/* Bottom */}
          <div className="absolute bottom-0 left-0 right-0 h-[28%] bg-black/55" />
          {/* Left */}
          <div className="absolute top-[28%] bottom-[28%] left-0 w-[8%] bg-black/55" />
          {/* Right */}
          <div className="absolute top-[28%] bottom-[28%] right-0 w-[8%] bg-black/55" />

          {/* Viewfinder border */}
          <div
            className={`absolute top-[28%] bottom-[28%] left-[8%] right-[8%] rounded-xl border-2 transition-colors duration-300 ${
              state === "detected"
                ? "border-green-400"
                : "border-white/70"
            }`}
          >
            {/* Corner accents */}
            {["top-0 left-0", "top-0 right-0", "bottom-0 left-0", "bottom-0 right-0"].map((pos, i) => (
              <div
                key={i}
                className={`absolute w-6 h-6 border-brand-400 ${pos} ${
                  i === 0 ? "border-t-2 border-l-2 rounded-tl-xl" :
                  i === 1 ? "border-t-2 border-r-2 rounded-tr-xl" :
                  i === 2 ? "border-b-2 border-l-2 rounded-bl-xl" :
                            "border-b-2 border-r-2 rounded-br-xl"
                }`}
              />
            ))}

            {/* Scanning line animation */}
            {state === "scanning" && (
              <div className="absolute left-0 right-0 h-0.5 bg-brand-400/80 animate-scan-line" />
            )}
          </div>
        </div>

        {/* Status overlays */}
        {state === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <p className="text-white text-sm">Starting camera…</p>
            </div>
          </div>
        )}

        {state === "detected" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="flex flex-col items-center gap-2">
              <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-white text-sm font-medium">Barcode detected!</p>
            </div>
          </div>
        )}

        {state === "error" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70 px-8">
            <div className="flex flex-col items-center gap-4 text-center">
              <span className="text-4xl">📷</span>
              <p className="text-white text-sm">{errorMsg}</p>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-white/20 rounded-xl text-white text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer hint */}
      {state === "scanning" && (
        <div className="flex-shrink-0 pb-safe px-4 py-4 text-center">
          <p className="text-white/60 text-xs">Point the camera at a barcode on any packaged food</p>
        </div>
      )}
    </div>
  );
}
