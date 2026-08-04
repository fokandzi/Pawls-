import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";

import { seoHead, SEO } from "../lib/seo";

export const Route = createFileRoute("/book/booking-success")({
  head: () => seoHead(SEO["book/booking-success"]),
  component: BookingSuccessPage,
});

function BookingSuccessPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setSessionId(params.get("session_id"));
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--pawls-cream-50)] px-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--pawls-cream-200)] bg-white p-8 text-center shadow-xl">
        <div className="mb-4 text-5xl"></div>
        <h1 className="text-2xl font-bold text-gray-900">
          Payment successful!
        </h1>
        <p className="mt-2 text-gray-600">
          Your booking is confirmed.
        </p>
        {sessionId && (
          <p className="mt-3 text-xs text-gray-400 font-mono">
            Session: {sessionId.slice(0, 20)}…
          </p>
        )}
        <div className="mt-8 space-y-3">
          <Link
            to="/book"
            className="inline-flex w-full items-center justify-center rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-[var(--pawls-terracotta-500)]/20 transition-colors hover:bg-[var(--pawls-terracotta-700)]"
          >
            Back to bookings
          </Link>
          <Link
            to="/"
            className="inline-flex w-full items-center justify-center rounded-full border border-[var(--pawls-cream-200)] bg-white px-6 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-[var(--pawls-cream-50)]"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
