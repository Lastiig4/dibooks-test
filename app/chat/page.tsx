"use client";

import AppNav from "@/components/AppNav";
import { useEffect, useMemo, useRef, useState } from "react";
import AuthModal from "@/components/AuthModal";
import { useDemoAuth } from "@/lib/auth";
import {
  fetchChatConversations,
  fetchChatMessages,
  fetchShareableContacts,
  getOrCreateDirectConversation,
  searchUsersForConnection,
  sendChatMessage,
  sendConnectionRequest,
  type ChatConversation,
  type ChatMessage,
  type ConnectableProfile,
  type ShareableContact,
} from "@/lib/supabase/socialFeatures";

function profileInitial(name?: string, email?: string) {
  return (name || email || "D").slice(0, 1).toUpperCase();
}

function formatChatTime(value?: string | null) {
  if (!value) return "";
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

function ChatContactRow({
  contact,
  conversation,
  active,
  onOpen,
  busy,
}: {
  contact: ShareableContact;
  conversation?: ChatConversation;
  active: boolean;
  onOpen: () => void;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={busy}
      className={`w-full rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
        active
          ? "border-blue-400 bg-blue-500/15"
          : "border-white/10 bg-black/20 hover:border-white/25 hover:bg-white/[0.05]"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-sm font-black text-white">
          {profileInitial(contact.displayName, contact.email)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-black text-white">{contact.displayName}</p>
            {conversation?.lastMessageAt && (
              <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-neutral-600">
                {formatChatTime(conversation.lastMessageAt)}
              </span>
            )}
          </div>
          <p className="truncate text-xs font-bold text-neutral-500">
            {conversation?.lastMessage || contact.email || "Start een gesprek"}
          </p>
        </div>
      </div>
    </button>
  );
}

function AddFriendResult({
  profile,
  onAdd,
  busy,
}: {
  profile: ConnectableProfile;
  onAdd: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 p-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-sm font-black text-white">
          {profileInitial(profile.displayName, profile.email)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-white">{profile.displayName}</p>
          <p className="truncate text-xs font-bold text-neutral-500">{profile.email}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onAdd}
        disabled={busy}
        className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-500 disabled:opacity-50"
      >
        Toevoegen
      </button>
    </div>
  );
}

export default function ChatPage() {
  const { user, isLoggedIn, loginWithCredentials, registerWithCredentials } = useDemoAuth();
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
  const [friendSearch, setFriendSearch] = useState("");
  const [friendResults, setFriendResults] = useState<ConnectableProfile[]>([]);
  const [friendBusy, setFriendBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const selectedConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.conversationId === selectedConversationId,
      ) ?? null,
    [conversations, selectedConversationId],
  );

  const conversationByContactId = useMemo(
    () =>
      new Map(
        conversations.map((conversation) => [
          conversation.otherUserId,
          conversation,
        ] as const),
      ),
    [conversations],
  );

  async function refreshChatData(preferredConversationId?: string | null) {
    if (!user) return { conversations: [] as ChatConversation[], contacts: [] as ShareableContact[] };

    const [nextConversations, nextContacts] = await Promise.all([
      fetchChatConversations(user),
      fetchShareableContacts(user),
    ]);

    setConversations(nextConversations);
    setContacts(nextContacts);

    const preferred = preferredConversationId ?? selectedConversationId;
    if (
      preferred &&
      nextConversations.some(
        (conversation) => conversation.conversationId === preferred,
      )
    ) {
      setSelectedConversationId(preferred);
    } else if (!selectedConversationId && nextConversations[0]) {
      setSelectedConversationId(nextConversations[0].conversationId);
    }

    return { conversations: nextConversations, contacts: nextContacts };
  }

  async function initializeChat() {
    if (!user) return;

    setLoading(true);
    setErrorMessage("");
    try {
      const params = new URLSearchParams(window.location.search);
      const requestedConversationId = params.get("conversation");
      const requestedContactId = params.get("contact");
      const initial = await refreshChatData(requestedConversationId);

      if (requestedContactId) {
        const contact = initial.contacts.find(
          (item) => item.userId === requestedContactId,
        );

        if (contact) {
          const existing = initial.conversations.find(
            (conversation) => conversation.otherUserId === contact.userId,
          );

          if (existing) {
            setSelectedConversationId(existing.conversationId);
          } else {
            const conversationId = await getOrCreateDirectConversation(
              user,
              contact.userId,
            );
            if (conversationId) {
              await refreshChatData(conversationId);
              setSelectedConversationId(conversationId);
            }
          }
        }
      }
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Kon chat niet laden.");
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
    void initializeChat();
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
      void refreshChatData(selectedConversationId);
    }, 6000);

    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversationId, user?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, selectedConversationId]);

  async function handleOpenContact(contact: ShareableContact) {
    if (!user) return;
    setMessageLoading(true);
    setErrorMessage("");
    setStatusMessage("");

    try {
      const existing = conversations.find(
        (conversation) => conversation.otherUserId === contact.userId,
      );

      if (existing) {
        setSelectedConversationId(existing.conversationId);
        await loadMessages(existing.conversationId);
        return;
      }

      const conversationId = await getOrCreateDirectConversation(
        user,
        contact.userId,
      );
      if (conversationId) {
        await refreshChatData(conversationId);
        setSelectedConversationId(conversationId);
        await loadMessages(conversationId);
      }
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
      await Promise.all([
        loadMessages(selectedConversationId),
        refreshChatData(selectedConversationId),
      ]);
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Kon bericht niet sturen.");
    } finally {
      setMessageLoading(false);
    }
  }

  async function handleFriendSearch() {
    if (!user) return;
    if (friendSearch.trim().length < 3) {
      setStatusMessage("Vul minimaal 3 tekens in om iemand te zoeken.");
      setFriendResults([]);
      return;
    }

    setFriendBusy(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      const results = await searchUsersForConnection(user, friendSearch);
      setFriendResults(results);
      if (results.length === 0) setStatusMessage("Geen gebruiker gevonden.");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Gebruiker zoeken mislukt.");
    } finally {
      setFriendBusy(false);
    }
  }

  async function handleAddFriend(profile: ConnectableProfile) {
    if (!user) return;
    setFriendBusy(true);
    setErrorMessage("");
    setStatusMessage("");
    try {
      await sendConnectionRequest(user, profile.id);
      setFriendResults([]);
      setFriendSearch("");
      setStatusMessage(`Vriendschapsverzoek naar ${profile.displayName} verstuurd.`);
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Vriendschapsverzoek versturen mislukt.");
    } finally {
      setFriendBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#05070d] text-white">
      <AppNav title="Chat" subtitle="Berichten met vrienden" />

      <section className="mx-auto w-full max-w-7xl px-5 py-6 sm:px-8 lg:px-10">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.34em] text-blue-300">
              DiBooks Chat
            </p>
            <h1 className="mt-2 text-3xl font-black sm:text-4xl">Berichten</h1>
          </div>
          {isLoggedIn && (
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-neutral-400">
              {contacts.length} {contacts.length === 1 ? "vriend" : "vrienden"}
            </span>
          )}
        </div>

        {!isLoggedIn ? (
          <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-8 text-center shadow-2xl">
            <h2 className="text-3xl font-black">Login nodig</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-7 text-neutral-400">
              Je moet ingelogd zijn om met vrienden te chatten.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setAuthModalMode("login")}
                className="rounded-full bg-blue-600 px-6 py-3 text-sm font-black text-white hover:bg-blue-500"
              >
                Login
              </button>
              <button
                type="button"
                onClick={() => setAuthModalMode("register")}
                className="rounded-full bg-white px-6 py-3 text-sm font-black text-black hover:bg-blue-100"
              >
                Registreer
              </button>
            </div>
          </section>
        ) : (
          <section className="grid min-h-[720px] gap-5 lg:grid-cols-[340px_1fr]">
            <aside className="flex min-h-0 flex-col rounded-[2rem] border border-white/10 bg-white/[0.03] p-4 shadow-2xl sm:p-5">
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.34em] text-neutral-500">
                      Vrienden
                    </p>
                    <h2 className="mt-1 text-2xl font-black">Contacten</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => void initializeChat()}
                    disabled={loading}
                    className="rounded-full border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-400 hover:bg-white/10 disabled:opacity-50"
                  >
                    Refresh
                  </button>
                </div>

                <div className="mt-4 rounded-2xl border border-blue-400/15 bg-blue-500/[0.06] p-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-200">
                    Vriend toevoegen
                  </p>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={friendSearch}
                      onChange={(event) => setFriendSearch(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void handleFriendSearch();
                      }}
                      placeholder="Naam of e-mail"
                      className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/35 px-3 py-2.5 text-xs font-bold text-white outline-none placeholder:text-neutral-600 focus:border-blue-400"
                    />
                    <button
                      type="button"
                      onClick={() => void handleFriendSearch()}
                      disabled={friendBusy}
                      className="rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-black text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                      Zoek
                    </button>
                  </div>

                  {friendResults.length > 0 && (
                    <div className="mt-3 grid gap-2">
                      {friendResults.map((profile) => (
                        <AddFriendResult
                          key={profile.id}
                          profile={profile}
                          busy={friendBusy}
                          onAdd={() => void handleAddFriend(profile)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {statusMessage && (
                  <div className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-xs font-bold leading-5 text-emerald-100">
                    {statusMessage}
                  </div>
                )}
                {errorMessage && (
                  <div className="mt-3 rounded-2xl border border-red-400/25 bg-red-500/10 p-3 text-xs font-bold leading-5 text-red-100">
                    {errorMessage}
                  </div>
                )}
              </div>

              <div className="mt-5 min-h-0 flex-1 overflow-y-auto border-t border-white/10 pt-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs font-black uppercase tracking-widest text-neutral-500">
                    Mijn vrienden
                  </p>
                  <span className="text-xs font-black text-neutral-600">{contacts.length}</span>
                </div>

                <div className="grid gap-2">
                  {contacts.map((contact) => {
                    const conversation = conversationByContactId.get(contact.userId);
                    return (
                      <ChatContactRow
                        key={contact.userId}
                        contact={contact}
                        conversation={conversation}
                        active={conversation?.conversationId === selectedConversationId}
                        busy={messageLoading}
                        onOpen={() => void handleOpenContact(contact)}
                      />
                    );
                  })}

                  {!loading && contacts.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm font-semibold leading-6 text-neutral-500">
                      Nog geen vrienden. Zoek hierboven iemand en stuur een verzoek.
                    </div>
                  )}
                </div>
              </div>
            </aside>

            <section className="flex min-h-[650px] flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.03] shadow-2xl">
              {selectedConversation ? (
                <>
                  <div className="flex items-center gap-3 border-b border-white/10 bg-black/20 p-4 sm:p-5">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-lg font-black text-white">
                      {profileInitial(
                        selectedConversation.otherDisplayName,
                        selectedConversation.otherEmail,
                      )}
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-xl font-black sm:text-2xl">
                        {selectedConversation.otherDisplayName}
                      </h2>
                      <p className="truncate text-xs font-bold text-neutral-500 sm:text-sm">
                        {selectedConversation.otherEmail}
                      </p>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                    <div className="grid gap-4">
                      {messages.map((message) => {
                        const isMine = message.senderId === user?.id;
                        return (
                          <div
                            key={message.messageId}
                            className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                          >
                            <div
                              className={`max-w-[82%] rounded-3xl border p-4 ${
                                isMine
                                  ? "border-blue-400/30 bg-blue-600 text-white"
                                  : "border-white/10 bg-black/35 text-white"
                              }`}
                            >
                              <div className="mb-2 flex items-center justify-between gap-4">
                                <span
                                  className={`text-[10px] font-black uppercase tracking-widest ${
                                    isMine ? "text-blue-100" : "text-neutral-500"
                                  }`}
                                >
                                  {isMine ? "Jij" : message.senderDisplayName}
                                </span>
                                <span
                                  className={`text-[10px] font-black uppercase tracking-widest ${
                                    isMine ? "text-blue-100" : "text-neutral-500"
                                  }`}
                                >
                                  {formatChatTime(message.createdAt)}
                                </span>
                              </div>
                              <p className="whitespace-pre-wrap text-sm font-semibold leading-7">
                                {message.message}
                              </p>
                              {message.relatedBookTitle && (
                                <p className="mt-3 rounded-2xl bg-black/25 px-3 py-2 text-xs font-black">
                                  Boek: {message.relatedBookTitle}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {messages.length === 0 && (
                        <div className="rounded-3xl border border-dashed border-white/10 p-8 text-center">
                          <h3 className="text-2xl font-black">Nog geen berichten</h3>
                          <p className="mt-2 text-sm font-semibold leading-7 text-neutral-500">
                            Stuur het eerste bericht naar {selectedConversation.otherDisplayName}.
                          </p>
                        </div>
                      )}
                      <div ref={bottomRef} />
                    </div>
                  </div>

                  <div className="border-t border-white/10 bg-black/20 p-4 sm:p-5">
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
                      <button
                        type="button"
                        onClick={() => void handleSendMessage()}
                        disabled={messageLoading || !draft.trim()}
                        className="rounded-3xl bg-blue-600 px-6 py-4 text-sm font-black text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Stuur
                      </button>
                    </div>
                    <p className="mt-3 text-xs font-semibold text-neutral-600">
                      Enter verstuurt • Shift + Enter maakt een nieuwe regel
                    </p>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center p-8 text-center">
                  <div>
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white/10 text-3xl">
                      💬
                    </div>
                    <h2 className="mt-5 text-3xl font-black">Kies een vriend</h2>
                    <p className="mt-3 max-w-md text-sm font-semibold leading-7 text-neutral-500">
                      Kies links iemand uit je vriendenlijst om een bestaand gesprek te openen of een nieuwe chat te starten.
                    </p>
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
