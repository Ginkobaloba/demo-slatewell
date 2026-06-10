import { cn } from "@/lib/utils";

/**
 * Slatewell wordmark with a small calendar/grid mark.
 * Brand: deep slate blue mark, terracotta dot marking "today".
 */
export function SlatewellLogo({
  className,
  markOnly = false,
}: {
  className?: string;
  markOnly?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-foreground",
        className
      )}
    >
      <SlatewellMark className="h-[1.25em] w-[1.25em] shrink-0" />
      {!markOnly && (
        <span className="font-semibold tracking-tight">slatewell</span>
      )}
    </span>
  );
}

export function SlatewellMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <rect
        x="1.5"
        y="2.5"
        width="21"
        height="20"
        rx="4"
        className="fill-slatewell"
      />
      {/* calendar grid: 3x2 slots */}
      <rect x="5.5" y="9" width="3.6" height="3.2" rx="1" fill="#fafafa" opacity="0.55" />
      <rect x="10.2" y="9" width="3.6" height="3.2" rx="1" fill="#fafafa" opacity="0.55" />
      <rect x="14.9" y="9" width="3.6" height="3.2" rx="1" fill="#fafafa" opacity="0.55" />
      <rect x="5.5" y="13.6" width="3.6" height="3.2" rx="1" fill="#fafafa" opacity="0.55" />
      {/* "today" slot in terracotta */}
      <rect x="10.2" y="13.6" width="3.6" height="3.2" rx="1" className="fill-terracotta" />
      <rect x="14.9" y="13.6" width="3.6" height="3.2" rx="1" fill="#fafafa" opacity="0.55" />
      {/* binding bar */}
      <rect x="5.5" y="5.2" width="13" height="1.8" rx="0.9" fill="#fafafa" opacity="0.8" />
    </svg>
  );
}
