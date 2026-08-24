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
      "Lees gratis DiBooks en probeer de Auteur Studio lokaal uit met maximaal 15 verhaalnodes.",
    features: [
      "Gratis DiBooks lezen",
      "Leesvoortgang en favorieten",
      "Auteur Studio proberen • max. 15 verhaalnodes",
      "Project lokaal opslaan en later weer laden",
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
      "Alles van Gratis plus toegang tot premiumboeken zodra abonnementen live gaan. De Studio-proefmodus blijft beschikbaar.",
    features: [
      "Alles van Gratis",
      "Premium DiBooks",
      "Studio proberen • max. 15 verhaalnodes",
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
      "Bouw zonder proeflimiet, bewaar projecten online en publiceer interactieve boeken via DiBooks.",
    features: [
      "Onbeperkt bouwen in Auteur Studio",
      "Dashboard-opslag en online concepten",
      "Publicatie- en reviewflow",
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
