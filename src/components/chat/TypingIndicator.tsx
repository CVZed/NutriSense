export default function TypingIndicator() {
  return (
    <div className="flex items-end gap-2 px-4">
      {/* Avatar */}
      <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center flex-shrink-0 mb-0.5">
        <span className="text-white text-xs font-bold">N</span>
      </div>

      {/* Animated dots */}
      <div className="bg-white border border-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
        <div className="flex gap-1 items-center h-4">
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}
