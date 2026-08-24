"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type {
  AuthActionResult,
  LoginCredentials,
  PublicSignupPlan,
  RegisterCredentials,
} from "@/lib/auth";
import { PUBLIC_PLANS, getPublicPlan } from "@/lib/plans";

type AuthMode = "login" | "register";

type AuthModalProps = {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onClose: () => void;
  onLogin: (credentials: LoginCredentials) => Promise<AuthActionResult>;
  onRegister: (credentials: RegisterCredentials) => Promise<AuthActionResult>;
  initialPlan?: PublicSignupPlan;
};

function planCardClass(plan: PublicSignupPlan, selected: boolean) {
  const accent =
    plan === "free"
      ? "border-emerald-400/35 bg-emerald-500/10"
      : plan === "reader_plus"
        ? "border-blue-400/35 bg-blue-500/10"
        : "border-violet-400/35 bg-violet-500/10";

  return selected
    ? `${accent} ring-2 ring-white/70`
    : "border-white/10 bg-white/[0.035] hover:border-white/25 hover:bg-white/[0.06]";
}

function planDotClass(plan: PublicSignupPlan) {
  if (plan === "free") return "bg-emerald-400";
  if (plan === "reader_plus") return "bg-blue-400";
  return "bg-violet-400";
}

export default function AuthModal({
  mode,
  onModeChange,
  onClose,
  onLogin,
  onRegister,
  initialPlan = "free",
}: AuthModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedPlan, setSelectedPlan] =
    useState<PublicSignupPlan>(initialPlan);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const isRegister = mode === "register";
  const activePlan = useMemo(
    () => getPublicPlan(selectedPlan),
    [selectedPlan],
  );

  const title = isRegister ? "Kies jouw DiBooks-account" : "Welkom terug";
  const subtitle = isRegister
    ? "Begin gratis als lezer of kies alvast het Reader- of Auteur-plan voor wanneer betalingen worden geactiveerd."
    : "Log in om je Library, voortgang en eventuele auteursomgeving te openen.";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setMessage(null);
    setError(null);
  }, [mode]);

  useEffect(() => {
    setSelectedPlan(initialPlan);
  }, [initialPlan]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      const result = isRegister
        ? await onRegister({
            name,
            email,
            password,
            plan: selectedPlan,
          })
        : await onLogin({ email, password });

      if (!result.ok) {
        setError(result.message ?? "Er ging iets mis.");
        return;
      }

      if (result.message) {
        setMessage(result.message);
      } else {
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[2147483647] flex items-center justify-center overflow-y-auto bg-black/85 px-4 py-8 text-white backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="relative grid max-h-[calc(100dvh-4rem)] w-full max-w-6xl overflow-y-auto rounded-[2rem] border border-white/10 bg-[#070a12] shadow-2xl lg:grid-cols-[0.82fr_1.18fr]">
        <aside className="relative hidden min-h-[660px] overflow-hidden bg-gradient-to-br from-blue-950 via-slate-950 to-purple-950 p-8 lg:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.20),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(34,211,238,0.15),transparent_30%),linear-gradient(180deg,rgba(0,0,0,0.10),rgba(0,0,0,0.88))]" />
          <div className="relative flex h-full flex-col justify-between">
            <div>
              <div className="inline-flex rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.28em] text-cyan-100">
                DiBooks
              </div>
              <h2 className="mt-7 text-5xl font-black leading-none">
                Verhalen die reageren op jouw keuzes.
              </h2>
              <p className="mt-5 max-w-sm text-sm font-semibold leading-7 text-neutral-300">
                Lees interactieve boeken met keuzes, cutscenes en minigames —
                of bouw zelf een verhaal in de Auteur Studio.
              </p>
            </div>

            <div className="grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm">
                <p className="text-xs font-black uppercase tracking-widest text-cyan-200">
                  Reader
                </p>
                <p className="mt-1 text-sm font-bold text-neutral-200">
                  Eén account voor voortgang, favorieten en straks premiumboeken.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm">
                <p className="text-xs font-black uppercase tracking-widest text-purple-200">
                  Auteur
                </p>
                <p className="mt-1 text-sm font-bold text-neutral-200">
                  Bouw via nodes, paths, keuzes, variabelen en publicatie-review.
                </p>
              </div>
            </div>
          </div>
        </aside>

        <div className="p-5 sm:p-8 lg:p-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-300">
                {isRegister ? "Registreren" : "Login"}
              </p>
              <h1 className="mt-3 text-3xl font-black sm:text-5xl">
                {title}
              </h1>
              <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-neutral-400">
                {subtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 text-2xl font-black text-white hover:bg-red-600"
              aria-label="Sluit login scherm"
            >
              ×
            </button>
          </div>

          <div className="mt-7 grid grid-cols-2 rounded-2xl border border-white/10 bg-black/30 p-1">
            <button
              type="button"
              onClick={() => onModeChange("login")}
              className={`rounded-xl px-4 py-3 text-sm font-black transition ${
                !isRegister
                  ? "bg-white text-black"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => onModeChange("register")}
              className={`rounded-xl px-4 py-3 text-sm font-black transition ${
                isRegister
                  ? "bg-blue-600 text-white"
                  : "text-neutral-400 hover:text-white"
              }`}
            >
              Registreer
            </button>
          </div>

          {isRegister && (
            <section className="mt-7">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-neutral-500">
                    Kies een plan
                  </p>
                  <h2 className="mt-1 text-xl font-black">
                    Hoe wil je DiBooks gebruiken?
                  </h2>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-neutral-400">
                  Admin is nooit een signup-optie
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {PUBLIC_PLANS.map((plan) => {
                  const selected = selectedPlan === plan.id;
                  return (
                    <button
                      key={plan.id}
                      type="button"
                      onClick={() => setSelectedPlan(plan.id)}
                      className={`rounded-2xl border p-4 text-left transition ${planCardClass(
                        plan.id,
                        selected,
                      )}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-sm font-black">
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${planDotClass(
                              plan.id,
                            )}`}
                          />
                          {plan.name}
                        </span>
                        {plan.paid && (
                          <span className="rounded-full bg-black/30 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-neutral-300">
                            betaling later
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-xs font-bold text-neutral-500">
                        {plan.priceLabel}
                      </p>
                      <p className="mt-2 text-xs font-semibold leading-5 text-neutral-300">
                        {plan.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              {activePlan.paid && (
                <div className="mt-3 rounded-2xl border border-yellow-400/20 bg-yellow-500/10 p-3 text-xs font-semibold leading-5 text-yellow-100">
                  De betaalprovider is nog niet gekoppeld. Je keuze voor {activePlan.name}
                  wordt alvast opgeslagen, maar het account start veilig als Gratis / Reader.
                  Zodra billing live gaat activeert een geslaagde betaling automatisch het juiste plan en de juiste rechten.
                </div>
              )}
            </section>
          )}

          <form onSubmit={submit} className="mt-7 grid gap-4">
            {isRegister && (
              <div>
                <label className="mb-2 block text-sm font-black text-neutral-300">
                  Naam / auteursnaam
                </label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  placeholder="Jouw naam of auteursnaam"
                  className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-4 font-bold text-white outline-none transition placeholder:text-neutral-600 focus:border-blue-400 focus:bg-black/55"
                />
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">
                E-mailadres
              </label>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                inputMode="email"
                type="email"
                placeholder="jij@email.nl"
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-4 font-bold text-white outline-none transition placeholder:text-neutral-600 focus:border-blue-400 focus:bg-black/55"
              />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-sm font-black text-neutral-300">
                  Wachtwoord
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="text-xs font-black uppercase tracking-widest text-blue-300 hover:text-blue-200"
                >
                  {showPassword ? "Verberg" : "Toon"}
                </button>
              </div>
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={isRegister ? "new-password" : "current-password"}
                type={showPassword ? "text" : "password"}
                placeholder={isRegister ? "Minimaal 6 tekens" : "Je wachtwoord"}
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-4 font-bold text-white outline-none transition placeholder:text-neutral-600 focus:border-blue-400 focus:bg-black/55"
              />
            </div>

            {error && (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold leading-6 text-red-100">
                {error}
              </div>
            )}

            {message && (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-bold leading-6 text-emerald-100">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-2 rounded-2xl bg-blue-600 px-5 py-4 text-base font-black text-white shadow-xl shadow-blue-950/30 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
            >
              {busy
                ? "Even wachten..."
                : isRegister
                  ? selectedPlan === "free"
                    ? "Gratis account aanmaken"
                    : `${activePlan.name}-account kiezen`
                  : "Inloggen"}
            </button>
          </form>
        </div>
      </div>
    </div>,
    document.body,
  );
}
