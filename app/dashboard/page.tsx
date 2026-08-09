"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  getBookDetailPath,
  getBookReadPath,
  type BookStatus,
  type DiBook,
} from "@/lib/books";
import AuthModal from "@/components/AuthModal";
import {
  FREE_NODE_LIMIT,
  FULL_BOOK_NODE_BADGE_THRESHOLD,
  AUTHOR_PRO_MIN_COMPLETE_NODES_TO_PUBLISH,
  canAccessOwnedResource,
  getRoleLabel,
  getPlanLabel,
  isAuthorProUser,
  useDemoAuth,
} from "@/lib/auth";
import {
  deleteDashboardBookFromSupabase,
  fetchDashboardBooksFromSupabase,
  publishDashboardBookInSupabase,
  removeDashboardBookFromLibraryInSupabase,
  saveDashboardBookToSupabase,
  updateDashboardBookMediaInSupabase,
} from "@/lib/supabase/dashboardBooks";

type DashboardBook = DiBook & {
  source?: "library" | "dashboard";
  ownerId?: string;
  ownerName?: string;
  ownerEmail?: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
  removedFromLibraryAt?: string;
  projectData?: any;
  colorTheme?: string;
  accessType?: "free" | "premium";
};

type NewBookForm = {
  title: string;
  author: string;
  subtitle: string;
  description: string;
  genres: string[];
  genreInput: string;
  primaryGenre: string;
  status: BookStatus;
  ageRating: string;
  readTime: string;
  colorTheme: string;
  accessType: "free" | "premium";
};

const DASHBOARD_BOOKS_STORAGE_KEY = "dibooks-dashboard-books-v1";

const defaultForm: NewBookForm = {
  title: "",
  author: "Giovanni",
  subtitle: "",
  description: "",
  genres: ["Interactief"],
  genreInput: "",
  primaryGenre: "Interactief",
  status: "Concept",
  ageRating: "12+",
  readTime: "Concept",
  colorTheme: "blue",
  accessType: "free",
};

const ageRatings = ["AL", "6+", "9+", "12+", "16+", "18+"];
const suggestedGenres = [
  "Sci-fi",
  "Fantasy",
  "Mystery",
  "Thriller",
  "Romance",
  "Horror",
  "Avontuur",
  "Dystopie",
  "Interactief",
  "Keuzeverhaal",
  "Dossier",
  "Medieval",
];

const colorThemes: Record<
  string,
  { label: string; coverClass: string; accentClass: string; coverImage: string; bannerImage: string }
> = {
  blue: {
    label: "Blauw / sci-fi",
    coverClass: "from-blue-950 via-slate-950 to-purple-950",
    accentClass: "border-blue-500/60",
    coverImage: "/books/the-sovereign/cover.svg",
    bannerImage: "/books/the-sovereign/banner.svg",
  },
  gold: {
    label: "Goud / dossier",
    coverClass: "from-yellow-950 via-neutral-950 to-stone-900",
    accentClass: "border-yellow-400/40",
    coverImage: "/books/briars-logs/cover.svg",
    bannerImage: "/books/briars-logs/banner.svg",
  },
  red: {
    label: "Rood / fantasy",
    coverClass: "from-red-950 via-stone-950 to-yellow-950",
    accentClass: "border-red-400/40",
    coverImage: "/books/crown-of-ash/cover.svg",
    bannerImage: "/books/crown-of-ash/banner.svg",
  },
  green: {
    label: "Groen / mystery",
    coverClass: "from-cyan-950 via-neutral-950 to-emerald-950",
    accentClass: "border-cyan-400/40",
    coverImage: "/books/echoes-of-lumina/cover.svg",
    bannerImage: "/books/echoes-of-lumina/banner.svg",
  },
  orange: {
    label: "Oranje / thriller",
    coverClass: "from-orange-950 via-stone-950 to-red-950",
    accentClass: "border-orange-400/40",
    coverImage: "/books/the-dust-protocol/cover.svg",
    bannerImage: "/books/the-dust-protocol/banner.svg",
  },
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `boek-${Date.now()}`;
}


function stripValidationHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getProjectNodes(projectData: any) {
  return Array.isArray(projectData?.nodes) ? projectData.nodes : [];
}

function getProjectEdges(projectData: any) {
  return Array.isArray(projectData?.edges) ? projectData.edges : [];
}

function getNodeType(node: any) {
  return node?.data?.type ?? node?.type ?? "";
}

function getNodeTitle(node: any) {
  return node?.data?.label ?? node?.title ?? node?.id ?? "Onbekende node";
}

function getNodeText(node: any) {
  return (
    node?.data?.text ??
    stripValidationHtml(node?.data?.textHtml ?? "") ??
    node?.content?.text ??
    stripValidationHtml(node?.content?.textHtml ?? "") ??
    ""
  );
}

function getNodeVideoUrl(node: any) {
  return node?.data?.videoUrl ?? node?.content?.videoUrl ?? "";
}

function getNodeChoices(node: any) {
  const choices = node?.data?.choices ?? node?.content?.choices ?? [];
  return Array.isArray(choices) ? choices : [];
}

function getMiniGameTarget(node: any, route: "success" | "fail") {
  if (route === "success") {
    return node?.data?.miniGameSuccessTargetNodeId ?? node?.content?.miniGameSuccessTargetNodeId ?? "";
  }

  return node?.data?.miniGameFailTargetNodeId ?? node?.content?.miniGameFailTargetNodeId ?? "";
}

function isCompletePublishNode(node: any) {
  const nodeType = getNodeType(node);

  if (nodeType === "text" || nodeType === "special") {
    return getNodeText(node).trim().length > 0;
  }

  if (nodeType === "cutscene") {
    return getNodeVideoUrl(node).trim().length > 0;
  }

  if (nodeType === "choice") {
    return getNodeChoices(node)
      .slice(0, 3)
      .some((choice: any) => String(choice?.label ?? "").trim().length > 0 && String(choice?.targetNodeId ?? "").trim().length > 0);
  }

  if (nodeType === "minigame") {
    return Boolean(getMiniGameTarget(node, "success") && getMiniGameTarget(node, "fail"));
  }

  return false;
}

function getPublishNodeStats(projectData: any) {
  const nodes = getProjectNodes(projectData);
  const completeNodes = nodes.filter(isCompletePublishNode);

  return {
    totalNodes: nodes.length,
    completeNodes: completeNodes.length,
    isFullBook: nodes.length >= FULL_BOOK_NODE_BADGE_THRESHOLD,
  };
}

function validateBookBeforePublish(book: DashboardBook, user: ReturnType<typeof useDemoAuth>["user"]) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const projectData = book.projectData;

  if (!user) {
    errors.push("Je moet ingelogd zijn om te publiceren.");
  } else if (!isAuthorProUser(user)) {
    errors.push("Publiceren naar de publieke Library is alleen beschikbaar voor Author Pro accounts. Gratis en Reader Plus accounts kunnen wel lezen; gratis auteurs kunnen bouwen, testen en lokaal exporteren.");
  }

  if (!projectData) {
    return {
      valid: false,
      errors: ["Dit boek heeft nog geen projectdata. Open het boek in de Studio en sla het eerst op."],
      warnings,
    };
  }

  const nodes = getProjectNodes(projectData);
  const edges = getProjectEdges(projectData);
  const publishStats = getPublishNodeStats(projectData);
  const nodeIds = new Set(nodes.map((node: any) => node?.id).filter(Boolean));
  const startNodeId = projectData.startNodeId;
  const startNode = nodes.find((node: any) => node?.id === startNodeId);

  if (nodes.length === 0) {
    errors.push("Het boek heeft nog geen nodes. Maak minimaal één tekstnode in de Studio.");
  }

  if (publishStats.completeNodes < AUTHOR_PRO_MIN_COMPLETE_NODES_TO_PUBLISH) {
    errors.push(
      `Publiceren vereist minimaal ${AUTHOR_PRO_MIN_COMPLETE_NODES_TO_PUBLISH} complete nodes. Dit boek heeft nu ${publishStats.completeNodes} complete node(s).`,
    );
  }

  if (nodes.length < FULL_BOOK_NODE_BADGE_THRESHOLD) {
    warnings.push(
      `Dit boek heeft ${nodes.length} node(s). Vanaf ${FULL_BOOK_NODE_BADGE_THRESHOLD} nodes krijgt het later de status/badge 'volledig interactief boek'.`,
    );
  }

  if (!startNodeId) {
    errors.push("Start-node ontbreekt. Kies in de Studio welke node het begin van het boek is.");
  } else if (!startNode) {
    errors.push(`Start-node '${startNodeId}' bestaat niet meer. Kies opnieuw een start-node in de Studio.`);
  }

  const textNodes = nodes.filter((node: any) => {
    const type = getNodeType(node);
    return type === "text" || type === "special";
  });

  const filledTextNodes = textNodes.filter((node: any) => getNodeText(node).trim().length > 0);

  if (filledTextNodes.length === 0) {
    errors.push("Er is nog geen tekstinhoud. Vul minimaal één tekstnode of speciale pagina met tekst.");
  }

  textNodes.forEach((node: any) => {
    if (getNodeText(node).trim().length === 0) {
      errors.push(`Tekstnode '${getNodeTitle(node)}' is leeg.`);
    }
  });

  nodes.forEach((node: any) => {
    const nodeType = getNodeType(node);
    const title = getNodeTitle(node);

    if (nodeType === "cutscene" && !getNodeVideoUrl(node).trim()) {
      errors.push(`Cutscene '${title}' heeft nog geen video.`);
    }

    if (nodeType === "choice") {
      const choices = getNodeChoices(node).slice(0, 3);
      const filledChoices = choices.filter((choice: any) => String(choice?.label ?? "").trim().length > 0);

      if (filledChoices.length === 0) {
        errors.push(`Keuze-node '${title}' heeft nog geen ingevulde keuzes.`);
      }

      filledChoices.forEach((choice: any, index: number) => {
        const label = String(choice?.label ?? `Keuze ${index + 1}`).trim();
        const targetNodeId = String(choice?.targetNodeId ?? "").trim();

        if (!targetNodeId) {
          errors.push(`Keuze-node '${title}' heeft keuze '${label}' zonder doel-node.`);
        } else if (!nodeIds.has(targetNodeId)) {
          errors.push(`Keuze-node '${title}' verwijst met keuze '${label}' naar een node die niet bestaat.`);
        }
      });
    }

    if (nodeType === "minigame") {
      const successTarget = String(getMiniGameTarget(node, "success") ?? "").trim();
      const failTarget = String(getMiniGameTarget(node, "fail") ?? "").trim();

      if (!successTarget) {
        errors.push(`Mini game '${title}' mist een success-route.`);
      } else if (!nodeIds.has(successTarget)) {
        errors.push(`Mini game '${title}' heeft een success-route naar een node die niet bestaat.`);
      }

      if (!failTarget) {
        errors.push(`Mini game '${title}' mist een fail-route.`);
      } else if (!nodeIds.has(failTarget)) {
        errors.push(`Mini game '${title}' heeft een fail-route naar een node die niet bestaat.`);
      }
    }
  });

  edges.forEach((edge: any) => {
    if (!nodeIds.has(edge?.source)) {
      errors.push(`Een path heeft een ontbrekende bron-node: ${edge?.source ?? "onbekend"}.`);
    }

    if (!nodeIds.has(edge?.target)) {
      errors.push(`Een path verwijst naar een ontbrekende doel-node: ${edge?.target ?? "onbekend"}.`);
    }
  });

  if (startNode && nodes.length > 1) {
    const reachable = new Set<string>();
    const queue = [startNode.id];

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId || reachable.has(currentId)) continue;

      reachable.add(currentId);
      edges
        .filter((edge: any) => edge?.source === currentId && nodeIds.has(edge?.target))
        .forEach((edge: any) => queue.push(edge.target));

      const currentNode = nodes.find((node: any) => node?.id === currentId);
      if (getNodeType(currentNode) === "choice") {
        getNodeChoices(currentNode).forEach((choice: any) => {
          if (choice?.targetNodeId && nodeIds.has(choice.targetNodeId)) queue.push(choice.targetNodeId);
        });
      }

      if (getNodeType(currentNode) === "minigame") {
        const successTarget = getMiniGameTarget(currentNode, "success");
        const failTarget = getMiniGameTarget(currentNode, "fail");
        if (successTarget && nodeIds.has(successTarget)) queue.push(successTarget);
        if (failTarget && nodeIds.has(failTarget)) queue.push(failTarget);
      }
    }

    const unreachableNodes = nodes.filter((node: any) => node?.id && !reachable.has(node.id));
    if (unreachableNodes.length > 0) {
      warnings.push(
        `Let op: ${unreachableNodes.length} node(s) zijn niet bereikbaar vanaf de start-node: ${unreachableNodes
          .slice(0, 4)
          .map((node: any) => `'${getNodeTitle(node)}'`)
          .join(", ")}${unreachableNodes.length > 4 ? ", ..." : ""}.`,
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function formatPublishValidationMessage(result: ReturnType<typeof validateBookBeforePublish>) {
  const lines = ["Kan nog niet publiceren:", ""];

  result.errors.forEach((error, index) => {
    lines.push(`${index + 1}. ${error}`);
  });

  if (result.warnings.length > 0) {
    lines.push("", "Let ook op:");
    result.warnings.forEach((warning, index) => {
      lines.push(`${index + 1}. ${warning}`);
    });
  }

  lines.push("", "Open het boek in de Studio, los dit op en sla daarna opnieuw op in je Dashboard.");

  return lines.join("\n");
}

function DiBooksLogo() {
  return (
    <Link href="/" className="group flex items-end leading-none" aria-label="Terug naar DiBooks Library">
      <span className="text-4xl font-black tracking-tight text-white transition group-hover:text-blue-200 sm:text-5xl">
        DI
      </span>
      <span
        className="ml-1 text-4xl italic text-white transition group-hover:text-blue-200 sm:text-5xl"
        style={{ fontFamily: "Georgia, Times New Roman, serif" }}
      >
        Books
      </span>
    </Link>
  );
}

function statusClass(book: DashboardBook) {
  if (book.published) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (book.status === "Concept") return "border-yellow-500/40 bg-yellow-500/10 text-yellow-200";
  if (book.status === "Binnenkort") return "border-purple-500/40 bg-purple-500/10 text-purple-200";
  return "border-blue-500/40 bg-blue-500/10 text-blue-200";
}

type MediaSavePayload = {
  coverImage: string;
  bannerImage: string;
  coverClass: string;
  accentClass: string;
  colorTheme: string;
};

function BookMediaPreview({ book }: { book: DashboardBook }) {
  return (
    <div className={`relative h-40 overflow-hidden rounded-t-3xl bg-gradient-to-br ${book.coverClass || "from-blue-950 via-slate-950 to-purple-950"}`}>
      {book.bannerImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={book.bannerImage}
          alt={`Banner van ${book.title}`}
          className="absolute inset-0 h-full w-full object-cover opacity-85"
        />
      )}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,0.18),transparent_28%),linear-gradient(180deg,rgba(0,0,0,0.15),rgba(0,0,0,0.86))]" />
      <div className="absolute bottom-4 left-4 right-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-widest ${statusClass(book)}`}>
            {book.published ? "Live / vergrendeld" : book.status}
          </span>
          <span className="rounded-full bg-black/55 px-3 py-1 text-xs font-black uppercase tracking-widest text-white/85">
            {book.primaryGenre}
          </span>
        </div>
        <h2 className="line-clamp-1 text-3xl font-black text-white drop-shadow-lg">{book.title}</h2>
      </div>
    </div>
  );
}

function BookDashboardCard({
  book,
  onPublish,
  onRemoveFromLibrary,
  onDeleteDraft,
  onOpenMedia,
  onOpenDetails,
  canPublish,
}: {
  book: DashboardBook;
  onPublish: (bookId: string) => void;
  canPublish: boolean;
  onRemoveFromLibrary: (bookId: string) => void;
  onDeleteDraft: (bookId: string) => void;
  onOpenMedia: (book: DashboardBook) => void;
  onOpenDetails: (book: DashboardBook) => void;
}) {
  const isPublished = !!book.published;
  const canEdit = !isPublished;
  const isDashboardBook = book.source === "dashboard";
  const canShowBookPage = book.source !== "dashboard" || book.published || book.status === "Binnenkort";
  const detailHref = book.source === "dashboard" ? `/books/${book.id}` : getBookDetailPath(book);
  const readHref = book.source === "dashboard" ? "" : getBookReadPath(book);

  return (
    <article className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] shadow-2xl">
      <BookMediaPreview book={book} />

      <div className="grid gap-5 p-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-300">{book.author}</p>
          <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-neutral-300">{book.subtitle}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Status</p>
            <p className="mt-1 font-black text-white">{isPublished ? "Live" : book.status}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Bewerken</p>
            <p className="mt-1 font-black text-white">{canEdit ? "Open" : "Locked"}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Toegang</p>
            <p className="mt-1 font-black text-white">{book.accessType === "premium" ? "Premium" : "Gratis"}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Media</p>
            <p className="mt-1 font-black text-white">{book.coverImage || book.bannerImage ? "Eigen" : "Template"}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Leestijd</p>
            <p className="mt-1 font-black text-white">{book.readTime ?? "-"}</p>
          </div>
        </div>

        {book.projectData && (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs font-bold text-neutral-300">
            Project: {getPublishNodeStats(book.projectData).totalNodes} nodes • {getPublishNodeStats(book.projectData).completeNodes} compleet
            {getPublishNodeStats(book.projectData).isFullBook ? " • Volledig interactief" : ""}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {book.genres.map((genre) => (
            <span key={genre} className="rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-neutral-200">
              {genre}
            </span>
          ))}
        </div>

        {isPublished ? (
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100">
            <strong>Live in de Library = vergrendeld.</strong> Media aanpassen is daarom ook vergrendeld. Haal het boek eerst uit de Library als je cover of banner wilt wijzigen.
          </div>
        ) : (
          <div className="rounded-2xl border border-yellow-500/25 bg-yellow-500/10 p-4 text-sm leading-6 text-yellow-100">
            <strong>Concept / testfase.</strong> Je mag tekst, routes, cover en banner vrij aanpassen totdat je publiceert.
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {canEdit ? (
            <Link href={`/editor?book=${book.id}`} className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-500">
              Bewerk in Studio
            </Link>
          ) : (
            <button disabled className="cursor-not-allowed rounded-2xl bg-neutral-800 px-5 py-3 text-sm font-black text-neutral-500">
              Bewerken vergrendeld
            </button>
          )}

          {canEdit && isDashboardBook && (
            <button
              onClick={() => onOpenMedia(book)}
              className="rounded-2xl border border-cyan-400/35 bg-cyan-500/10 px-5 py-3 text-sm font-black text-cyan-100 hover:bg-cyan-500/20"
              title="Cover en banner aanpassen"
            >
              Cover & banner
            </button>
          )}

          {canEdit && isDashboardBook && (
            <button
              onClick={() => onOpenDetails(book)}
              className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-black text-white hover:bg-white/10"
              title="Titel, status, genres en toegang aanpassen"
            >
              Boekgegevens
            </button>
          )}


          {canShowBookPage ? (
            <Link href={detailHref} className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-black text-white hover:bg-white/10">
              Boekpagina
            </Link>
          ) : (
            <button disabled className="cursor-not-allowed rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-black text-neutral-500">
              Boekpagina later
            </button>
          )}

          {book.storyFile && readHref && (
            <Link href={readHref} className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-black text-white hover:bg-white/10">
              Preview lezen
            </Link>
          )}

          {canEdit && isDashboardBook && (
            <button
              onClick={() => onPublish(book.id)}
              className={`rounded-2xl border px-5 py-3 text-sm font-black ${
                canPublish
                  ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25"
                  : "border-neutral-600/50 bg-neutral-800/60 text-neutral-400 hover:bg-neutral-800"
              }`}
              title={canPublish ? "Publiceer naar Library" : "Alleen Author Pro accounts kunnen publiceren"}
            >
              {canPublish ? "Publiceer naar Library" : "Author Pro nodig"}
            </button>
          )}

          {canEdit && isDashboardBook && (
            <button onClick={() => onDeleteDraft(book.id)} className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-3 text-sm font-black text-red-100 hover:bg-red-500/20">
              Verwijder concept
            </button>
          )}

          {isPublished && isDashboardBook && (
            <button onClick={() => onRemoveFromLibrary(book.id)} className="rounded-2xl border border-red-500/35 bg-red-500/15 px-5 py-3 text-sm font-black text-red-100 hover:bg-red-500/25">
              Verwijder uit Library
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

type CropDraft = {
  source: string;
  fileName: string;
  zoom: number;
  x: number;
  y: number;
};

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Afbeelding kon niet worden gelezen."));
    reader.readAsDataURL(file);
  });
}

function cropImageToDataUrl(
  source: string,
  outputWidth: number,
  outputHeight: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
) {
  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Canvas kon niet worden gemaakt."));
        return;
      }

      const canvasRatio = outputWidth / outputHeight;
      const imageRatio = image.width / image.height;
      const baseWidth = imageRatio > canvasRatio ? outputHeight * imageRatio : outputWidth;
      const baseHeight = imageRatio > canvasRatio ? outputHeight : outputWidth / imageRatio;
      const drawWidth = baseWidth * zoom;
      const drawHeight = baseHeight * zoom;
      const maxShiftX = Math.max(0, (drawWidth - outputWidth) / 2);
      const maxShiftY = Math.max(0, (drawHeight - outputHeight) / 2);
      const drawX = (outputWidth - drawWidth) / 2 + (offsetX / 100) * maxShiftX;
      const drawY = (outputHeight - drawHeight) / 2 + (offsetY / 100) * maxShiftY;

      context.fillStyle = "#05070d";
      context.fillRect(0, 0, outputWidth, outputHeight);
      context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      resolve(canvas.toDataURL("image/jpeg", 0.86));
    };
    image.onerror = () => reject(new Error("Afbeelding kon niet worden geladen."));
    image.src = source;
  });
}

function CropPreview({
  title,
  draft,
  ratioClass,
  onDraftChange,
}: {
  title: string;
  draft: CropDraft | null;
  ratioClass: string;
  onDraftChange: (draft: CropDraft) => void;
}) {
  if (!draft) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-white">{title}</p>
          <p className="text-xs font-bold text-neutral-500">{draft.fileName}</p>
        </div>
        <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs font-black text-cyan-200">Crop preview</span>
      </div>
      <div className={`relative overflow-hidden rounded-2xl border border-white/10 bg-neutral-950 ${ratioClass}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={draft.source}
          alt={title}
          className="absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 object-cover"
          style={{
            transform: `translate(-50%, -50%) scale(${draft.zoom}) translate(${draft.x / 5}%, ${draft.y / 5}%)`,
          }}
        />
        <div className="absolute inset-0 ring-1 ring-inset ring-white/20" />
      </div>
      <div className="mt-4 grid gap-3">
        <label className="text-xs font-black uppercase tracking-widest text-neutral-400">
          Zoom
          <input
            type="range"
            min="1"
            max="2.5"
            step="0.05"
            value={draft.zoom}
            onChange={(event) => onDraftChange({ ...draft, zoom: Number(event.target.value) })}
            className="mt-2 w-full accent-cyan-400"
          />
        </label>
        <label className="text-xs font-black uppercase tracking-widest text-neutral-400">
          Horizontaal snijden
          <input
            type="range"
            min="-100"
            max="100"
            step="1"
            value={draft.x}
            onChange={(event) => onDraftChange({ ...draft, x: Number(event.target.value) })}
            className="mt-2 w-full accent-cyan-400"
          />
        </label>
        <label className="text-xs font-black uppercase tracking-widest text-neutral-400">
          Verticaal snijden
          <input
            type="range"
            min="-100"
            max="100"
            step="1"
            value={draft.y}
            onChange={(event) => onDraftChange({ ...draft, y: Number(event.target.value) })}
            className="mt-2 w-full accent-cyan-400"
          />
        </label>
      </div>
    </div>
  );
}

function MediaManagerModal({
  book,
  onClose,
  onSave,
}: {
  book: DashboardBook;
  onClose: () => void;
  onSave: (payload: MediaSavePayload) => Promise<void>;
}) {
  const [selectedTheme, setSelectedTheme] = useState(book.colorTheme || "blue");
  const [coverDraft, setCoverDraft] = useState<CropDraft | null>(null);
  const [bannerDraft, setBannerDraft] = useState<CropDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const activeTheme = colorThemes[selectedTheme] ?? colorThemes.blue;

  async function handleFile(file: File | undefined, type: "cover" | "banner") {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      alert("Kies een afbeelding, bijvoorbeeld .jpg, .png of .webp.");
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      alert("Deze afbeelding is groter dan 8MB. Gebruik liever een kleinere afbeelding.");
      return;
    }

    const source = await readFileAsDataUrl(file);
    const nextDraft: CropDraft = { source, fileName: file.name, zoom: 1, x: 0, y: 0 };
    if (type === "cover") setCoverDraft(nextDraft);
    if (type === "banner") setBannerDraft(nextDraft);
  }

  async function saveStandardTemplate() {
    setSaving(true);
    try {
      await onSave({
        coverImage: "",
        bannerImage: "",
        coverClass: activeTheme.coverClass,
        accentClass: activeTheme.accentClass,
        colorTheme: selectedTheme,
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveCustomMedia() {
    setSaving(true);
    try {
      const coverImage = coverDraft
        ? await cropImageToDataUrl(coverDraft.source, 900, 1350, coverDraft.zoom, coverDraft.x, coverDraft.y)
        : book.coverImage || "";
      const bannerImage = bannerDraft
        ? await cropImageToDataUrl(bannerDraft.source, 1800, 675, bannerDraft.zoom, bannerDraft.x, bannerDraft.y)
        : book.bannerImage || "";

      await onSave({
        coverImage,
        bannerImage,
        coverClass: activeTheme.coverClass,
        accentClass: activeTheme.accentClass,
        colorTheme: selectedTheme,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-4 backdrop-blur-sm sm:p-6">
      <div className="mx-auto max-w-6xl rounded-3xl border border-white/10 bg-[#080b13] p-5 shadow-2xl sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.32em] text-cyan-300">Book Media Manager</p>
            <h2 className="mt-2 text-3xl font-black sm:text-5xl">Cover & banner</h2>
            <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-neutral-400">
              Gebruik een standaard DiBooks-template of upload eigen beeld. De crop-tool snijdt automatisch naar vaste verhoudingen: cover 2:3 en banner breed.
            </p>
          </div>
          <button onClick={onClose} className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white hover:bg-red-500">
            Sluiten
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="grid gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <h3 className="text-lg font-black">Standaard DiBooks banners</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-neutral-400">
                Kies een standaard stijl. Dit is licht, strak en geeft geen dubbele tekst-overlays.
              </p>
              <div className="mt-4 grid gap-2">
                {Object.entries(colorThemes).map(([value, theme]) => (
                  <button
                    key={value}
                    onClick={() => setSelectedTheme(value)}
                    className={`rounded-2xl border p-3 text-left text-sm font-black transition ${
                      selectedTheme === value
                        ? "border-cyan-300 bg-cyan-500/15 text-cyan-100"
                        : "border-white/10 bg-black/25 text-neutral-300 hover:bg-white/10"
                    }`}
                  >
                    <span className={`mr-3 inline-block h-5 w-10 rounded-full bg-gradient-to-r ${theme.coverClass}`} />
                    {theme.label}
                  </button>
                ))}
              </div>
              <button
                onClick={saveStandardTemplate}
                disabled={saving}
                className="mt-4 w-full rounded-2xl bg-white px-5 py-3 text-sm font-black text-black hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Gebruik standaard template
              </button>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <h3 className="text-lg font-black">Eigen beeld uploaden</h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-neutral-400">
                Cover is voor boekkaarten. Banner is voor brede hero/detailweergave.
              </p>
              <div className="mt-4 grid gap-3">
                <label className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm font-black text-white hover:bg-white/10">
                  Upload coverbeeld
                  <input type="file" accept="image/*" onChange={(event) => void handleFile(event.target.files?.[0], "cover")} className="mt-3 block w-full text-xs text-neutral-400 file:mr-3 file:rounded-xl file:border-0 file:bg-cyan-600 file:px-3 file:py-2 file:font-black file:text-white" />
                </label>
                <label className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm font-black text-white hover:bg-white/10">
                  Upload bannerbeeld
                  <input type="file" accept="image/*" onChange={(event) => void handleFile(event.target.files?.[0], "banner")} className="mt-3 block w-full text-xs text-neutral-400 file:mr-3 file:rounded-xl file:border-0 file:bg-cyan-600 file:px-3 file:py-2 file:font-black file:text-white" />
                </label>
              </div>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <h3 className="text-lg font-black">Preview standaard stijl</h3>
              <div className={`mt-3 overflow-hidden rounded-2xl border ${activeTheme.accentClass} bg-gradient-to-br ${activeTheme.coverClass} p-5`}>
                <div className="h-48 rounded-2xl bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.18),transparent_34%),linear-gradient(180deg,rgba(0,0,0,0.1),rgba(0,0,0,0.78))] p-5">
                  <div className="inline-flex rounded-full bg-black/45 px-3 py-1 text-xs font-black uppercase tracking-widest text-white/90">{book.primaryGenre}</div>
                  <h3 className="mt-20 line-clamp-2 text-4xl font-black leading-none text-white">{book.title}</h3>
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <CropPreview title="Cover 2:3" draft={coverDraft} ratioClass="aspect-[2/3]" onDraftChange={setCoverDraft} />
              <CropPreview title="Banner breed" draft={bannerDraft} ratioClass="aspect-[8/3]" onDraftChange={setBannerDraft} />
            </div>

            <div className="rounded-2xl border border-cyan-500/25 bg-cyan-500/10 p-4 text-sm leading-6 text-cyan-100">
              <strong>Tip:</strong> gebruik bij banners liever sfeerbeeld zonder titeltekst. DiBooks zet titel en knoppen er zelf netjes overheen.
            </div>

            <div className="flex flex-wrap justify-end gap-3">
              <button onClick={onClose} className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-black text-white hover:bg-white/10">
                Annuleren
              </button>
              <button
                onClick={saveCustomMedia}
                disabled={saving || (!coverDraft && !bannerDraft)}
                className="rounded-2xl bg-cyan-600 px-5 py-3 text-sm font-black text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
              >
                {saving ? "Opslaan..." : "Eigen cover/banner opslaan"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function NewBookModal({
  form,
  setForm,
  onClose,
  onSave,
  mode = "new",
}: {
  form: NewBookForm;
  setForm: React.Dispatch<React.SetStateAction<NewBookForm>>;
  onClose: () => void;
  onSave: () => void;
  mode?: "new" | "edit";
}) {
  function updateField<K extends keyof NewBookForm>(key: K, value: NewBookForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function addGenre(genre: string) {
    const cleanGenre = genre.trim();
    if (!cleanGenre) return;

    setForm((current) => {
      if (current.genres.includes(cleanGenre)) {
        return { ...current, genreInput: "" };
      }

      const nextGenres = [...current.genres, cleanGenre];
      return {
        ...current,
        genres: nextGenres,
        primaryGenre: current.primaryGenre || cleanGenre,
        genreInput: "",
      };
    });
  }

  function removeGenre(genre: string) {
    setForm((current) => {
      const nextGenres = current.genres.filter((item) => item !== genre);
      return {
        ...current,
        genres: nextGenres,
        primaryGenre: current.primaryGenre === genre ? nextGenres[0] ?? "" : current.primaryGenre,
      };
    });
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-4 backdrop-blur-sm sm:p-6">
      <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-[#080b13] p-5 shadow-2xl sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.32em] text-blue-300">{mode === "edit" ? "Boekgegevens" : "Nieuw boek"}</p>
            <h2 className="mt-2 text-3xl font-black sm:text-5xl">{mode === "edit" ? "Boekgegevens aanpassen" : "Boek opslaan in dashboard"}</h2>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-neutral-400">
              {mode === "edit"
                ? "Pas metadata, status en toegang aan. Concept is alleen voor jou zichtbaar; Binnenkort verschijnt op de openbare Binnenkort-plank; publiceren blijft een aparte stap."
                : "Dit maakt nu alvast een dashboard-concept aan. Concept is alleen voor jou zichtbaar; Binnenkort kan alvast als aankondiging in de Library verschijnen."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white hover:bg-red-500"
          >
            Sluiten
          </button>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="grid gap-4">
            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Titel</label>
              <input
                value={form.title}
                onChange={(event) => updateField("title", event.target.value)}
                placeholder="Bijv. The Sovereign"
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-blue-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Auteur</label>
              <input
                value={form.author}
                onChange={(event) => updateField("author", event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-blue-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Korte ondertitel</label>
              <input
                value={form.subtitle}
                onChange={(event) => updateField("subtitle", event.target.value)}
                placeholder="Een zin die op de boekkaart komt."
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-blue-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Beschrijving</label>
              <textarea
                value={form.description}
                onChange={(event) => updateField("description", event.target.value)}
                placeholder="Korte omschrijving voor de boekpagina."
                className="h-32 w-full resize-none rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold leading-6 text-white outline-none focus:border-blue-400"
              />
            </div>
          </div>

          <div className="grid gap-4">
            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Genre labels</label>
              <div className="flex gap-2">
                <input
                  value={form.genreInput}
                  onChange={(event) => updateField("genreInput", event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addGenre(form.genreInput);
                    }
                  }}
                  placeholder="Bijv. Sci-fi"
                  className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-blue-400"
                />
                <button
                  onClick={() => addGenre(form.genreInput)}
                  className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-500"
                >
                  Voeg toe
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {form.genres.map((genre) => (
                  <button
                    key={genre}
                    onClick={() => removeGenre(genre)}
                    className="rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-white hover:bg-red-600"
                    title="Klik om te verwijderen"
                  >
                    {genre} ×
                  </button>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {suggestedGenres.map((genre) => (
                  <button
                    key={genre}
                    onClick={() => addGenre(genre)}
                    className="rounded-full border border-white/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-neutral-300 hover:bg-white/10"
                  >
                    + {genre}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Hoofdgenre</label>
              <select
                value={form.primaryGenre}
                onChange={(event) => updateField("primaryGenre", event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-blue-400"
              >
                {form.genres.length === 0 && <option value="">Voeg eerst genre labels toe</option>}
                {form.genres.map((genre) => (
                  <option key={genre} value={genre}>{genre}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-2 block text-sm font-black text-neutral-300">Leeftijd</label>
                <select
                  value={form.ageRating}
                  onChange={(event) => updateField("ageRating", event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-blue-400"
                >
                  {ageRatings.map((rating) => (
                    <option key={rating} value={rating}>{rating}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-black text-neutral-300">Status</label>
                <select
                  value={form.status}
                  onChange={(event) => updateField("status", event.target.value as BookStatus)}
                  className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-blue-400"
                >
                  <option value="Concept">Concept</option>
                  <option value="Testversie">Testversie</option>
                  <option value="Binnenkort">Binnenkort</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Toegang</label>
              <select
                value={form.accessType}
                onChange={(event) => updateField("accessType", event.target.value as "free" | "premium")}
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-blue-400"
              >
                <option value="free">Gratis leesbaar</option>
                <option value="premium">Premium / abonnement</option>
              </select>
              <p className="mt-2 text-xs font-semibold leading-5 text-neutral-500">Premium boeken zijn later alleen leesbaar voor Reader Plus, Author Pro of Admin.</p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Leestijd</label>
              <input
                value={form.readTime}
                onChange={(event) => updateField("readTime", event.target.value)}
                placeholder="Bijv. ± 30 min testversie"
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-blue-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Coverstijl</label>
              <select
                value={form.colorTheme}
                onChange={(event) => updateField("colorTheme", event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-blue-400"
              >
                {Object.entries(colorThemes).map(([value, theme]) => (
                  <option key={value} value={value}>{theme.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-blue-500/25 bg-blue-500/10 p-4 text-sm leading-6 text-blue-100">
          {mode === "edit" ? <><strong>Concept</strong> = alleen zichtbaar voor jou. <strong>Binnenkort</strong> = zichtbaar in de Library als aankondiging, maar nog niet leesbaar.</> : <>Later wordt dit: <strong>Nieuw boek → metadata invullen → boek verschijnt in dashboard → openen in Studio → opslaan als concept → publiceren naar Library.</strong></>}
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-black text-white hover:bg-white/10"
          >
            Annuleren
          </button>
          <button
            onClick={onSave}
            className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-black hover:bg-neutral-200"
          >
            {mode === "edit" ? "Wijzigingen opslaan" : "Opslaan in dashboard"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { permissions, loginWithCredentials, registerWithCredentials, logout, user, role } = useDemoAuth();
  const [authModalMode, setAuthModalMode] = useState<"login" | "register" | null>(null);
  const [draftDashboardBooks, setDraftDashboardBooks] = useState<DashboardBook[]>([]);
  const [newBookOpen, setNewBookOpen] = useState(false);
  const [mediaBook, setMediaBook] = useState<DashboardBook | null>(null);
  const [detailsBook, setDetailsBook] = useState<DashboardBook | null>(null);
  const [detailsForm, setDetailsForm] = useState<NewBookForm>(defaultForm);
  const [form, setForm] = useState<NewBookForm>(defaultForm);

  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  async function refreshDashboardBooks() {
    if (!user) {
      setDraftDashboardBooks([]);
      return;
    }

    setDashboardLoading(true);
    setDashboardError(null);

    try {
      const supabaseBooks = await fetchDashboardBooksFromSupabase(user);
      setDraftDashboardBooks(supabaseBooks as DashboardBook[]);
    } catch (error) {
      console.error("Kon dashboard boeken niet laden uit Supabase", error);
      setDashboardError(
        error instanceof Error ? error.message : "Kon dashboard boeken niet laden uit Supabase.",
      );
    } finally {
      setDashboardLoading(false);
    }
  }

  useEffect(() => {
    void refreshDashboardBooks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const visibleDashboardBooks = useMemo<DashboardBook[]>(() => {
    if (!user) return [];

    // "Mijn boeken" moet echt alleen de boeken van deze auteur tonen.
    // Admin krijgt later een aparte beheerpagina; anders ziet admin oude/testboeken tussen eigen boeken.
    return draftDashboardBooks.filter((book) => book.ownerId === user.id);
  }, [draftDashboardBooks, user]);

  const allBooks = useMemo<DashboardBook[]>(() => {
    return [...visibleDashboardBooks];
  }, [visibleDashboardBooks]);

  const liveBooks = allBooks.filter((book) => book.published);
  const draftBooks = allBooks.filter((book) => !book.published);

  async function saveNewBook() {
    if (!user) {
      setAuthModalMode("login");
      return;
    }

    const title = form.title.trim();
    if (!title) {
      alert("Geef je boek eerst een titel.");
      return;
    }

    if (form.genres.length === 0) {
      alert("Voeg minimaal één genre label toe.");
      return;
    }

    const theme = colorThemes[form.colorTheme] ?? colorThemes.blue;

    try {
      const savedBook = await saveDashboardBookToSupabase(user, {
        title,
        author: form.author.trim() || user.name || "Onbekende auteur",
        subtitle: form.subtitle.trim() || "Nieuw interactief boek in concept.",
        description: form.description.trim() || "Nog geen beschrijving ingevuld.",
        genres: form.genres,
        primaryGenre: form.primaryGenre || form.genres[0],
        status: form.status,
        ageRating: form.ageRating,
        readTime: form.readTime.trim() || "Concept",
        coverImage: "",
        bannerImage: "",
        coverClass: theme.coverClass,
        accentClass: theme.accentClass,
        colorTheme: form.colorTheme,
        accessType: form.accessType,
        published: false,
        featured: false,
        mostRead: false,
        projectData: {
          version: 1,
          type: "dibooks-project",
          bookTitle: title,
          startNodeId: "node_1",
          nodes: [],
          edges: [],
          savedAt: new Date().toISOString(),
        },
      });

      setDraftDashboardBooks((currentBooks) => [
        savedBook as DashboardBook,
        ...currentBooks.filter((book) => book.id !== savedBook.id),
      ]);
      setForm(defaultForm);
      setNewBookOpen(false);
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error
          ? `Opslaan in Supabase mislukt: ${error.message}`
          : "Opslaan in Supabase mislukt.",
      );
    }
  }





  function openBookDetails(book: DashboardBook) {
    if (book.published) {
      alert("Live boeken zijn vergrendeld. Haal het boek eerst uit de Library als je metadata wilt wijzigen.");
      return;
    }

    setDetailsBook(book);
    setDetailsForm({
      title: book.title ?? "",
      author: book.author ?? user?.name ?? "Giovanni",
      subtitle: book.subtitle ?? "",
      description: book.description ?? "",
      genres: Array.isArray(book.genres) && book.genres.length > 0 ? book.genres : ["Interactief"],
      genreInput: "",
      primaryGenre: book.primaryGenre ?? book.genres?.[0] ?? "Interactief",
      status: (book.status as BookStatus) ?? "Concept",
      ageRating: book.ageRating ?? "12+",
      readTime: book.readTime ?? "Concept",
      colorTheme: book.colorTheme ?? "blue",
      accessType: book.accessType ?? "free",
    });
  }

  async function saveBookDetails() {
    if (!user || !detailsBook) return;

    const title = detailsForm.title.trim();
    if (!title) {
      alert("Geef je boek eerst een titel.");
      return;
    }

    if (detailsForm.genres.length === 0) {
      alert("Voeg minimaal één genre label toe.");
      return;
    }

    const theme = colorThemes[detailsForm.colorTheme] ?? colorThemes.blue;

    try {
      const savedBook = await saveDashboardBookToSupabase(user, {
        id: detailsBook.id,
        title,
        author: detailsForm.author.trim() || user.name || "Onbekende auteur",
        subtitle: detailsForm.subtitle.trim() || "Nieuw interactief boek in concept.",
        description: detailsForm.description.trim() || "Nog geen beschrijving ingevuld.",
        genres: detailsForm.genres,
        primaryGenre: detailsForm.primaryGenre || detailsForm.genres[0],
        status: detailsForm.status,
        ageRating: detailsForm.ageRating,
        readTime: detailsForm.readTime.trim() || "Concept",
        coverImage: detailsBook.coverImage ?? "",
        bannerImage: detailsBook.bannerImage ?? "",
        coverClass: detailsBook.coverClass || theme.coverClass,
        accentClass: detailsBook.accentClass || theme.accentClass,
        colorTheme: detailsForm.colorTheme,
        accessType: detailsForm.accessType,
        published: false,
        featured: detailsBook.featured ?? false,
        mostRead: detailsBook.mostRead ?? false,
        projectData: detailsBook.projectData,
      });

      setDraftDashboardBooks((currentBooks) =>
        currentBooks.map((book) => (book.id === savedBook.id ? (savedBook as DashboardBook) : book)),
      );
      setDetailsBook(null);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? `Boekgegevens opslaan mislukt: ${error.message}` : "Boekgegevens opslaan mislukt.");
    }
  }

  async function publishBookToLibrary(bookId: string) {
    const targetBook = draftDashboardBooks.find((book) => book.id === bookId);
    if (!targetBook) return;
    if (!canAccessOwnedResource(user, targetBook.ownerId)) {
      alert("Je kunt alleen je eigen dashboardboeken beheren.");
      return;
    }

    if (!permissions.canPublishBook) {
      alert("Publiceren is alleen beschikbaar voor Author Pro accounts. Gratis en Reader Plus accounts kunnen wel lezen; gratis auteurs kunnen bouwen, testen en lokaal exporteren.");
      return;
    }

    const validationResult = validateBookBeforePublish(targetBook, user);
    if (!validationResult.valid) {
      alert(formatPublishValidationMessage(validationResult));
      return;
    }

    const warningText = validationResult.warnings.length > 0
      ? `\n\nLet op:\n${validationResult.warnings.map((warning) => `- ${warning}`).join("\n")}`
      : "";

    const confirmed = window.confirm(
      `Weet je zeker dat je "${targetBook.title}" naar de Library wilt publiceren?\n\nNa publicatie wordt dit boek vergrendeld. Je kunt het dan niet meer aanpassen zolang het live staat.${warningText}`,
    );

    if (!confirmed) return;

    try {
      await publishDashboardBookInSupabase(bookId);
      await refreshDashboardBooks();
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? `Publiceren mislukt: ${error.message}` : "Publiceren mislukt.");
    }
  }

  async function removeBookFromLibrary(bookId: string) {
    const targetBook = draftDashboardBooks.find((book) => book.id === bookId);
    if (!targetBook) return;

    if (!canAccessOwnedResource(user, targetBook.ownerId)) {
      alert("Je kunt alleen je eigen dashboardboeken beheren.");
      return;
    }

    const confirmed = window.confirm(
      `Weet je zeker dat je "${targetBook.title}" uit de Library wilt verwijderen?\n\nLezers kunnen dit boek daarna niet meer als live boek openen. Daarna wordt het weer een bewerkbaar concept.`,
    );

    if (!confirmed) return;

    try {
      await removeDashboardBookFromLibraryInSupabase(bookId);
      await refreshDashboardBooks();
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? `Verwijderen uit Library mislukt: ${error.message}` : "Verwijderen uit Library mislukt.");
    }
  }

  async function deleteDraftBook(bookId: string) {
    const targetBook = draftDashboardBooks.find((book) => book.id === bookId);
    if (!targetBook) return;

    if (!canAccessOwnedResource(user, targetBook.ownerId)) {
      alert("Je kunt alleen je eigen dashboardboeken beheren.");
      return;
    }

    if (targetBook.published) {
      alert("Een live boek kun je niet als concept verwijderen. Haal het eerst uit de Library.");
      return;
    }

    const confirmed = window.confirm(
      `Weet je zeker dat je concept "${targetBook.title}" wilt verwijderen uit je dashboard?`,
    );

    if (!confirmed) return;

    try {
      await deleteDashboardBookFromSupabase(bookId);
      setDraftDashboardBooks((currentBooks) => currentBooks.filter((book) => book.id !== bookId));
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? `Concept verwijderen mislukt: ${error.message}` : "Concept verwijderen mislukt.");
    }
  }


  async function saveBookMedia(bookId: string, payload: MediaSavePayload) {
    const targetBook = draftDashboardBooks.find((book) => book.id === bookId);
    if (!targetBook) return;

    if (!user || !canAccessOwnedResource(user, targetBook.ownerId)) {
      alert("Je kunt alleen media van je eigen dashboardboeken aanpassen.");
      return;
    }

    try {
      const savedBook = await updateDashboardBookMediaInSupabase(user, bookId, payload);
      setDraftDashboardBooks((currentBooks) =>
        currentBooks.map((book) => (book.id === bookId ? (savedBook as DashboardBook) : book)),
      );
      setMediaBook(null);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? `Media opslaan mislukt: ${error.message}` : "Media opslaan mislukt.");
    }
  }


  if (!permissions.canUseDashboard) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05070d] p-5 text-white">
        <div className="max-w-2xl rounded-3xl border border-white/10 bg-white/[0.035] p-8 text-center shadow-2xl">
          <p className="text-sm font-black uppercase tracking-[0.32em] text-blue-300">Auteur Dashboard</p>
          <h1 className="mt-4 text-4xl font-black sm:text-6xl">Login nodig</h1>
          <p className="mt-5 text-base font-semibold leading-7 text-neutral-300">
            Je kunt zonder account wel schrijven in de Auteur Studio en lokaal opslaan. Dashboard-opslag, boekbeheer en publiceren zijn alleen beschikbaar voor ingelogde auteurs. Boeken worden straks gekoppeld aan jouw account.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => setAuthModalMode("login")}
              className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-500"
            >
              Login als auteur
            </button>
            <button
              onClick={() => setAuthModalMode("register")}
              className="rounded-2xl border border-blue-400/35 bg-blue-500/10 px-5 py-3 text-sm font-black text-blue-100 hover:bg-blue-500/20"
            >
              Registreer als auteur
            </button>
            <Link
              href="/editor"
              className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-black text-white hover:bg-white/10"
            >
              Open Auteur Studio lokaal
            </Link>
            <Link
              href="/"
              className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-black text-neutral-300 hover:bg-white/10 hover:text-white"
            >
              Terug naar Library
            </Link>
          </div>
        </div>
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

  return (
    <main className="min-h-screen bg-[#05070d] text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#05070d]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div>
            <DiBooksLogo />
            <p className="mt-1 text-xs font-black uppercase tracking-[0.32em] text-neutral-500">Auteur Dashboard</p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-2xl border border-white/15 px-4 py-3 text-sm font-black text-white hover:bg-white/10">
              Library
            </Link>
            <Link href="/editor" className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-500">
              Studio openen
            </Link>
            <button
              onClick={logout}
              className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-black text-red-100 hover:bg-red-500/20"
              title={user?.email ?? "Uitloggen"}
            >
              Uitloggen
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-stretch">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-blue-950/70 via-neutral-950 to-purple-950/55 p-6 shadow-2xl sm:p-8">
            <p className="text-sm font-black uppercase tracking-[0.32em] text-blue-300">Dashboard v3</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight sm:text-6xl">
              Beheer concepten en live boeken veilig.
            </h1>
            <p className="mt-5 max-w-3xl text-lg font-semibold leading-8 text-neutral-300">
Nieuwe boeken start je als concept. Gratis auteurs kunnen bouwen en testen tot 15 nodes. Reader Plus is voor lezen. Publiceren naar de Library is voor Author Pro accounts.
            </p>
          </div>

          <div className="grid gap-3 rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl sm:p-6">
            <h2 className="text-xl font-black">Plan & publicatie</h2>
            <div className="rounded-2xl border border-yellow-500/25 bg-yellow-500/10 p-4 text-sm leading-6 text-yellow-100">
              <strong>Free:</strong> gratis boeken lezen en bouwen/testen tot {FREE_NODE_LIMIT} nodes. Publiceren is vergrendeld.
            </div>
            <div className="rounded-2xl border border-blue-500/25 bg-blue-500/10 p-4 text-sm leading-6 text-blue-100">
              <strong>Reader Plus:</strong> premium boeken lezen. <strong>Author Pro:</strong> publiceren vanaf {AUTHOR_PRO_MIN_COMPLETE_NODES_TO_PUBLISH} complete nodes. Vanaf {FULL_BOOK_NODE_BADGE_THRESHOLD} nodes telt het later als volledig interactief boek.
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs font-black uppercase tracking-widest text-neutral-500">Rol</p>
            <p className="mt-2 text-3xl font-black text-cyan-300">{getRoleLabel(user)}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs font-black uppercase tracking-widest text-neutral-500">Plan</p>
            <p className="mt-2 text-3xl font-black text-blue-300">{getPlanLabel(user)}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs font-black uppercase tracking-widest text-neutral-500">Totaal boeken</p>
            <p className="mt-2 text-4xl font-black">{allBooks.length}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs font-black uppercase tracking-widest text-neutral-500">Live</p>
            <p className="mt-2 text-4xl font-black text-emerald-300">{liveBooks.length}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs font-black uppercase tracking-widest text-neutral-500">Niet live</p>
            <p className="mt-2 text-4xl font-black text-yellow-300">{draftBooks.length}</p>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.32em] text-neutral-500">Mijn boeken</p>
            <h2 className="mt-2 text-3xl font-black sm:text-4xl">Auteurcollectie</h2>
          </div>
          <button
            onClick={() => setNewBookOpen(true)}
            className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-black hover:bg-neutral-200"
          >
            + Nieuw boek
          </button>
        </div>

        {dashboardLoading && (
          <div className="mt-6 rounded-2xl border border-blue-500/25 bg-blue-500/10 p-4 text-sm font-bold text-blue-100">
            Dashboardboeken laden uit Supabase...
          </div>
        )}

        {dashboardError && (
          <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-100">
            Supabase fout: {dashboardError}
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          {allBooks.map((book) => (
            <BookDashboardCard key={`${book.source}-${book.id}`} book={book} onPublish={publishBookToLibrary} canPublish={permissions.canPublishBook} onRemoveFromLibrary={removeBookFromLibrary} onDeleteDraft={deleteDraftBook} onOpenMedia={setMediaBook} onOpenDetails={openBookDetails} />
          ))}
        </div>
      </section>

      {newBookOpen && (
        <NewBookModal
          form={form}
          setForm={setForm}
          onClose={() => setNewBookOpen(false)}
          onSave={saveNewBook}
          mode="new"
        />
      )}

      {detailsBook && (
        <NewBookModal
          form={detailsForm}
          setForm={setDetailsForm}
          onClose={() => setDetailsBook(null)}
          onSave={saveBookDetails}
          mode="edit"
        />
      )}
      {mediaBook && (
        <MediaManagerModal
          book={mediaBook}
          onClose={() => setMediaBook(null)}
          onSave={(payload) => saveBookMedia(mediaBook.id, payload)}
        />
      )}
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
