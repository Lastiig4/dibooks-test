"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import AuthModal from "@/components/AuthModal";
import { useDemoAuth } from "@/lib/auth";
import {
  fetchChatConversations,
  fetchChatMessages,
  fetchShareableContacts,
  getOrCreateDirectConversation,
  sendChatMessage,
  type ChatConversation,
  type ChatMessage,
  type ShareableContact,
} from "@/lib/supabase/socialFeatures";

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

function profileInitial(name?: string, email?: string) {
  return (name || email || "D").slice(0, 1).toUpperCase();
}

function formatChatTime(value?: string | null) {
  if (!value) return "Nog geen berichten";
  try {
    return new Intl.DateTimeFormat("nl-NL", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function ConversationButton({ conversation, active, onSelect }: { conversation: ChatConversation; active: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-3xl border p-4 text-left transition ${
        active ? "border-blue-400 bg-blue-500/15" : "border-white/10 bg-white/[0.035] hover:border-white/25 hover:bg-white/[0.06]"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-sm font-black text-white">
          {profileInitial(conversation.otherDisplayName, conversation.otherEmail)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-black text-white">{conversation.otherDisplayName}</p>
            <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-neutral-500">{formatChatTime(conversation.lastMessageAt)}</span>
          </div>
          <p className="truncate text-xs font-bold text-neutral-500">{conversation.otherEmail}</p>
        </div>
      </div>
      <p className="mt-3 line-clamp-2 text-sm font-semibold leading-6 text-neutral-400">
        {conversation.lastMessage || "Open gesprek en stuur het eerste bericht."}
      </p>
      {conversation.relatedBookTitle && (
        <span className="mt-3 inline-flex rounded-full bg-yellow-300 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-black">
          {conversation.relatedBookTitle}
        </span>
      )}
    </button>
  );
}

function ContactStartButton({ contact, onStart, busy }: { contact: ShareableContact; onStart: () => void; busy: boolean }) {
  return (
    <button onClick={onStart} disabled={busy} className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 p-3 text-left hover:border-blue-400/50 disabled:cursor-not-allowed disabled:opacity-50">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-sm font-black text-white">
          {profileInitial(contact.displayName, contact.email)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-white">{contact.displayName}</p>
          <p className="truncate text-xs font-bold text-neutral-500">{contact.email}</p>
        </div>
      </div>
      <span className="rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-black">Chat</span>
    </button>
  );
}

export default function ChatPage() {
  const { user, isLoggedIn, loginWithCredentials, registerWithCredentials, logout } = useDemoAuth();
  const [authModalMode, setAuthModalMode] = useState<"login" | "register" | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [contacts, setContacts] = useState<ShareableContact[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const selectedConversation = useMemo(
    () => conversations.find((conversation: ChatConversation) => conversation.conversationId === selectedConversationId) ?? null,
    [conversations, selectedConversationId],
  );

  async function loadConversations(preferredConversationId?: string | null) {
    if (!user) return;
    setLoading(true);
    setErrorMessage("");
    try {
      const [nextConversations, nextContacts] = await Promise.all([
        fetchChatConversations(user),
        fetchShareableContacts(user),
      ]);
      setConversations(nextConversations);
      setContacts(nextContacts);
      const preferred = preferredConversationId ?? selectedConversationId;
      if (preferred && nextConversations.some((conversation: ChatConversation) => conversation.conversationId === preferred)) {
        setSelectedConversationId(preferred);
      } else if (!selectedConversationId && nextConversations[0]) {
        setSelectedConversationId(nextConversations[0].conversationId);
      }
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Kon chats niet laden.");
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(conversationId: string) {
    if (!user || !conversationId) return;
    try {
      const nextMessages = await fetchChatMessages(user, conversationId);
      setMessages(nextMessages);
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Kon berichten niet laden.");
    }
  }

  useEffect(() => {
    if (!isLoggedIn || !user) return;
    void loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, user?.id]);

  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([]);
      return;
    }
    void loadMessages(selectedConversationId);
    const interval = window.setInterval(() => {
      void loadMessages(selectedConversationId);
      void loadConversations(selectedConversationId);
    }, 6000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversationId, user?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, selectedConversationId]);

  async function handleStartConversation(contact: ShareableContact) {
    if (!user) return;
    setMessageLoading(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const conversationId = await getOrCreateDirectConversation(user, contact.userId);
      await loadConversations(conversationId);
      if (conversationId) {
        setSelectedConversationId(conversationId);
        await loadMessages(conversationId);
      }
      setStatusMessage(`Chat met ${contact.displayName} geopend.`);
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Kon gesprek niet openen.");
    } finally {
      setMessageLoading(false);
    }
  }

  async function handleSendMessage() {
    const trimmed = draft.trim();
    if (!user || !selectedConversationId || !trimmed) return;
    setMessageLoading(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      await sendChatMessage(user, selectedConversationId, trimmed);
      setDraft("");
      await Promise.all([loadMessages(selectedConversationId), loadConversations(selectedConversationId)]);
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Kon bericht niet sturen.");
    } finally {
      setMessageLoading(false);
    }
  }

  const contactsWithoutConversation = contacts.filter(
    (contact) => !conversations.some((conversation) => conversation.otherUserId === contact.userId),
  );

  return (
    <main className="min-h-screen bg-[#05070d] text-white">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-5 rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 shadow-2xl">
          <DiBooksLogo />
          <nav className="flex flex-wrap items-center gap-3">
            <Link href="/" className="rounded-full border border-white/10 px-4 py-2 text-sm font-black text-white/80 hover:bg-white/10">Library</Link>
            <Link href="/account" className="rounded-full border border-white/10 px-4 py-2 text-sm font-black text-white/80 hover:bg-white/10">Account</Link>
            <Link href="/dashboard" className="rounded-full border border-white/10 px-4 py-2 text-sm font-black text-white/80 hover:bg-white/10">Dashboard</Link>
            {isLoggedIn ? (
              <button onClick={logout} className="rounded-full bg-white px-4 py-2 text-sm font-black text-black hover:bg-blue-100">Uitloggen</button>
            ) : (
              <button onClick={() => setAuthModalMode("login")} className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-500">Login</button>
            )}
          </nav>
        </header>

        <section className="rounded-[2.5rem] border border-blue-400/15 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_35%),rgba(255,255,255,0.035)] p-8 shadow-2xl sm:p-12">
          <p className="text-xs font-black uppercase tracking-[0.45em] text-blue-300">DiBooks Chat</p>
          <h1 className="mt-4 text-5xl font-black leading-none sm:text-7xl">Berichten</h1>
          <p className="mt-5 max-w-3xl text-lg font-semibold leading-8 text-neutral-300">
            Praat met contacten, testlezers en auteurs. In deze eerste versie is chat 1-op-1 met geaccepteerde contacten.
          </p>
        </section>

        {!isLoggedIn ? (
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-8 text-center shadow-2xl">
            <h2 className="text-3xl font-black">Login nodig</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-7 text-neutral-400">Je moet ingelogd zijn om met contacten te chatten.</p>
            <div className="mt-6 flex justify-center gap-3">
              <button onClick={() => setAuthModalMode("login")} className="rounded-full bg-blue-600 px-6 py-3 text-sm font-black text-white hover:bg-blue-500">Login</button>
              <button onClick={() => setAuthModalMode("register")} className="rounded-full bg-white px-6 py-3 text-sm font-black text-black hover:bg-blue-100">Registreer</button>
            </div>
          </section>
        ) : (
          <section className="grid min-h-[650px] gap-6 lg:grid-cols-[380px_1fr]">
            <aside className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.35em] text-neutral-500">Gesprekken</p>
                  <h2 className="mt-2 text-2xl font-black">Inbox</h2>
                </div>
                <button onClick={() => void loadConversations()} disabled={loading} className="rounded-full border border-white/10 px-3 py-2 text-xs font-black text-white hover:bg-white/10 disabled:opacity-50">
                  Refresh
                </button>
              </div>

              {statusMessage && <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm font-black text-emerald-100">{statusMessage}</div>}
              {errorMessage && <div className="mt-4 rounded-2xl border border-red-400/25 bg-red-500/10 p-3 text-sm font-black text-red-100">{errorMessage}</div>}

              <div className="mt-5 grid gap-3">
                {conversations.map((conversation) => (
                  <ConversationButton
                    key={conversation.conversationId}
                    conversation={conversation}
                    active={conversation.conversationId === selectedConversationId}
                    onSelect={() => setSelectedConversationId(conversation.conversationId)}
                  />
                ))}
                {conversations.length === 0 && (
                  <div className="rounded-3xl border border-dashed border-white/10 p-5 text-sm font-semibold leading-7 text-neutral-400">
                    Nog geen gesprekken. Start hieronder een chat met een contact.
                  </div>
                )}
              </div>

              <div className="mt-7 border-t border-white/10 pt-5">
                <p className="text-[10px] font-black uppercase tracking-[0.35em] text-neutral-500">Nieuwe chat</p>
                <div className="mt-4 grid gap-3">
                  {contactsWithoutConversation.map((contact) => (
                    <ContactStartButton key={contact.userId} contact={contact} busy={messageLoading} onStart={() => void handleStartConversation(contact)} />
                  ))}
                  {contactsWithoutConversation.length === 0 && (
                    <p className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm font-semibold leading-7 text-neutral-500">
                      Geen nieuwe contacten om mee te chatten. Voeg contacten toe via je accountpagina.
                    </p>
                  )}
                </div>
              </div>
            </aside>

            <section className="flex min-h-[650px] flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035] shadow-2xl">
              {selectedConversation ? (
                <>
                  <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/25 p-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-blue-600 p-4 text-lg font-black text-white">
                        {profileInitial(selectedConversation.otherDisplayName, selectedConversation.otherEmail)}
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate text-2xl font-black">{selectedConversation.otherDisplayName}</h2>
                        <p className="truncate text-sm font-bold text-neutral-500">{selectedConversation.otherEmail}</p>
                      </div>
                    </div>
                    <Link href="/account" className="rounded-full border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-white/70 hover:bg-white/10">Contacten</Link>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5">
                    <div className="grid gap-4">
                      {messages.map((message) => {
                        const isMine = message.senderId === user?.id;
                        return (
                          <div key={message.messageId} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[78%] rounded-3xl border p-4 ${isMine ? "border-blue-400/30 bg-blue-600 text-white" : "border-white/10 bg-black/35 text-white"}`}>
                              <div className="mb-2 flex items-center justify-between gap-4">
                                <span className={`text-[10px] font-black uppercase tracking-widest ${isMine ? "text-blue-100" : "text-neutral-500"}`}>
                                  {isMine ? "Jij" : message.senderDisplayName}
                                </span>
                                <span className={`text-[10px] font-black uppercase tracking-widest ${isMine ? "text-blue-100" : "text-neutral-500"}`}>{formatChatTime(message.createdAt)}</span>
                              </div>
                              <p className="whitespace-pre-wrap text-sm font-semibold leading-7">{message.message}</p>
                              {message.relatedBookTitle && <p className="mt-3 rounded-2xl bg-black/25 px-3 py-2 text-xs font-black">Boek: {message.relatedBookTitle}</p>}
                            </div>
                          </div>
                        );
                      })}
                      {messages.length === 0 && (
                        <div className="rounded-3xl border border-dashed border-white/10 p-8 text-center">
                          <h3 className="text-2xl font-black">Nog geen berichten</h3>
                          <p className="mt-2 text-sm font-semibold leading-7 text-neutral-500">Stuur het eerste bericht naar {selectedConversation.otherDisplayName}.</p>
                        </div>
                      )}
                      <div ref={bottomRef} />
                    </div>
                  </div>

                  <div className="border-t border-white/10 bg-black/25 p-5">
                    <div className="flex gap-3">
                      <textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            void handleSendMessage();
                          }
                        }}
                        placeholder="Typ je bericht..."
                        rows={2}
                        className="min-h-14 flex-1 resize-none rounded-3xl border border-white/10 bg-black/35 px-5 py-4 text-sm font-semibold text-white outline-none focus:border-blue-400"
                      />
                      <button onClick={() => void handleSendMessage()} disabled={messageLoading || !draft.trim()} className="rounded-3xl bg-blue-600 px-6 py-4 text-sm font-black text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50">
                        Stuur
                      </button>
                    </div>
                    <p className="mt-3 text-xs font-semibold text-neutral-500">Tip: Enter verstuurt. Shift + Enter maakt een nieuwe regel.</p>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center p-8 text-center">
                  <div>
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10 text-3xl">💬</div>
                    <h2 className="mt-5 text-3xl font-black">Kies een gesprek</h2>
                    <p className="mt-3 max-w-md text-sm font-semibold leading-7 text-neutral-500">Selecteer links een bestaande chat of start een nieuwe chat met een contact.</p>
                  </div>
                </div>
              )}
            </section>
          </section>
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
