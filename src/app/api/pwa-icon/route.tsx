import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

// Generates PWA icons at any size. Used by the manifest for 192x192 and 512x512.
// GET /api/pwa-icon?size=192
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const size = Math.min(512, Math.max(16, parseInt(searchParams.get("size") ?? "192", 10)));

  const borderRadius = Math.round(size * 0.18);
  const fontSize = Math.round(size * 0.58);

  return new ImageResponse(
    (
      <div
        style={{
          background: "#22c55e",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: `${borderRadius}px`,
        }}
      >
        <span
          style={{
            color: "white",
            fontSize,
            fontWeight: 800,
            fontFamily: "system-ui, sans-serif",
            lineHeight: 1,
          }}
        >
          N
        </span>
      </div>
    ),
    { width: size, height: size }
  );
}
