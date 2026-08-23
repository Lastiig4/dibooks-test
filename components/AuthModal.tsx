"use client";

import { useEffect, useMemo, useState } from "react";
import type { AuthActionResult, LoginCredentials, RegisterCredentials } from "@/lib/auth";

type AuthMode = "login" | "register";

type AuthModalProps = {
  mode: AuthMode;
  onModeChange: (mode: AuthMode) => void;
  onClose: () => void;
  onLogin: (credentials: LoginCredentials) => Promise<AuthActionResult>;
  onRegister: (credentials: RegisterCredentials) => Promise<AuthActionResult>;
};

export default function AuthModal({
  mode,
  onModeChange,
  onClose,
  onLogin,
  onRegister,
}: AuthModalProps) {
  const [name, setName] = useState("Giovanni");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isRegister = mode === "register";

  const title = useMemo(() => (isRegister ? "Maak je auteursaccount" : "Welkom terug"), [isRegister]);
  const subtitle = useMemo(
    () =>
      isRegister
        ? "Registreer als auteur en koppel je boeken straks veilig aan jouw account."
        : "Log in om je dashboard, concepten en publicatie-flow te openen.",
    [isRegister],
  );

  useEffect(() => {
    setMessage(null);
    setError(null);
  }, [mode]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setError(null);

    try {
      const result = isRegister
        ? await onRegister({ name, email, password })
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

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/75 px-4 py-6 text-white backdrop-blur-md sm:items-center">
      <div className="relative grid max-h-[calc(100vh-3rem)] w-full max-w-5xl overflow-y-auto rounded-[2rem] border border-white/10 bg-[#070a12] shadow-2xl lg:grid-cols-[0.92fr_1.08fr]">
        <div className="relative hidden min-h-[560px] overflow-hidden bg-gradient-to-br from-blue-950 via-slate-950 to-purple-950 p-8 lg:block">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.2),transparent_28%),radial-gradient(circle_at_80%_0%,rgba(34,211,238,0.15),transparent_30%),linear-gradient(180deg,rgba(0,0,0,0.1),rgba(0,0,0,0.85))]" />
          <div className="relative flex h-full flex-col justify-between">
            <div>
              <div className="inline-flex rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.28em] text-cyan-100">
                DiBooks Auteur Platform
              </div>
              <h2 className="mt-7 text-5xl font-black leading-none">
                Bouw verhalen die keuzes onthouden.
              </h2>
              <p className="mt-5 max-w-sm text-sm font-semibold leading-7 text-neutral-300">
                Accounts worden de basis voor dashboard-opslag, publicatie, testlezers en later samenwerking tussen auteurs.
              </p>
            </div>

            <div className="grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm">
                <p className="text-xs font-black uppercase tracking-widest text-cyan-200">Nu</p>
                <p className="mt-1 text-sm font-bold text-neutral-200">Login, dashboard toegang en boek-eigenaarschap.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm">
                <p className="text-xs font-black uppercase tracking-widest text-purple-200">Straks</p>
                <p className="mt-1 text-sm font-bold text-neutral-200">Database-save, feedback van testlezers en publicatiebeheer.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-8 lg:p-10">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-300">
                {isRegister ? "Registreren" : "Login"}
              </p>
              <h1 className="mt-3 text-3xl font-black sm:text-5xl">{title}</h1>
              <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-neutral-400">{subtitle}</p>
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
                !isRegister ? "bg-white text-black" : "text-neutral-400 hover:text-white"
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => onModeChange("register")}
              className={`rounded-xl px-4 py-3 text-sm font-black transition ${
                isRegister ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white"
              }`}
            >
              Registreer
            </button>
          </div>

          <form onSubmit={submit} className="mt-7 grid gap-4">
            {isRegister && (
              <div>
                <label className="mb-2 block text-sm font-black text-neutral-300">Auteursnaam</label>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  placeholder="Bijv. Giovanni"
                  className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-4 font-bold text-white outline-none transition placeholder:text-neutral-600 focus:border-blue-400 focus:bg-black/55"
                />
              </div>
            )}

            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">E-mailadres</label>
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
                <label className="block text-sm font-black text-neutral-300">Wachtwoord</label>
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
              {busy ? "Even wachten..." : isRegister ? "Account aanmaken" : "Inloggen"}
            </button>
          </form>

          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm font-semibold leading-6 text-neutral-400">
            {isRegister ? (
              <>
                Heb je al een account?{" "}
                <button className="font-black text-blue-300 hover:text-blue-200" onClick={() => onModeChange("login")}>
                  Log hier in.
                </button>
              </>
            ) : (
              <>
                Nog geen auteuraccount?{" "}
                <button className="font-black text-blue-300 hover:text-blue-200" onClick={() => onModeChange("register")}>
                  Maak er één aan.
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
