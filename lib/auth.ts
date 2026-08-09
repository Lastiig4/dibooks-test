auth
"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type UserRole = "guest" | "reader" | "author" | "admin";
export type UserPlan = "free" | "reader_plus" | "author_pro" | "member"; // member = oude naam, wordt als author_pro behandeld

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
  return !!user && (user.role === "admin" || user.plan === "author_pro" || user.plan === "member");
}

export function canReadPremiumBooks(user: DemoAuthUser | null) {
  return !!user && (user.role === "admin" || user.plan === "reader_plus" || user.plan === "author_pro" || user.plan === "member");
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

function mapSupabaseUser(user: User | null): DemoAuthUser | null {
  if (!user) return null;

  const metadata = user.user_metadata ?? {};
  const appMetadata = user.app_metadata ?? {};
  const metadataRole = metadata.role || appMetadata.role;
  const role: Exclude<UserRole, "guest"> =
    metadataRole === "admin" ? "admin" : metadataRole === "reader" ? "reader" : "author";
  const metadataPlan = metadata.plan || appMetadata.plan;
  const plan: UserPlan =
    metadataPlan === "reader_plus"
      ? "reader_plus"
      : metadataPlan === "author_pro" || metadataPlan === "member"
        ? "author_pro"
        : "free";

  return {
    id: user.id,
    name:
      String(metadata.full_name || metadata.name || user.email?.split("@")[0] || "Auteur"),
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

async function applySupabaseProfile(user: DemoAuthUser | null): Promise<DemoAuthUser | null> {
  if (!user) return null;

  const supabase = getSupabaseOrAlert();
  if (!supabase) return user;

  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, email, role, plan")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    console.warn("Kon DiBooks profile niet laden. Gebruik auth fallback.", error.message);
    return user;
  }

  if (!data) return user;

  const role: Exclude<UserRole, "guest"> =
    data.role === "admin" ? "admin" : data.role === "reader" ? "reader" : "author";
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

export function getAuthPermissions(user: DemoAuthUser | null): AuthPermissions {
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

export async function ensureSupabaseProfile(user: DemoAuthUser): Promise<AuthActionResult> {
  const supabase = getSupabaseOrAlert();
  if (!supabase) return { ok: false, message: "Supabase is nog niet ingesteld." };

  const displayName = user.name?.trim() || user.email?.split("@")[0] || "Auteur";

  // Belangrijk: ignoreDuplicates voorkomt dat een bestaande admin/author profile
  // per ongeluk wordt overschreven. Ontbreekt de profile-row, dan maken we hem aan.
  const { error } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      email: user.email,
      display_name: displayName,
      role: user.role === "admin" ? "admin" : user.role === "reader" ? "reader" : "author",
      plan: user.plan === "member" ? "author_pro" : user.plan || "free",
    },
    { onConflict: "id", ignoreDuplicates: true },
  );

  if (error) {
    console.error("Kon DiBooks profile niet controleren/aanmaken.", error);
    return { ok: false, message: error.message };
  }

  return { ok: true };
}

async function promptForLogin() {
  const email = window.prompt("E-mailadres voor DiBooks login:");
  if (!email) return null;

  const password = window.prompt("Wachtwoord:");
  if (!password) return null;

  return { email: email.trim(), password };
}

async function promptForRegistration() {
  const name = window.prompt("Naam / auteursnaam:")?.trim() || "Auteur";
  const email = window.prompt("E-mailadres voor je DiBooks account:");
  if (!email) return null;

  const password = window.prompt("Kies een wachtwoord, minimaal 6 tekens:");
  if (!password) return null;

  if (password.length < 6) {
    alert("Gebruik een wachtwoord van minimaal 6 tekens.");
    return null;
  }

  return { name, email: email.trim(), password };
}

export function useDemoAuth() {
  const [user, setUser] = useState<DemoAuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseOrAlert();

    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getUser().then(async ({ data, error }) => {
      if (!mounted) return;

      if (error) {
        console.warn("Supabase getUser gaf geen actieve gebruiker.", error.message);
      }

      const mappedUser = mapSupabaseUser(data.user);
      if (mappedUser) {
        await ensureSupabaseProfile(mappedUser);
      }
      const profiledUser = await applySupabaseProfile(mappedUser);
      if (!mounted) return;
      setUser(profiledUser);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      const mappedUser = mapSupabaseUser(session?.user ?? null);
      setLoading(false);
      broadcastAuthChange();

      if (mappedUser) {
        ensureSupabaseProfile(mappedUser)
          .then(() => applySupabaseProfile(mappedUser))
          .then((profiledUser) => {
            if (mounted) setUser(profiledUser);
          })
          .catch((profileError) => {
            console.warn("DiBooks profile check mislukt.", profileError);
            if (mounted) setUser(mappedUser);
          });
      } else {
        setUser(null);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const permissions = useMemo(() => getAuthPermissions(user), [user]);

  async function loginWithCredentials(credentials: LoginCredentials): Promise<AuthActionResult> {
    const supabase = getSupabaseOrAlert();
    if (!supabase) return { ok: false, message: "Supabase is nog niet ingesteld." };

    const email = credentials.email.trim();
    if (!email || !credentials.password) {
      return { ok: false, message: "Vul je e-mailadres en wachtwoord in." };
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: credentials.password,
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    const mappedUser = mapSupabaseUser(data.user);
    let profiledUser = mappedUser;
    if (mappedUser) {
      const profileResult = await ensureSupabaseProfile(mappedUser);
      if (!profileResult.ok) return profileResult;
      profiledUser = await applySupabaseProfile(mappedUser);
    }

    setUser(profiledUser);
    broadcastAuthChange();
    return { ok: true };
  }

  async function registerWithCredentials(credentials: RegisterCredentials): Promise<AuthActionResult> {
    const supabase = getSupabaseOrAlert();
    if (!supabase) return { ok: false, message: "Supabase is nog niet ingesteld." };

    const name = credentials.name.trim() || "Auteur";
    const email = credentials.email.trim();

    if (!email || !credentials.password) {
      return { ok: false, message: "Vul je naam, e-mailadres en wachtwoord in." };
    }

    if (credentials.password.length < 6) {
      return { ok: false, message: "Gebruik een wachtwoord van minimaal 6 tekens." };
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
      return { ok: false, message: error.message };
    }

    if (data.user && !data.session) {
      return {
        ok: true,
        message: "Account aangemaakt. Check je e-mail om je account te bevestigen, of zet e-mailbevestiging tijdelijk uit in Supabase tijdens testen.",
      };
    }

    const mappedUser = mapSupabaseUser(data.user);
    let profiledUser = mappedUser;
    if (mappedUser) {
      const profileResult = await ensureSupabaseProfile(mappedUser);
      if (!profileResult.ok) return profileResult;
      profiledUser = await applySupabaseProfile(mappedUser);
    }

    setUser(profiledUser);
    broadcastAuthChange();
    return { ok: true, message: "Account aangemaakt en ingelogd." };
  }

  async function login() {
    const credentials = await promptForLogin();
    if (!credentials) return;

    const result = await loginWithCredentials(credentials);
    if (!result.ok) alert(`Login mislukt: ${result.message}`);
  }

  async function register() {
    const credentials = await promptForRegistration();
    if (!credentials) return;

    const result = await registerWithCredentials(credentials);
    if (!result.ok) alert(`Registreren mislukt: ${result.message}`);
    else if (result.message) alert(result.message);
  }

  async function logout() {
    const supabase = getSupabaseOrAlert();
    if (!supabase) return;

    const { error } = await supabase.auth.signOut();
    if (error) {
      alert(`Uitloggen mislukt: ${error.message}`);
      return;
    }

    setUser(null);
    broadcastAuthChange();
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
