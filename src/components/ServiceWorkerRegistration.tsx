"use client";

import { useEffect } from "react";

/** Registers the service worker silently. Renders nothing. */
export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => {
        // SW registration failure is non-fatal — app works without it.
      });
  }, []);

  return null;
}
