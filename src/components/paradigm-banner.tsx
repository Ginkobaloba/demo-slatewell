"use client";

import { useEffect, useState } from "react";

const COOKIE_NAME = "paradigm_banner_dismissed";
const DISMISS_DAYS = 7;

function isDismissed(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((c) => c.trim().startsWith(`${COOKIE_NAME}=`));
}

function dismiss() {
  const expires = new Date(
    Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000
  ).toUTCString();
  document.cookie = `${COOKIE_NAME}=1; expires=${expires}; path=/; samesite=lax`;
}

/**
 * Paradigm attribution banner. Sits at the very bottom of every page, in
 * Paradigm colors (NOT Slatewell colors), per the demo program spec:
 * 32px tall, #1f5a44 on #f7f5f0, dismissible with a 7-day cookie,
 * icon-only on mobile.
 *
 * This is a local implementation of the Phase 0 shared banner spec; swap
 * for the shared component when Phase 0 publishes it.
 */
export function ParadigmBanner() {
  // Render nothing until mounted so SSR markup matches the client.
  const [mounted, setMounted] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    setMounted(true);
    setHidden(isDismissed());
  }, []);

  if (!mounted || hidden) return null;

  return (
    <div
      role="complementary"
      aria-label="Paradigm studio CTA"
      className="flex h-8 items-center justify-center gap-2 bg-paradigm-bg px-3 text-xs text-paradigm"
    >
      <ParadigmMark className="h-3.5 w-3.5 shrink-0" />
      <span className="hidden truncate sm:inline">
        Built by Paradigm Coding Solutions. Want one like it for your data?{" "}
        <a
          href="https://projectnexuscode.org/contact"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline underline-offset-2 hover:opacity-80"
        >
          Talk to us
        </a>
      </span>
      <button
        type="button"
        onClick={() => {
          dismiss();
          setHidden(true);
        }}
        aria-label="Dismiss Paradigm banner for 7 days"
        className="ml-1 rounded p-0.5 leading-none hover:bg-paradigm/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-paradigm"
      >
        <svg
          viewBox="0 0 16 16"
          className="h-3 w-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}

function ParadigmMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <rect x="1" y="1" width="14" height="14" rx="3" fill="#1f5a44" />
      <path
        d="M5.5 11.5V4.5h3a2.25 2.25 0 1 1 0 4.5H5.5"
        fill="none"
        stroke="#f7f5f0"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
