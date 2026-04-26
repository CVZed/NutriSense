import { cn } from "@/lib/utils";
import type { Message } from "ai";

interface MessageBubbleProps {
  message: Message;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  // Extract plain text content only
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contentParts = message.content as any;
  const textContent =
    typeof message.content === "string"
      ? message.content
      : Array.isArray(contentParts)
      ? (contentParts as Array<{ type: string; text?: string }>)
          .filter((p) => p.type === "text")
          .map((p) => p.text ?? "")
          .join("")
      : "";

  if (!textContent.trim()) return null;

  return (
    <div
      className={cn(
        "flex items-end gap-2 px-4",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar — assistant only */}
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center flex-shrink-0 mb-0.5">
          <span className="text-white text-xs font-bold">N</span>
        </div>
      )}

      <div className={cn("max-w-[78%]", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm",
            isUser
              ? "bg-brand-500 text-white rounded-br-sm"
              : "bg-white border border-gray-100 text-gray-800 rounded-bl-sm"
          )}
        >
          {textContent.split("\n").map((line, i, arr) => (
            <span key={i}>
              {line}
              {i < arr.length - 1 && <br />}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
