"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppNav from "@/components/AppNav";
import { useDemoAuth } from "@/lib/auth";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type DiNotification,
} from "@/lib/supabase/socialFeatures";

function eventLabel(type: string) {
  if (type === "connection_request") return "Contactverzoek";
  if (type === "connection_accepted" || type === "connection_declined") return "Contact";
  if (type === "book_shared") return "Gedeeld boek";
  if (type === "book_feedback") return "Feedback";
  if (type === "book_revision" || type.startsWith("book_revision_")) return "Voorstel";
  if (type === "chat_message") return "Chat";
  if (type === "moderation_submission") return "Boekreview";
  if (type === "moderation_approved" || type === "moderation_rejected") return "Publicatie";
  return "Melding";
}

function eventIcon(type: string) {
  if (type === "connection_request" || type === "connection_accepted") return "👥";
  if (type === "book_shared") return "📚";
  if (type === "book_feedback") return "💬";
  if (type === "book_revision" || type.startsWith("book_revision_")) return "✍️";
  if (type === "chat_message") return "🔔";
  if (type === "moderation_submission") return "🛡️";
  if (type === "moderation_approved") return "✅";
  if (type === "moderation_rejected") return "⚠️";
  return "✨";
}

function timeAgo(input?: string) {
  if (!input) return "net";
  const diffMs = Date.now() - new Date(input).getTime();
  const diffMin = Math.max(0, Math.floor(diffMs / 60000));
  if (diffMin < 1) return "net";
  if (diffMin < 60) return `${diffMin} min geleden`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} uur geleden`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay} dag${diffDay === 1 ? "" : "en"} geleden`;
}

function NotificationCard({ item, onOpen }: { item: DiNotification; onOpen: (item: DiNotification) => void }) {
  const content = (
    <article className={`rounded-3xl border p-5 shadow-2xl transition hover:-translate-y-0.5 ${item.isRead ? "border-white/10 bg-white/[0.035]" : "border-yellow-300/35 bg-yellow-300/[0.08]"}`}>
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-2xl">{eventIcon(item.eventType)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-black">{eventLabel(item.eventType)}</span>
            {!item.isRead && <span className="rounded-full bg-yellow-300 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-black">Nieuw</span>}
            <span className="text-xs font-black uppercase tracking-widest text-neutral-500">{timeAgo(item.createdAt)}</span>
          </div>
          <h2 className="mt-3 text-2xl font-black leading-tight text-white">{item.title}</h2>
          {item.body && <p className="mt-2 text-sm font-semibold leading-7 text-neutral-300">{item.body}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {item.actorDisplayName && <span className="text-xs font-black uppercase tracking-widest text-blue-300/80">Van {item.actorDisplayName}</span>}
            {item.linkPath && <span className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white">Openen</span>}
          </div>
        </div>
      </div>
    </article>
  );

  if (!item.linkPath) return <button type="button" onClick={() => onOpen(item)} className="block w-full text-left">{content}</button>;
  return <Link href={item.linkPath} onClick={() => onOpen(item)} className="block">{content}</Link>;
}

export default function NotificationsPage() {
  const { user, isLoggedIn } = useDemoAuth();
  const [items, setItems] = useState<DiNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const unreadCount = useMemo(() => items.filter((item) => !item.isRead).length, [items]);

  async function loadNotifications() {
    if (!user) { setItems([]); setLoading(false); return; }
    try {
      setError("");
      setItems(await fetchNotifications(user));
    } catch (err: any) {
      setError(err?.message ?? "Meldingen konden niet geladen worden.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    let cancelled = false;
    async function run() { await loadNotifications(); if (cancelled) return; }
    void run();
    const timer = window.setInterval(() => void loadNotifications(), 8000);
    return () => { cancelled = true; window.clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function handleOpen(item: DiNotification) {
    if (item.isRead) return;
    setItems((current) => current.map((entry) => entry.notificationId === item.notificationId ? { ...entry, isRead: true, readAt: new Date().toISOString() } : entry));
    try { await markNotificationRead(user, item.notificationId); } catch { void loadNotifications(); }
  }

  async function handleMarkAllRead() {
    setItems((current) => current.map((entry) => ({ ...entry, isRead: true, readAt: entry.readAt ?? new Date().toISOString() })));
    try { await markAllNotificationsRead(user); } catch { void loadNotifications(); }
  }

  return (
    <main className="min-h-screen bg-[#06080d] text-white">
      <AppNav title="Meldingen" subtitle="Updates en berichten" />
      <section className="mx-auto mt-10 max-w-7xl px-5 pb-10 sm:px-8">
        <div className="rounded-[2rem] border border-yellow-300/20 bg-yellow-300/[0.06] p-8 shadow-2xl md:p-12">
          <p className="text-xs font-black uppercase tracking-[0.5em] text-yellow-200">Meldingen</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
            <div>
              <h1 className="text-5xl font-black leading-none md:text-7xl">Wat is nieuw?</h1>
              <p className="mt-5 max-w-3xl text-base font-semibold leading-8 text-neutral-300">Contactverzoeken, gedeelde boeken, feedback, bewerkingsvoorstellen, chatberichten en publicatiebeoordelingen komen hier samen.</p>
            </div>
            {isLoggedIn && unreadCount > 0 && <button type="button" onClick={handleMarkAllRead} className="rounded-full bg-yellow-300 px-5 py-3 text-sm font-black uppercase tracking-widest text-black hover:bg-yellow-200">Alles gelezen</button>}
          </div>
        </div>

        {!isLoggedIn ? (
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.035] p-8 text-center shadow-2xl">
            <h2 className="text-3xl font-black">Login nodig</h2>
            <p className="mt-3 text-sm font-semibold text-neutral-400">Meldingen horen bij je account.</p>
            <Link href="/account" className="mt-6 inline-flex rounded-full bg-blue-600 px-6 py-3 text-sm font-black text-white hover:bg-blue-500">Naar account</Link>
          </div>
        ) : error ? (
          <div className="mt-8 rounded-3xl border border-red-500/30 bg-red-950/35 p-6 text-sm font-black text-red-100">{error}</div>
        ) : loading ? (
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.035] p-8 text-center text-sm font-black uppercase tracking-widest text-neutral-500">Meldingen laden...</div>
        ) : items.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.035] p-8 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10 text-3xl">🔔</div>
            <h2 className="mt-5 text-3xl font-black">Nog geen meldingen</h2>
            <p className="mt-3 text-sm font-semibold text-neutral-400">Zodra iemand je toevoegt, een boek deelt, feedback geeft, chat of een publicatiebeoordeling nodig is, zie je het hier.</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-4">{items.map((item) => <NotificationCard key={item.notificationId} item={item} onOpen={handleOpen} />)}</div>
        )}
      </section>
    </main>
  );
}
