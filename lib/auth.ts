"use client";

import { useEffect, useMemo, useState } from "react";

export type UserRole = "guest" | "author" | "admin";

export type DemoAuthUser = {
  id: string;
  name: string;
  email: string;
  role: Exclude<UserRole, "guest">;
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
};

export const DEMO_AUTH_STORAGE_KEY = "dibooks-demo-authenticated";
export const DEMO_USER_STORAGE_KEY = "dibooks-demo-user";
export const DIBOOKS_AUTH_CHANGED_EVENT = "dibooks-auth-changed";

const defaultAuthorUser: DemoAuthUser = {
  id: "demo-author-giovanni",
  name: "Giovanni",
  email: "giovanni@dibooks.local",
  role: "author",
};

function hasBrowserStorage() {
  return typeof window !== "undefined" && !!window.localStorage;
}

function broadcastAuthChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DIBOOKS_AUTH_CHANGED_EVENT));
}

export function getDemoAuthUser(): DemoAuthUser | null {
  if (!hasBrowserStorage()) return null;

  const legacyLogin = window.localStorage.getItem(DEMO_AUTH_STORAGE_KEY) === "true";
  const savedUser = window.localStorage.getItem(DEMO_USER_STORAGE_KEY);

  if (savedUser) {
    try {
      const parsedUser = JSON.parse(savedUser) as DemoAuthUser;
      if (parsedUser?.id && parsedUser?.role) return parsedUser;
    } catch (error) {
      console.error("Kon demo gebruiker niet laden.", error);
    }
  }

  return legacyLogin ? defaultAuthorUser : null;
}

export function getAuthPermissions(user: DemoAuthUser | null): AuthPermissions {
  const role: UserRole = user?.role ?? "guest";
  const isAuthor = role === "author" || role === "admin";
  const isAdmin = role === "admin";

  return {
    canReadLibrary: true,
    canUseEditor: true,
    canDownloadLocalFiles: true,
    canUseDashboard: isAuthor,
    canSaveToDashboard: isAuthor,
    canCreateBook: isAuthor,
    canEditConceptBook: isAuthor,
    canPublishBook: isAuthor,
    canRemoveFromLibrary: isAuthor,
    canManageUsers: isAdmin,
  };
}

export function demoLoginAsAuthor() {
  if (!hasBrowserStorage()) return;
  window.localStorage.setItem(DEMO_AUTH_STORAGE_KEY, "true");
  window.localStorage.setItem(DEMO_USER_STORAGE_KEY, JSON.stringify(defaultAuthorUser));
  broadcastAuthChange();
}

export function demoLogout() {
  if (!hasBrowserStorage()) return;
  window.localStorage.removeItem(DEMO_AUTH_STORAGE_KEY);
  window.localStorage.removeItem(DEMO_USER_STORAGE_KEY);
  broadcastAuthChange();
}

export function useDemoAuth() {
  const [user, setUser] = useState<DemoAuthUser | null>(null);

  useEffect(() => {
    const refreshAuth = () => setUser(getDemoAuthUser());

    refreshAuth();
    window.addEventListener("storage", refreshAuth);
    window.addEventListener(DIBOOKS_AUTH_CHANGED_EVENT, refreshAuth);

    return () => {
      window.removeEventListener("storage", refreshAuth);
      window.removeEventListener(DIBOOKS_AUTH_CHANGED_EVENT, refreshAuth);
    };
  }, []);

  const permissions = useMemo(() => getAuthPermissions(user), [user]);

  return {
    user,
    role: user?.role ?? "guest",
    isLoggedIn: !!user,
    permissions,
    login: demoLoginAsAuthor,
    logout: demoLogout,
  };
}
