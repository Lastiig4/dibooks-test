"use client";

import type { PublicSignupPlan } from "@/lib/auth";

export type PublicPlanDefinition = {
  id: PublicSignupPlan;
  name: string;
  eyebrow: string;
  priceLabel: string;
  description: string;
  features: string[];
  accent: "emerald" | "blue" | "violet";
  paid: boolean;
};

export const PUBLIC_PLANS: PublicPlanDefinition[] = [
  {
    id: "free",
    name: "Gratis",
    eyebrow: "Start met DiBooks",
    priceLabel: "€0",
    description:
      "Ontdek de Library, lees gratis boeken en bewaar je leesvoortgang en favorieten.",
    features: [
      "Gratis DiBooks lezen",
      "Leesvoortgang opslaan",
      "Favorieten en persoonlijke Library",
    ],
    accent: "emerald",
    paid: false,
  },
  {
    id: "reader_plus",
    name: "Reader",
    eyebrow: "Voor fanatieke lezers",
    priceLabel: "Prijs volgt",
    description:
      "Alles van Gratis plus toegang tot premiumboeken zodra abonnementen live gaan.",
    features: [
      "Alles van Gratis",
      "Premium DiBooks",
      "Toekomstige Reader Plus-functies",
    ],
    accent: "blue",
    paid: true,
  },
  {
    id: "author_pro",
    name: "Auteur",
    eyebrow: "Maak je eigen wereld",
    priceLabel: "Prijs volgt",
    description:
      "Bouw, test en publiceer interactieve boeken met de volledige DiBooks Auteur Studio.",
    features: [
      "Volledige Auteur Studio",
      "Dashboard en publicatieflow",
      "Reader-voordelen inbegrepen",
    ],
    accent: "violet",
    paid: true,
  },
];

export const DIBOOKS_OPEN_AUTH_EVENT = "dibooks-open-auth";

export type OpenAuthDetail = {
  mode: "login" | "register";
  plan?: PublicSignupPlan;
};

export function openDiBooksAuth(
  mode: OpenAuthDetail["mode"],
  plan: PublicSignupPlan = "free",
) {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<OpenAuthDetail>(DIBOOKS_OPEN_AUTH_EVENT, {
      detail: { mode, plan },
    }),
  );
}

export function getPublicPlan(planId: PublicSignupPlan) {
  return PUBLIC_PLANS.find((plan) => plan.id === planId) ?? PUBLIC_PLANS[0];
}
