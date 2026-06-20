"use client";

import { useEffect, useState } from "react";

/**
 * Portal handoff claim (chunk 4b, client component).
 *
 * Mounted invisibly on the Slatewell landing page. On mount it inspects
 * window.location.hash for `#portal_token=<JWT>`. If present:
 *   1. Scrub the fragment immediately via history.replaceState so the
 *      token does not linger in the address bar or get bookmarked.
 *   2. POST it to /api/auth/portal-handoff for server-side verification.
 *   3. On success, navigate to the returned redirect target.
 *
 * Failures are surfaced as a small inline banner (not an alert) so a user
 * with a stale token can still browse the public landing while reading
 * what happened. The component renders nothing in the steady state.
 */
export function PortalHandoffClaim() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    const prefix = "#portal_token=";
    if (!hash.startsWith(prefix)) return;

    const token = hash.slice(prefix.length);
    // Scrub the fragment first so a slow network does not leave the token
    // visible in the URL bar while the request is in flight.
    try {
      const clean = window.location.pathname + window.location.search;
      window.history.replaceState(null, "", clean);
    } catch {
      // Non-fatal; carry on with the handoff.
    }

    if (!token) {
      setError("Portal handoff was missing a token.");
      return;
    }

    let cancelled = false;
    setPending(true);
    fetch("/api/auth/portal-handoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          redirect?: string;
          reason?: string;
        };
        if (cancelled) return;
        if (res.ok && data.ok && data.redirect) {
          window.location.replace(data.redirect);
          return;
        }
        setError(
          data.reason === "invalid_token"
            ? "That portal link has expired or is invalid. Launch the app again from the portal."
            : "Could not complete portal sign-in. Please try again.",
        );
      })
      .catch(() => {
        if (cancelled) return;
        setError("Network error completing portal sign-in.");
      })
      .finally(() => {
        if (!cancelled) setPending(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!error && !pending) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-50 max-w-sm rounded-lg border border-border bg-card px-4 py-3 text-sm shadow-lg"
    >
      {pending && !error ? (
        <span className="text-muted-foreground">
          Completing portal sign-in...
        </span>
      ) : null}
      {error ? <span className="text-destructive">{error}</span> : null}
    </div>
  );
}
