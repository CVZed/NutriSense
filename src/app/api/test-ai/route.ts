import { anthropic, MODELS } from "@/lib/anthropic/client";

export const dynamic = "force-dynamic";

// Verifies the Anthropic SDK is wired correctly and streaming works.
// GET /api/test-ai
// Remove or gate behind auth before going to production.
export async function GET() {
  const stream = await anthropic.messages.stream({
    model: MODELS.chat,
    max_tokens: 64,
    messages: [
      {
        role: "user",
        content: "Reply with exactly: NutriSense AI is online.",
      },
    ],
  });

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        if (
          chunk.type === "content_block_delta" &&
          chunk.delta.type === "text_delta"
        ) {
          controller.enqueue(encoder.encode(chunk.delta.text));
        }
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-Accel-Buffering": "no", // Prevents Nginx from buffering the stream
    },
  });
}
