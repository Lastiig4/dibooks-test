"use client";

import { useState } from "react";
import type { DemoAuthUser } from "@/lib/auth";
import {
  createBookSeriesInSupabase,
  deleteBookSeriesFromSupabase,
  updateBookSeriesInSupabase,
  type BookSeries,
} from "@/lib/supabase/dashboardBooks";

export default function BookSeriesManagerModal({
  user,
  series,
  onClose,
  onChanged,
  onCreated,
  onDeleted,
}: {
  user: DemoAuthUser;
  series: BookSeries[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  onCreated?: (series: BookSeries) => void;
  onDeleted?: (seriesId: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function createSeries() {
    if (!title.trim()) {
      alert("Geef de serie eerst een naam.");
      return;
    }

    setBusy(true);
    try {
      const created = await createBookSeriesInSupabase(user, { title, description });
      setTitle("");
      setDescription("");
      onCreated?.(created);
      await onChanged();
    } catch (error) {
      alert(error instanceof Error ? `Serie maken mislukt: ${error.message}` : "Serie maken mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function editSeries(item: BookSeries) {
    const nextTitle = window.prompt("Nieuwe serienaam:", item.title);
    if (nextTitle === null) return;

    const nextDescription = window.prompt(
      "Korte omschrijving van de serie:",
      item.description || "",
    );
    if (nextDescription === null) return;

    setBusy(true);
    try {
      await updateBookSeriesInSupabase(user, item.id, {
        title: nextTitle,
        description: nextDescription,
      });
      await onChanged();
    } catch (error) {
      alert(error instanceof Error ? `Serie aanpassen mislukt: ${error.message}` : "Serie aanpassen mislukt.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSeries(item: BookSeries) {
    const confirmed = window.confirm(
      `Serie "${item.title}" verwijderen?\n\nDe boeken zelf blijven bestaan. Ze worden alleen losgekoppeld van deze serie.`,
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      await deleteBookSeriesFromSupabase(user, item.id);
      onDeleted?.(item.id);
      await onChanged();
    } catch (error) {
      alert(error instanceof Error ? `Serie verwijderen mislukt: ${error.message}` : "Serie verwijderen mislukt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto bg-black/80 p-4 backdrop-blur-sm sm:p-6">
      <div className="mx-auto max-w-4xl rounded-3xl border border-purple-400/20 bg-[#080b13] p-5 text-white shadow-2xl sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.32em] text-purple-300">Series</p>
            <h2 className="mt-2 text-3xl font-black sm:text-5xl">Beheer je boekenseries</h2>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-neutral-400">
              Maak één centrale serie aan en koppel er daarna meerdere boeken aan. Een serie verwijderen verwijdert nooit de boeken zelf.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white hover:bg-red-500"
          >
            Sluiten
          </button>
        </div>

        <div className="mt-6 rounded-3xl border border-purple-400/20 bg-purple-500/[0.07] p-5">
          <h3 className="text-xl font-black">+ Nieuwe serie</h3>
          <div className="mt-4 grid gap-3">
            <label>
              <span className="mb-2 block text-sm font-black text-neutral-300">Serienaam</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Bijv. De Sterrenkronieken"
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-purple-400"
              />
            </label>
            <label>
              <span className="mb-2 block text-sm font-black text-neutral-300">Omschrijving</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optioneel: korte omschrijving van de serie."
                className="h-24 w-full resize-none rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold leading-6 text-white outline-none focus:border-purple-400"
              />
            </label>
            <button
              type="button"
              onClick={() => void createSeries()}
              disabled={busy || !title.trim()}
              className="justify-self-start rounded-2xl bg-purple-500 px-5 py-3 text-sm font-black text-white hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Serie aanmaken
            </button>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.25em] text-neutral-500">Mijn series</p>
              <h3 className="mt-1 text-2xl font-black">{series.length} serie{series.length === 1 ? "" : "s"}</h3>
            </div>
          </div>

          {series.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm font-semibold text-neutral-400">
              Je hebt nog geen serie. Maak hierboven bijvoorbeeld <strong>De Sterrenkronieken</strong> aan.
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {series.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.035] p-4"
                >
                  <div className="min-w-0">
                    <p className="text-lg font-black text-white">{item.title}</p>
                    <p className="mt-1 text-sm font-semibold leading-6 text-neutral-400">
                      {item.description || "Geen omschrijving."}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void editSeries(item)}
                      disabled={busy}
                      className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-black text-white hover:bg-white/10 disabled:opacity-40"
                    >
                      Bewerken
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteSeries(item)}
                      disabled={busy}
                      className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-xs font-black text-red-100 hover:bg-red-500/20 disabled:opacity-40"
                    >
                      Verwijder
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
