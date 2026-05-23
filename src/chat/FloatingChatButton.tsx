interface FloatingChatButtonProps {
  open: boolean;
  onClick: () => void;
}

/**
 * The persistent "open chat" affordance. Bottom-right on desktop, bottom-
 * center floating action button on mobile. Hidden when the panel is open
 * so it doesn't overlap.
 */
export function FloatingChatButton({ open, onClick }: FloatingChatButtonProps) {
  if (open) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      title="Chat with Elle"
      aria-label="Open chat with Elle"
      className="fixed bottom-4 right-4 z-30 inline-flex items-center gap-2 rounded-full
                 bg-accent px-4 py-3 text-sm font-semibold text-white shadow-lg
                 transition-transform hover:scale-105 hover:bg-accent-hover
                 md:bottom-6 md:right-6"
    >
      <ChatGlyph />
      <span className="hidden sm:inline">Ask Elle</span>
    </button>
  );
}

function ChatGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
