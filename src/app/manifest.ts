import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NutriSense",
    short_name: "NutriSense",
    description: "Your conversational health and nutrition companion",
    start_url: "/chat",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f9fafb",
    theme_color: "#22c55e",
    icons: [
      {
        src: "/api/pwa-icon?size=192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/api/pwa-icon?size=512",
        sizes: "512x512",
        type: "image/png",
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore — "maskable any" is valid PWA but not in Next.js types yet
        purpose: "maskable any",
      },
    ],
  };
}
