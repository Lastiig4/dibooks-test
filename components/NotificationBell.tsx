"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDemoAuth } from "@/lib/auth";
import { fetchUnreadNotificationCount } from "@/lib/supabase/socialFeatures";

export default function NotificationBell({ variant = "floating" }: { variant?: "floating" | "inline" }) {
  const { user } = useDemoAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadCount() {
      if (!user) {
        setCount(0);
        return;
      }

      try {
        const nextCount = await fetchUnreadNotificationCount(user);
        if (!cancelled) setCount(nextCount);
      } catch {
        if (!cancelled) setCount(0);
      }
    }

    loadCount();
    const timer = window.setInterval(loadCount, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [user]);

  if (!user) return null;

  const className =
    variant === "inline"
      ? "relative flex h-11 w-11 items-center justify-center rounded-2xl border border-yellow-300/25 bg-yellow-500/10 text-lg text-yellow-100 shadow-lg transition hover:-translate-y-0.5 hover:border-yellow-300/60 hover:bg-yellow-500/20"
      : "fixed bottom-4 right-4 z-[90] flex h-12 w-12 items-center justify-center rounded-full border border-yellow-300/25 bg-black/80 text-xl text-white shadow-2xl backdrop-blur transition hover:-translate-y-0.5 hover:border-yellow-300/60 hover:bg-neutral-900 md:bottom-6 md:right-6";

  return (
    <Link
      href="/notifications"
      className={className}
      aria-label={count > 0 ? `${count} ongelezen meldingen` : "Meldingen"}
      title={count > 0 ? `${count} ongelezen meldingen` : "Meldingen"}
    >
      <span aria-hidden="true">🔔</span>
      {count > 0 && (
        <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-yellow-300 px-1.5 py-0.5 text-center text-[10px] font-black leading-none text-black ring-2 ring-black">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
