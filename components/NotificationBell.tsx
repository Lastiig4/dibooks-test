"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useDemoAuth } from "@/lib/auth";
import { fetchUnreadNotificationCount } from "@/lib/supabase/socialFeatures";

export default function NotificationBell() {
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

  return (
    <Link
      href="/notifications"
      className="fixed right-4 top-4 z-[80] flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-black/70 text-xl text-white shadow-2xl backdrop-blur transition hover:-translate-y-0.5 hover:border-yellow-300/50 hover:bg-neutral-900 md:right-6 md:top-6"
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
