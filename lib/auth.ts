"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type UserRole = "guest" | "reader" | "author" | "admin";
export type UserPlan = "free" | "reader_plus" | "author_pro" | "member";

export type AuthActionResult = { ok: boolean; message?: string };

export type LoginCredentials = {
  email: string;
  password: string;
};

export type RegisterCredentials = {
  name: string;
  email: string;
  password: string;
};

export type DemoAuthUser = {
  id: string;
  name: string;
  email: string;
  role: Exclude<UserRole, "guest">;
  plan: UserPlan;
};

export type AuthPermissions = {
  canReadLibrary: boolean;
  canUseEditor: boolean;
  canDownloadLocalFiles: boolean;
  canUseDashboard: boolean;
  canSaveToDashboard: boolean;
  canCreateBook: boolean;
  canEditConceptBook: boolean;
  canPublishBook: boolean;
  canRemoveFromLibrary: boolean;
  canManageUsers: boolean;
  maxNodesPerBook: number | null;
};

export const DIBOOKS_AUTH_CHANGED_EVENT = "dibooks-auth-changed";
const AUTH_CACHE_KEY = "dibooks-auth-user-cache-v2";

export type OwnedResourceFields = {
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
};

export function getOwnedResourceFields(user: DemoAuthUser): OwnedResourceFields {
  return {
    ownerId: user.id,
    ownerName: user.name,
    ownerEmail: user.email,
  };
}

export function canAccessOwnedResource(
  user: DemoAuthUser | null,
  resourceOwnerId?: string,
) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return !resourceOwnerId || resourceOwnerId === user.id;
}

function broadcastAuthChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DIBOOKS_AUTH_CHANGED_EVENT));
}

export const FREE_NODE_LIMIT = 15;
export const AUTHOR_PRO_MIN_COMPLETE_NODES_TO_PUBLISH = 5;
export const FULL_BOOK_NODE_BADGE_THRESHOLD = 20;

export function isAuthorProUser(user: DemoAuthUser | null) {
  return !!user && (
    user.role === "admin" ||
    user.plan === "author_pro" ||
    user.plan === "member"
  );
}

export function canReadPremiumBooks(user: DemoAuthUser | null) {
  return !!user && (
    user.role === "admin" ||
    user.plan === "reader_plus" ||
    user.plan === "author_pro" ||
    user.plan === "member"
  );
}

export function getMaxNodesForUser(user: DemoAuthUser | null) {
  return isAuthorProUser(user) ? null : FREE_NODE_LIMIT;
}

export function getRoleLabel(user: DemoAuthUser | null) {
  if (!user) return "Gast";
  if (user.role === "admin") return "Admin";
  if (user.role === "author") return "Auteur";
  return "Lezer";
}

export function getPlanLabel(user: DemoAuthUser | null) {
  if (!user) return "Gratis";
  if (user.plan === "reader_plus") return "Reader Plus";
  if (user.plan === "author_pro" || user.plan === "member") return "Author Pro";
  return "Gratis";
}

export function getAccountLabel(user: DemoAuthUser | null) {
  if (!user) return "Gast • Gratis";
  return `${getRoleLabel(user)} • ${getPlanLabel(user)}`;
}

function readCachedUser(): DemoAuthUser | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<DemoAuthUser>;
    if (!parsed.id || !parsed.email) return null;

    const role: Exclude<UserRole, "guest"> =
      parsed.role === "admin"
        ? "admin"
        : parsed.role === "reader"
          ? "reader"
          : "author";

    const plan: UserPlan =
      parsed.plan === "reader_plus"
        ? "reader_plus"
        : parsed.plan === "author_pro" || parsed.plan === "member"
          ? "author_pro"
          : "free";

    return {
      id: parsed.id,
      name: parsed.name || parsed.email.split("@")[0] || "Auteur",
      email: parsed.email,
      role,
      plan,
    };
  } catch {
    return null;
  }
}

function writeCachedUser(user: DemoAuthUser | null) {
  if (typeof window === "undefined") return;

  try {
    if (!user) {
      window.localStorage.removeItem(AUTH_CACHE_KEY);
      return;
    }

    window.localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(user));
  } catch {
    // Browseropslag kan vol of geblokkeerd zijn. Auth blijft via Supabase werken.
  }
}

type AuthSnapshot = {
  user: DemoAuthUser | null;
  loading: boolean;
  initialized: boolean;
};

const cachedUser = typeof window !== "undefined" ? readCachedUser() : null;

let authSnapshot: AuthSnapshot = {
  user: cachedUser,
  loading: !cachedUser,
  initialized: false,
};

let authBootPromise: Promise<void> | null = null;
const authSubscribers = new Set<() => void>();

// Voorkomt dubbele profile upsert/select wanneer signInWithPassword én
// onAuthStateChange vrijwel tegelijkertijd dezelfde gebruiker doorgeven.
const profileRefreshes = new Map<string, Promise<void>>();
let logoutInProgress = false;

function emitAuthSnapshot(next: Partial<AuthSnapshot>) {
  authSnapshot = { ...authSnapshot, ...next };
  writeCachedUser(authSnapshot.user);
  authSubscribers.forEach((subscriber) => subscriber());
}

function mapSupabaseUser(user: User | null): DemoAuthUser | null {
  if (!user) return null;

  const metadata = user.user_metadata ?? {};
  const appMetadata = user.app_metadata ?? {};
  const metadataRole = metadata.role || appMetadata.role;

  const role: Exclude<UserRole, "guest"> =
    metadataRole === "admin"
      ? "admin"
      : metadataRole === "reader"
        ? "reader"
        : "author";

  const metadataPlan = metadata.plan || appMetadata.plan;
  const plan: UserPlan =
    metadataPlan === "reader_plus"
      ? "reader_plus"
      : metadataPlan === "author_pro" || metadataPlan === "member"
        ? "author_pro"
        : "free";

  return {
    id: user.id,
    name: String(
      metadata.full_name ||
        metadata.name ||
        user.email?.split("@")[0] ||
        "Auteur",
    ),
    email: user.email ?? "",
    role,
    plan,
  };
}

function getSupabaseOrAlert() {
  try {
    return createSupabaseBrowserClient();
  } catch (error) {
    console.error(error);
    alert(
      "Supabase is nog niet ingesteld. Check je .env.local met NEXT_PUBLIC_SUPABASE_URL en NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY of NEXT_PUBLIC_SUPABASE_ANON_KEY. Herstart daarna npm run dev.",
    );
    return null;
  }
}

async function applySupabaseProfile(
  user: DemoAuthUser | null,
): Promise<DemoAuthUser | null> {
  if (!user) return null;

  const supabase = getSupabaseOrAlert();
  if (!supabase) return user;

  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, email, role, plan")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.warn(
      "Kon DiBooks profile niet laden. Gebruik auth fallback.",
      error.message,
    );
    return user;
  }

  if (!data) return user;

  const role: Exclude<UserRole, "guest"> =
    data.role === "admin"
      ? "admin"
      : data.role === "reader"
        ? "reader"
        : "author";

  const plan: UserPlan =
    data.plan === "reader_plus"
      ? "reader_plus"
      : data.plan === "author_pro" || data.plan === "member"
        ? "author_pro"
        : "free";

  return {
    ...user,
    name: data.display_name || user.name,
    email: data.email || user.email,
    role,
    plan,
  };
}

function refreshProfileFromSupabase(
  mappedUser: DemoAuthUser | null,
): Promise<void> {
  if (!mappedUser) {
    emitAuthSnapshot({
      user: null,
      loading: false,
      initialized: true,
    });
    broadcastAuthChange();
    return Promise.resolve();
  }

  // De UI krijgt de ingelogde gebruiker DIRECT. Profielverrijking gebeurt
  // daarna op de achtergrond en blokkeert login niet meer.
  emitAuthSnapshot({
    user: mappedUser,
    loading: false,
    initialized: true,
  });
  broadcastAuthChange();

  const existingRefresh = profileRefreshes.get(mappedUser.id);
  if (existingRefresh) return existingRefresh;

  const refreshPromise = (async () => {
    try {
      await ensureSupabaseProfile(mappedUser);
      const profiledUser = await applySupabaseProfile(mappedUser);

      // Een langzame profielquery mag iemand die ondertussen is uitgelogd
      // nooit opnieuw in de UI zetten.
      if (authSnapshot.user?.id !== mappedUser.id || logoutInProgress) return;

      emitAuthSnapshot({
        user: profiledUser ?? mappedUser,
        loading: false,
        initialized: true,
      });
      broadcastAuthChange();
    } catch (profileError) {
      console.warn("DiBooks profile check mislukt.", profileError);

      if (authSnapshot.user?.id === mappedUser.id && !logoutInProgress) {
        emitAuthSnapshot({
          user: mappedUser,
          loading: false,
          initialized: true,
        });
      }
    } finally {
      profileRefreshes.delete(mappedUser.id);
    }
  })();

  profileRefreshes.set(mappedUser.id, refreshPromise);
  return refreshPromise;
}

function bootAuthOnce() {
  if (authBootPromise) return authBootPromise;

  authBootPromise = (async () => {
    const supabase = getSupabaseOrAlert();

    if (!supabase) {
      emitAuthSnapshot({ loading: false, initialized: true });
      return;
    }

    // Eén gedeelde Supabase-client + één auth listener voor de hele app.
    void (async () => {
      const sessionResult = await supabase.auth.getSession();
      const { data, error } = sessionResult;

      if (error) {
        console.warn(
          "Supabase getSession gaf geen actieve sessie.",
          error.message,
        );
      }

      const mappedUser = mapSupabaseUser(data.session?.user ?? null);
      void refreshProfileFromSupabase(mappedUser);
    })();

    supabase.auth.onAuthStateChange((_event, session) => {
      if (logoutInProgress && session) return;

      if (!session) {
        logoutInProgress = false;
        emitAuthSnapshot({
          user: null,
          loading: false,
          initialized: true,
        });
        broadcastAuthChange();
        return;
      }

      const mappedUser = mapSupabaseUser(session.user);
      if (!mappedUser) return;

      // BELANGRIJK:
      // Geen Supabase databasecalls starten terwijl onAuthStateChange nog loopt.
      // Supabase houdt tijdens auth-events intern een auth-lock vast. Een profiel-
      // query vanuit deze callback kan daardoor de signIn promise tot een timeout
      // blokkeren. We werken de UI direct bij en stellen de profielquery uit tot
      // de callback volledig is afgerond.
      emitAuthSnapshot({
        user: mappedUser,
        loading: false,
        initialized: true,
      });
      broadcastAuthChange();

      window.setTimeout(() => {
        if (logoutInProgress || authSnapshot.user?.id !== mappedUser.id) return;
        void refreshProfileFromSupabase(mappedUser);
      }, 0);
    });
  })();

  return authBootPromise;
}

export function getAuthPermissions(
  user: DemoAuthUser | null,
): AuthPermissions {
  const role: UserRole = user?.role ?? "guest";
  const isAuthor = role === "author" || role === "admin";
  const isAdmin = role === "admin";
  const isAuthorPro = isAuthorProUser(user);

  return {
    canReadLibrary: true,
    canUseEditor: true,
    canDownloadLocalFiles: true,
    canUseDashboard: isAuthor,
    canSaveToDashboard: isAuthor,
    canCreateBook: isAuthor,
    canEditConceptBook: isAuthor,
    canPublishBook: isAuthorPro,
    canRemoveFromLibrary: isAuthorPro,
    canManageUsers: isAdmin,
    maxNodesPerBook: getMaxNodesForUser(user),
  };
}

export async function ensureSupabaseProfile(
  user: DemoAuthUser,
): Promise<AuthActionResult> {
  const supabase = getSupabaseOrAlert();
  if (!supabase) {
    return {
      ok: false,
      message: "Supabase is nog niet ingesteld.",
    };
  }

  const displayName =
    user.name?.trim() ||
    user.email?.split("@")[0] ||
    "Auteur";

  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      email: user.email,
      display_name: displayName,
      role:
        user.role === "admin"
          ? "admin"
          : user.role === "reader"
            ? "reader"
            : "author",
      plan:
        user.plan === "member"
          ? "author_pro"
          : user.plan || "free",
    },
    {
      onConflict: "id",
      ignoreDuplicates: true,
    },
  );

  if (error) {
    console.error(
      "Kon DiBooks profile niet controleren/aanmaken.",
      error,
    );
    return {
      ok: false,
      message: error.message,
    };
  }

  return { ok: true };
}

async function promptForLogin() {
  const email = window.prompt("E-mailadres voor DiBooks login:");
  if (!email) return null;

  const password = window.prompt("Wachtwoord:");
  if (!password) return null;

  return {
    email: email.trim(),
    password,
  };
}

async function promptForRegistration() {
  const name =
    window.prompt("Naam / auteursnaam:")?.trim() ||
    "Auteur";

  const email = window.prompt(
    "E-mailadres voor je DiBooks account:",
  );
  if (!email) return null;

  const password = window.prompt(
    "Kies een wachtwoord, minimaal 6 tekens:",
  );
  if (!password) return null;

  if (password.length < 6) {
    alert("Gebruik een wachtwoord van minimaal 6 tekens.");
    return null;
  }

  return {
    name,
    email: email.trim(),
    password,
  };
}

export function useDemoAuth() {
  const [snapshot, setSnapshot] = useState<AuthSnapshot>(
    () => authSnapshot,
  );

  useEffect(() => {
    function handleSnapshotUpdate() {
      setSnapshot(authSnapshot);
    }

    authSubscribers.add(handleSnapshotUpdate);
    void bootAuthOnce();

    const handleAuthChanged = () => {
      void bootAuthOnce();
      handleSnapshotUpdate();
    };

    window.addEventListener(
      DIBOOKS_AUTH_CHANGED_EVENT,
      handleAuthChanged,
    );

    return () => {
      authSubscribers.delete(handleSnapshotUpdate);
      window.removeEventListener(
        DIBOOKS_AUTH_CHANGED_EVENT,
        handleAuthChanged,
      );
    };
  }, []);

  const user = snapshot.user;
  const loading = snapshot.loading;
  const permissions = useMemo(
    () => getAuthPermissions(user),
    [user],
  );

  async function loginWithCredentials(
    credentials: LoginCredentials,
  ): Promise<AuthActionResult> {
    const supabase = getSupabaseOrAlert();
    if (!supabase) {
      return {
        ok: false,
        message: "Supabase is nog niet ingesteld.",
      };
    }

    const email = credentials.email.trim();
    if (!email || !credentials.password) {
      return {
        ok: false,
        message: "Vul je e-mailadres en wachtwoord in.",
      };
    }

    const loginStartedAt =
      typeof performance !== "undefined" ? performance.now() : Date.now();

    const { data, error } =
      await supabase.auth.signInWithPassword({
        email,
        password: credentials.password,
      });

    const loginFinishedAt =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    const loginDurationMs = Math.round(loginFinishedAt - loginStartedAt);

    if (loginDurationMs > 1500) {
      console.info(
        `[DiBooks Auth] Supabase signInWithPassword duurde ${loginDurationMs} ms.`,
      );
    }

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    const mappedUser = mapSupabaseUser(data.user);

    // De auth-listener heeft de UI normaal al bijgewerkt. Dit is een veilige
    // fallback voor browsers waarin dat event net later arriveert.
    if (mappedUser && authSnapshot.user?.id !== mappedUser.id) {
      emitAuthSnapshot({
        user: mappedUser,
        loading: false,
        initialized: true,
      });
      broadcastAuthChange();
    }

    // Profielverrijking pas in een volgende event-loop tick. Zo kan de auth-lock
    // van signInWithPassword eerst volledig worden vrijgegeven.
    if (mappedUser) {
      window.setTimeout(() => {
        if (logoutInProgress || authSnapshot.user?.id !== mappedUser.id) return;
        void refreshProfileFromSupabase(mappedUser);
      }, 0);
    }

    return { ok: true };
  }

  async function registerWithCredentials(
    credentials: RegisterCredentials,
  ): Promise<AuthActionResult> {
    const supabase = getSupabaseOrAlert();
    if (!supabase) {
      return {
        ok: false,
        message: "Supabase is nog niet ingesteld.",
      };
    }

    const name = credentials.name.trim() || "Auteur";
    const email = credentials.email.trim();

    if (!email || !credentials.password) {
      return {
        ok: false,
        message: "Vul je naam, e-mailadres en wachtwoord in.",
      };
    }

    if (credentials.password.length < 6) {
      return {
        ok: false,
        message: "Gebruik een wachtwoord van minimaal 6 tekens.",
      };
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password: credentials.password,
      options: {
        data: {
          full_name: name,
          name,
          role: "author",
        },
      },
    });

    if (error) {
      return {
        ok: false,
        message: error.message,
      };
    }

    if (data.user && !data.session) {
      return {
        ok: true,
        message:
          "Account aangemaakt. Check je e-mail om je account te bevestigen, of zet e-mailbevestiging tijdelijk uit in Supabase tijdens testen.",
      };
    }

    const mappedUser = mapSupabaseUser(data.user);

    if (mappedUser && authSnapshot.user?.id !== mappedUser.id) {
      emitAuthSnapshot({
        user: mappedUser,
        loading: false,
        initialized: true,
      });
      broadcastAuthChange();
    }

    if (mappedUser) {
      window.setTimeout(() => {
        if (logoutInProgress || authSnapshot.user?.id !== mappedUser.id) return;
        void refreshProfileFromSupabase(mappedUser);
      }, 0);
    }

    return {
      ok: true,
      message: "Account aangemaakt en ingelogd.",
    };
  }

  async function login() {
    const credentials = await promptForLogin();
    if (!credentials) return;

    const result = await loginWithCredentials(credentials);
    if (!result.ok) {
      alert(`Login mislukt: ${result.message}`);
    }
  }

  async function register() {
    const credentials = await promptForRegistration();
    if (!credentials) return;

    const result = await registerWithCredentials(credentials);

    if (!result.ok) {
      alert(`Registreren mislukt: ${result.message}`);
    } else if (result.message) {
      alert(result.message);
    }
  }

  async function logout() {
    const supabase = getSupabaseOrAlert();
    if (!supabase) return;

    // UX eerst: de hele DiBooks UI ziet DIRECT guest.
    logoutInProgress = true;
    emitAuthSnapshot({
      user: null,
      loading: false,
      initialized: true,
    });
    writeCachedUser(null);
    broadcastAuthChange();

    // Supabase afmelden gebeurt daarna. De gebruiker hoeft niet op deze
    // server-roundtrip te wachten om de interface te zien veranderen.
    void (async () => {
      try {
        const signOutResult = await supabase.auth.signOut();
        const { error } = signOutResult;

        if (error) {
          console.warn(
            "Supabase logout kon server-side niet volledig worden afgerond.",
            error.message,
          );
        }
      } catch (error) {
        console.warn(
          "Supabase logout netwerkfout.",
          error,
        );
      } finally {
        logoutInProgress = false;
      }
    })();
  }

  return {
    user,
    role: user?.role ?? "guest",
    isLoggedIn: !!user,
    loading,
    permissions,
    login,
    register,
    loginWithCredentials,
    registerWithCredentials,
    logout,
  };
}
