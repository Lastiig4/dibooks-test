"use client";

import Link from "next/link";
import AppNav from "@/components/AppNav";
import { useEffect, useMemo, useState } from "react";
import AuthModal from "@/components/AuthModal";
import { useDemoAuth } from "@/lib/auth";
import {
  fetchFavoriteBooks,
  fetchReadingProgressBooks,
  getAccessLabel,
  type FavoriteBook,
} from "@/lib/supabase/readerFeatures";
import {
  acceptConnectionRequest,
  declineConnectionRequest,
  fetchBookFeedbackForUser,
  fetchBookRevisionsForUser,
  fetchSharedBooks,
  fetchUserConnections,
  respondToBookRevision,
  searchUsersForConnection,
  sendConnectionRequest,
  type BookFeedbackItem,
  type BookRevisionItem,
  type ConnectableProfile,
  type SharedBook,
  type UserConnection,
} from "@/lib/supabase/socialFeatures";

const FALLBACK_COVER_CLASS = "from-blue-950 via-slate-950 to-purple-950";
const FALLBACK_ACCENT_CLASS = "border-blue-500/40";

function DiBooksLogo() {
  return (
    <Link href="/" className="group flex items-end leading-none" aria-label="DiBooks home">
      <span className="text-5xl font-black tracking-tight text-white transition group-hover:text-blue-200 sm:text-6xl">DI</span>
      <span className="ml-1 text-5xl italic text-white transition group-hover:text-blue-200 sm:text-6xl" style={{ fontFamily: "Georgia, Times New Roman, serif" }}>
        Books
      </span>
    </Link>
  );
}

function roleLabel(role?: string) {
  if (role === "admin") return "Admin";
  if (role === "author") return "Auteur";
  return "Lezer";
}

function planLabel(plan?: string) {
  if (plan === "author_pro") return "Author Pro";
  if (plan === "reader_plus") return "Reader Plus";
  return "Gratis";
}

function planDescription(plan?: string) {
  if (plan === "author_pro") return "Je kunt premium boeken lezen, publiceren en auteursfuncties gebruiken.";
  if (plan === "reader_plus") return "Je kunt gratis én premium boeken lezen.";
  return "Je kunt gratis boeken lezen, favorieten opslaan en leesvoortgang bewaren.";
}

function Badge({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <span className={light ? "rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-black" : "rounded-full bg-black/45 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/90 ring-1 ring-white/10"}>
      {children}
    </span>
  );
}

function SmallBookCard({ book, mode }: { book: FavoriteBook; mode: "progress" | "favorite" }) {
  const coverClass = book.coverClass || FALLBACK_COVER_CLASS;
  const accentClass = book.accentClass || FALLBACK_ACCENT_CLASS;
  const progress = Math.max(0, Math.min(100, book.progressPercent ?? 0));
  const statusLabel = book.published ? "Live" : book.status;

  return (
    <Link href={`/books/${book.id}`} className={`group overflow-hidden rounded-3xl border ${accentClass} bg-neutral-950 shadow-2xl transition hover:-translate-y-1 hover:border-white/60`}>
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-neutral-950 px-4 py-3">
        <Badge>{book.primaryGenre}</Badge>
        <Badge light>{statusLabel}</Badge>
      </div>

      <div className={`relative h-52 overflow-hidden bg-gradient-to-br ${coverClass}`}>
        {book.coverImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={book.coverImage} alt={`Cover van ${book.title}`} className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.16),transparent_28%),linear-gradient(180deg,rgba(0,0,0,0.04),rgba(0,0,0,0.28))]" />
        {!book.coverImage && <div className="absolute left-5 top-5 text-[10px] font-black uppercase tracking-[0.35em] text-white/30">DiBooks</div>}
      </div>

      <div className="border-t border-white/10 bg-black/55 p-5">
        <div className="flex flex-wrap gap-2">
          <Badge>{getAccessLabel(book.accessType)}</Badge>
          {mode === "progress" && <Badge light>{progress}% gelezen</Badge>}
          {mode === "favorite" && <Badge light>Favoriet</Badge>}
        </div>
        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.34em] text-blue-300/80">
          {mode === "progress" ? "Verder lezen" : "Opgeslagen"}
        </p>
        <h2 className="mt-2 line-clamp-2 text-2xl font-black leading-none text-white">{book.title}</h2>
        {mode === "progress" && (
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-blue-400" style={{ width: `${progress}%` }} />
          </div>
        )}
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="truncate text-xs font-black uppercase tracking-widest text-neutral-500">{book.author}</span>
          <span className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white group-hover:bg-blue-500">Bekijk</span>
        </div>
      </div>
    </Link>
  );
}

function FeaturePlaceholder({ title, body, icon }: { title: string; body: string; icon: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-2xl">{icon}</div>
      <h3 className="mt-4 text-xl font-black text-white">{title}</h3>
      <p className="mt-2 text-sm font-semibold leading-6 text-neutral-400">{body}</p>
      <span className="mt-4 inline-flex rounded-full border border-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-neutral-400">
        Komt later
      </span>
    </div>
  );
}

function profileInitial(name?: string, email?: string) {
  return (name || email || "D").slice(0, 1).toUpperCase();
}

function MiniProfileRow({ profile, onAdd, disabled }: { profile: ConnectableProfile; onAdd: () => void; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-sm font-black text-white">
          {profileInitial(profile.displayName, profile.email)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-white">{profile.displayName}</p>
          <p className="truncate text-xs font-bold text-neutral-500">{profile.email}</p>
        </div>
      </div>
      <button onClick={onAdd} disabled={disabled} className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
        Voeg toe
      </button>
    </div>
  );
}

function ConnectionRow({ connection, onAccept, onDecline }: { connection: UserConnection; onAccept?: () => void; onDecline?: () => void }) {
  const isIncoming = connection.status === "pending" && connection.direction === "incoming";
  const isOutgoing = connection.status === "pending" && connection.direction === "outgoing";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-sm font-black text-white">
          {profileInitial(connection.otherDisplayName, connection.otherEmail)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-white">{connection.otherDisplayName}</p>
          <p className="truncate text-xs font-bold text-neutral-500">{connection.otherEmail}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge>{connection.status === "accepted" ? "Contact" : isIncoming ? "Verzoek ontvangen" : "Verzoek verstuurd"}</Badge>
            {isOutgoing && <Badge light>Wacht op antwoord</Badge>}
          </div>
        </div>
      </div>

      {isIncoming && (
        <div className="flex gap-2">
          <button onClick={onDecline} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-neutral-300 hover:bg-white/10">Weiger</button>
          <button onClick={onAccept} className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white hover:bg-emerald-500">Accepteer</button>
        </div>
      )}
    </div>
  );
}


function permissionLabel(permission?: string) {
  if (permission === "edit") return "Lezen + feedback + voorstel";
  if (permission === "comment") return "Lezen + feedback";
  return "Alleen lezen";
}

function SharedBookCard({ book }: { book: SharedBook }) {
  const coverClass = book.coverClass || FALLBACK_COVER_CLASS;
  const accentClass = book.accentClass || FALLBACK_ACCENT_CLASS;
  const canEdit = book.permission === "edit";
  const canComment = book.permission === "comment" || book.permission === "edit";

  return (
    <article className={`overflow-hidden rounded-3xl border ${accentClass} bg-neutral-950 shadow-2xl`}>
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-neutral-950 px-4 py-3">
        <Badge>{permissionLabel(book.permission)}</Badge>
        <Badge light>{book.status}</Badge>
      </div>
      <div className="grid gap-0 md:grid-cols-[180px_1fr]">
        <div className={`relative h-56 overflow-hidden bg-gradient-to-br md:h-full ${coverClass}`}>
          {book.coverImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={book.coverImage} alt={`Cover van ${book.title}`} className="absolute inset-0 h-full w-full object-cover" />
          )}
          <div className="absolute inset-0 bg-black/20" />
        </div>
        <div className="p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-300/80">Gedeeld door {book.ownerName}</p>
          <h3 className="mt-2 text-2xl font-black leading-none text-white">{book.title}</h3>
          <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-neutral-400">{book.description || book.subtitle || "Geen beschrijving."}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge>{book.primaryGenre}</Badge>
            <Badge>{getAccessLabel(book.accessType)}</Badge>
            {canComment && <Badge>Feedback</Badge>}
            {canEdit && <Badge>Voorstelmodus</Badge>}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={`/books/${book.id}/read`} className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-500">Lezen/testen</Link>
            {canEdit && (
              <Link href={`/editor?shared=${book.id}`} className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-100 hover:bg-emerald-500/20">
                Bewerk als voorstel
              </Link>
            )}
            <Link href="/dashboard" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-white hover:bg-white/10">Feedback via Dashboard</Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function FeedbackItemCard({ item }: { item: BookFeedbackItem }) {
  return (
    <article className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-yellow-300/80">Feedback</p>
          <h3 className="mt-2 text-xl font-black text-white">{item.bookTitle}</h3>
          <p className="mt-1 text-xs font-bold text-neutral-500">Van {item.fromDisplayName}</p>
        </div>
        <Badge light>{item.status}</Badge>
      </div>
      <p className="mt-4 whitespace-pre-wrap text-sm font-semibold leading-6 text-neutral-300">{item.message}</p>
    </article>
  );
}

function RevisionItemCard({ item, onAccept, onReject, busy }: { item: BookRevisionItem; onAccept: () => void; onReject: () => void; busy?: boolean }) {
  return (
    <article className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5 shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-emerald-200/80">Bewerkingsvoorstel</p>
          <h3 className="mt-2 text-xl font-black text-white">{item.bookTitle}</h3>
          <p className="mt-1 text-xs font-bold text-emerald-100/70">Van {item.editorDisplayName}</p>
        </div>
        <Badge light>{item.status}</Badge>
      </div>
      {item.note && <p className="mt-4 whitespace-pre-wrap text-sm font-semibold leading-6 text-emerald-50/85">{item.note}</p>}
      {item.status === "submitted" && (
        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={onReject} disabled={busy} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm font-black text-white hover:bg-black/35 disabled:opacity-50">Afwijzen</button>
          <button onClick={onAccept} disabled={busy} className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white hover:bg-emerald-500 disabled:opacity-50">Accepteren</button>
        </div>
      )}
    </article>
  );
}

export default function AccountPage() {
  const { user, isLoggedIn, permissions, loginWithCredentials, registerWithCredentials, logout } = useDemoAuth();
  const [authModalMode, setAuthModalMode] = useState<"login" | "register" | null>(null);
  const [favoriteBooks, setFavoriteBooks] = useState<FavoriteBook[]>([]);
  const [progressBooks, setProgressBooks] = useState<FavoriteBook[]>([]);
  const [connections, setConnections] = useState<UserConnection[]>([]);
  const [sharedBooks, setSharedBooks] = useState<SharedBook[]>([]);
  const [bookFeedback, setBookFeedback] = useState<BookFeedbackItem[]>([]);
  const [bookRevisions, setBookRevisions] = useState<BookRevisionItem[]>([]);
  const [connectionSearch, setConnectionSearch] = useState("");
  const [connectionResults, setConnectionResults] = useState<ConnectableProfile[]>([]);
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [sharingMessage, setSharingMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAccountData() {
      if (!user) {
        setFavoriteBooks([]);
        setProgressBooks([]);
        setConnections([]);
        setSharedBooks([]);
        setBookFeedback([]);
        setBookRevisions([]);
        setConnectionResults([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [favorites, progress, userConnections, shared, feedback, revisions] = await Promise.all([
          fetchFavoriteBooks(user),
          fetchReadingProgressBooks(user),
          fetchUserConnections(user),
          fetchSharedBooks(user),
          fetchBookFeedbackForUser(user),
          fetchBookRevisionsForUser(user),
        ]);

        if (!cancelled) {
          setFavoriteBooks(favorites);
          setProgressBooks(progress);
          setConnections(userConnections);
          setSharedBooks(shared);
          setBookFeedback(feedback);
          setBookRevisions(revisions);
        }
      } catch (loadError: any) {
        console.error("Accountgegevens laden mislukt.", loadError);
        if (!cancelled) setError(loadError?.message ?? "Accountgegevens konden niet worden geladen.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadAccountData();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const topProgressBooks = useMemo(() => progressBooks.slice(0, 4), [progressBooks]);
  const topFavoriteBooks = useMemo(() => favoriteBooks.slice(0, 4), [favoriteBooks]);
  const acceptedConnections = useMemo(() => connections.filter((connection) => connection.status === "accepted"), [connections]);
  const incomingRequests = useMemo(() => connections.filter((connection) => connection.status === "pending" && connection.direction === "incoming"), [connections]);
  const outgoingRequests = useMemo(() => connections.filter((connection) => connection.status === "pending" && connection.direction === "outgoing"), [connections]);
  const topSharedBooks = useMemo(() => sharedBooks.slice(0, 4), [sharedBooks]);
  const topFeedback = useMemo(() => bookFeedback.slice(0, 4), [bookFeedback]);
  const topRevisions = useMemo(() => bookRevisions.slice(0, 4), [bookRevisions]);

  async function reloadConnections() {
    if (!user) return;
    const nextConnections = await fetchUserConnections(user);
    setConnections(nextConnections);
  }

  async function handleConnectionSearch() {
    if (!user) return;
    if (connectionSearch.trim().length < 3) {
      setConnectionMessage("Vul minimaal 3 tekens in, bijvoorbeeld een e-mail of naam.");
      setConnectionResults([]);
      return;
    }

    setConnectionLoading(true);
    setConnectionMessage(null);

    try {
      const results = await searchUsersForConnection(user, connectionSearch);
      setConnectionResults(results);
      if (results.length === 0) setConnectionMessage("Geen gebruiker gevonden.");
    } catch (searchError: any) {
      console.error("Gebruiker zoeken mislukt.", searchError);
      setConnectionMessage(searchError?.message ?? "Gebruiker zoeken mislukt.");
    } finally {
      setConnectionLoading(false);
    }
  }

  async function handleSendConnection(targetUserId: string) {
    if (!user) return;
    setConnectionLoading(true);
    setConnectionMessage(null);

    try {
      await sendConnectionRequest(user, targetUserId);
      await reloadConnections();
      setConnectionResults([]);
      setConnectionSearch("");
      setConnectionMessage("Contactverzoek verstuurd.");
    } catch (sendError: any) {
      console.error("Contactverzoek versturen mislukt.", sendError);
      setConnectionMessage(sendError?.message ?? "Contactverzoek versturen mislukt.");
    } finally {
      setConnectionLoading(false);
    }
  }

  async function handleAcceptConnection(connectionId: string) {
    if (!user) return;
    setConnectionLoading(true);
    setConnectionMessage(null);

    try {
      await acceptConnectionRequest(user, connectionId);
      await reloadConnections();
      setConnectionMessage("Contactverzoek geaccepteerd.");
    } catch (acceptError: any) {
      console.error("Contactverzoek accepteren mislukt.", acceptError);
      setConnectionMessage(acceptError?.message ?? "Contactverzoek accepteren mislukt.");
    } finally {
      setConnectionLoading(false);
    }
  }

  async function handleDeclineConnection(connectionId: string) {
    if (!user) return;
    setConnectionLoading(true);
    setConnectionMessage(null);

    try {
      await declineConnectionRequest(user, connectionId);
      await reloadConnections();
      setConnectionMessage("Contactverzoek geweigerd.");
    } catch (declineError: any) {
      console.error("Contactverzoek weigeren mislukt.", declineError);
      setConnectionMessage(declineError?.message ?? "Contactverzoek weigeren mislukt.");
    } finally {
      setConnectionLoading(false);
    }
  }


  async function reloadSharingData() {
    if (!user) return;
    const [shared, feedback, revisions] = await Promise.all([
      fetchSharedBooks(user),
      fetchBookFeedbackForUser(user),
      fetchBookRevisionsForUser(user),
    ]);
    setSharedBooks(shared);
    setBookFeedback(feedback);
    setBookRevisions(revisions);
  }

  async function handleRevisionResponse(revisionId: string, status: "accepted" | "rejected") {
    if (!user) return;
    setConnectionLoading(true);
    setSharingMessage(null);

    try {
      await respondToBookRevision(user, revisionId, status);
      await reloadSharingData();
      setSharingMessage(status === "accepted" ? "Bewerkingsvoorstel geaccepteerd." : "Bewerkingsvoorstel afgewezen.");
    } catch (revisionError: any) {
      console.error("Bewerkingsvoorstel verwerken mislukt.", revisionError);
      setSharingMessage(revisionError?.message ?? "Bewerkingsvoorstel verwerken mislukt.");
    } finally {
      setConnectionLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#05070d] text-white">
      <AppNav title="Account" subtitle="Profiel, contacten en delen" />

      <section className="px-5 py-10 sm:px-8 lg:px-10">
        <div className="rounded-[2rem] border border-blue-400/20 bg-gradient-to-br from-blue-950/70 via-neutral-950 to-purple-950/45 p-8 shadow-2xl sm:p-12">
          <p className="text-sm font-black uppercase tracking-[0.32em] text-blue-300">Account</p>
          <h1 className="mt-4 text-5xl font-black leading-none sm:text-7xl">Mijn DiBooks</h1>
          <p className="mt-5 max-w-3xl text-base font-semibold leading-7 text-neutral-300">
            Je persoonlijke plek voor lezen, favorieten, voortgang en later ook delen, chatten en testlezers uitnodigen.
          </p>
        </div>

        {!isLoggedIn && (
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl">
            <h2 className="text-3xl font-black">Login nodig</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-6 text-neutral-400">
              Maak gratis een account aan om boeken te lezen, voortgang op te slaan en favorieten te bewaren.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button onClick={() => setAuthModalMode("login")} className="rounded-2xl border border-white/15 bg-white/5 px-6 py-4 font-black text-white hover:bg-white/10">Login</button>
              <button onClick={() => setAuthModalMode("register")} className="rounded-2xl bg-blue-600 px-6 py-4 font-black text-white hover:bg-blue-500">Registreer gratis</button>
            </div>
          </div>
        )}

        {isLoggedIn && user && (
          <>
            <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
              <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl">
                <p className="text-xs font-black uppercase tracking-[0.32em] text-neutral-500">Profiel</p>
                <div className="mt-5 flex items-center gap-4">
                  <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-600 text-3xl font-black text-white">
                    {(user.name || user.email || "D").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-3xl font-black">{user.name || "DiBooks gebruiker"}</h2>
                    <p className="mt-1 truncate text-sm font-bold text-neutral-400">{user.email}</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Rol</p>
                    <p className="mt-1 text-xl font-black text-white">{roleLabel(user.role)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Plan</p>
                    <p className="mt-1 text-xl font-black text-white">{planLabel(user.plan)}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-blue-500/25 bg-blue-500/10 p-4 text-sm font-semibold leading-6 text-blue-100">
                  {planDescription(user.plan)}
                </div>
              </section>

              <section className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl">
                  <p className="text-xs font-black uppercase tracking-widest text-neutral-500">Favorieten</p>
                  <p className="mt-2 text-4xl font-black text-yellow-300">{favoriteBooks.length}</p>
                  <Link href="/favorites" className="mt-4 inline-flex rounded-2xl border border-yellow-400/30 bg-yellow-500/10 px-4 py-3 text-sm font-black text-yellow-100 hover:bg-yellow-500/20">Open favorieten</Link>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl">
                  <p className="text-xs font-black uppercase tracking-widest text-neutral-500">Verder lezen</p>
                  <p className="mt-2 text-4xl font-black text-blue-300">{progressBooks.length}</p>
                  <Link href="/" className="mt-4 inline-flex rounded-2xl border border-blue-400/30 bg-blue-500/10 px-4 py-3 text-sm font-black text-blue-100 hover:bg-blue-500/20">Zoek boeken</Link>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl">
                  <p className="text-xs font-black uppercase tracking-widest text-neutral-500">Auteur</p>
                  <p className="mt-2 text-4xl font-black text-emerald-300">{permissions.canUseDashboard ? "✓" : "—"}</p>
                  {permissions.canUseDashboard ? (
                    <Link href="/dashboard" className="mt-4 inline-flex rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-100 hover:bg-emerald-500/20">Dashboard</Link>
                  ) : (
                    <Link href="/editor" className="mt-4 inline-flex rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-white hover:bg-white/10">Studio proberen</Link>
                  )}
                </div>
              </section>
            </div>

            {loading && <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-8 font-black text-neutral-300">Accountgegevens laden...</div>}
            {error && <div className="mt-8 rounded-3xl border border-red-500/25 bg-red-500/10 p-8 font-black text-red-100">{error}</div>}

            {!loading && !error && topProgressBooks.length > 0 && (
              <section className="mt-10">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.32em] text-neutral-500">Lees verder</p>
                    <h2 className="mt-2 text-3xl font-black">Verder lezen</h2>
                  </div>
                </div>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  {topProgressBooks.map((book) => <SmallBookCard key={book.id} book={book} mode="progress" />)}
                </div>
              </section>
            )}

            {!loading && !error && topFavoriteBooks.length > 0 && (
              <section className="mt-10">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.32em] text-neutral-500">Opgeslagen</p>
                    <h2 className="mt-2 text-3xl font-black">Favorieten</h2>
                  </div>
                  <Link href="/favorites" className="rounded-full border border-yellow-400/30 bg-yellow-500/10 px-4 py-2 text-sm font-black text-yellow-100 hover:bg-yellow-500/20">Alles bekijken</Link>
                </div>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  {topFavoriteBooks.map((book) => <SmallBookCard key={book.id} book={book} mode="favorite" />)}
                </div>
              </section>
            )}

            {!loading && !error && topFavoriteBooks.length === 0 && topProgressBooks.length === 0 && (
              <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-neutral-300">
                <h2 className="text-3xl font-black text-white">Nog geen activiteit</h2>
                <p className="mt-3 text-sm font-semibold leading-6 text-neutral-400">Lees een boek of zet iets als favoriet. Dan verschijnt het hier.</p>
                <Link href="/" className="mt-5 inline-flex rounded-2xl bg-blue-600 px-6 py-4 font-black text-white hover:bg-blue-500">Naar Library</Link>
              </div>
            )}

            <section className="mt-10" id="contacten">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.32em] text-neutral-500">Sociaal</p>
                  <h2 className="mt-2 text-3xl font-black">Contacten</h2>
                  <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-neutral-400">
                    Voeg straks testlezers, auteurs of vrienden toe. Dit wordt de basis voor boeken delen en chat.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge light>{acceptedConnections.length} contacten</Badge>
                  {incomingRequests.length > 0 && <Badge>{incomingRequests.length} verzoeken</Badge>}
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl">
                  <h3 className="text-xl font-black">Gebruiker zoeken</h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-neutral-400">
                    Zoek op e-mail of naam. Minimaal 3 tekens.
                  </p>
                  <div className="mt-5 flex gap-2">
                    <input
                      value={connectionSearch}
                      onChange={(event) => setConnectionSearch(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void handleConnectionSearch();
                      }}
                      placeholder="bijv. naam@email.nl"
                      className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-bold text-white outline-none placeholder:text-neutral-600 focus:border-blue-400"
                    />
                    <button
                      onClick={() => void handleConnectionSearch()}
                      disabled={connectionLoading}
                      className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Zoek
                    </button>
                  </div>

                  {connectionMessage && <div className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-3 text-sm font-bold text-neutral-300">{connectionMessage}</div>}

                  {connectionResults.length > 0 && (
                    <div className="mt-4 grid gap-3">
                      {connectionResults.map((profile) => (
                        <MiniProfileRow key={profile.id} profile={profile} disabled={connectionLoading} onAdd={() => void handleSendConnection(profile.id)} />
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid gap-5">
                  {incomingRequests.length > 0 && (
                    <div className="rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-5 shadow-2xl">
                      <h3 className="text-xl font-black text-emerald-100">Inkomende verzoeken</h3>
                      <div className="mt-4 grid gap-3">
                        {incomingRequests.map((connection) => (
                          <ConnectionRow
                            key={connection.connectionId}
                            connection={connection}
                            onAccept={() => void handleAcceptConnection(connection.connectionId)}
                            onDecline={() => void handleDeclineConnection(connection.connectionId)}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-xl font-black">Mijn contacten</h3>
                      <Badge light>{acceptedConnections.length}</Badge>
                    </div>
                    <div className="mt-4 grid gap-3">
                      {acceptedConnections.length === 0 ? (
                        <p className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm font-semibold leading-6 text-neutral-400">
                          Nog geen contacten. Zoek iemand op e-mail en stuur een verzoek.
                        </p>
                      ) : (
                        acceptedConnections.map((connection) => <ConnectionRow key={connection.connectionId} connection={connection} />)
                      )}
                    </div>
                  </div>

                  {outgoingRequests.length > 0 && (
                    <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl">
                      <h3 className="text-xl font-black">Verstuurde verzoeken</h3>
                      <div className="mt-4 grid gap-3">
                        {outgoingRequests.map((connection) => <ConnectionRow key={connection.connectionId} connection={connection} />)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <section className="mt-10">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-black uppercase tracking-[0.32em] text-neutral-500">Delen</p>
                  <h2 className="mt-2 text-3xl font-black">Boek delen en samenwerken</h2>
                  <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-neutral-400">
                    Delen zelf doe je vanuit je Dashboard. Hier zie je gedeelde boeken, feedback en bewerkingsvoorstellen terug.
                  </p>
                </div>
                <Link href="/dashboard" className="rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-sm font-black text-blue-100 hover:bg-blue-500/20">
                  Naar Dashboard
                </Link>
              </div>

              {sharingMessage && <div className="mb-5 rounded-3xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm font-black text-emerald-100">{sharingMessage}</div>}

              {topSharedBooks.length > 0 && (
                <div className="mt-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-2xl font-black">Gedeeld met mij</h3>
                    <Badge light>{sharedBooks.length}</Badge>
                  </div>
                  <div className="grid gap-5 lg:grid-cols-2">
                    {topSharedBooks.map((book) => <SharedBookCard key={book.shareId} book={book} />)}
                  </div>
                </div>
              )}

              {(topFeedback.length > 0 || topRevisions.length > 0) && (
                <div className="mt-8 grid gap-5 lg:grid-cols-2">
                  {topFeedback.length > 0 && (
                    <div>
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <h3 className="text-2xl font-black">Ontvangen feedback</h3>
                        <Badge light>{bookFeedback.length}</Badge>
                      </div>
                      <div className="grid gap-4">
                        {topFeedback.map((item) => <FeedbackItemCard key={item.feedbackId} item={item} />)}
                      </div>
                    </div>
                  )}

                  {topRevisions.length > 0 && (
                    <div>
                      <div className="mb-4 flex items-center justify-between gap-3">
                        <h3 className="text-2xl font-black">Bewerkingsvoorstellen</h3>
                        <Badge light>{bookRevisions.length}</Badge>
                      </div>
                      <div className="grid gap-4">
                        {topRevisions.map((item) => (
                          <RevisionItemCard
                            key={item.revisionId}
                            item={item}
                            busy={connectionLoading}
                            onAccept={() => void handleRevisionResponse(item.revisionId, "accepted")}
                            onReject={() => void handleRevisionResponse(item.revisionId, "rejected")}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {topSharedBooks.length === 0 && topFeedback.length === 0 && topRevisions.length === 0 && (
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-2xl">↗</div>
                    <h3 className="mt-4 text-xl font-black text-white">Boek delen is actief</h3>
                    <p className="mt-2 text-sm font-semibold leading-6 text-neutral-400">
                      Ga naar Dashboard, kies een boek en deel het met een contact. Daarna verschijnt het hier bij de ontvanger.
                    </p>
                    <Link href="/dashboard" className="mt-4 inline-flex rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-500">Open Dashboard</Link>
                  </div>
                  <div className="rounded-3xl border border-blue-400/20 bg-blue-500/[0.06] p-5 shadow-2xl">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15 text-2xl">💬</div>
                    <h3 className="mt-4 text-xl font-black text-white">Chat is actief</h3>
                    <p className="mt-2 text-sm font-semibold leading-6 text-neutral-400">
                      Praat rechtstreeks met je contacten en testlezers. Chat werkt met geaccepteerde contacten.
                    </p>
                    <Link href="/chat" className="mt-4 inline-flex rounded-2xl border border-blue-400/30 bg-blue-500/10 px-4 py-3 text-sm font-black text-blue-100 hover:bg-blue-500/20">Open Chat</Link>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </section>

      {authModalMode && (
        <AuthModal
          mode={authModalMode}
          onModeChange={setAuthModalMode}
          onClose={() => setAuthModalMode(null)}
          onLogin={loginWithCredentials}
          onRegister={registerWithCredentials}
        />
      )}
    </main>
  );
}
