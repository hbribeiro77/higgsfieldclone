"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReferenceVideoComposer,
  type ComposerHandle,
  type ComposerSuggestion,
  type ComposerSubmission,
} from "@/components/reference-video-composer";
import type { PublicGeneration } from "@/lib/generation-ownership-file-store";

type GalleryItemCard = {
  id: string;
  kind: "image" | "video";
  label: string;
  mediaUrl: string;
  createdAt: string;
};

const STATUS_LABEL: Record<PublicGeneration["status"], string> = {
  submitting: "Enviando",
  submit_unknown: "Envio sem confirmação",
  queued: "Na fila",
  in_progress: "Gerando",
  completed: "Pronto",
  failed: "Falhou",
  nsfw: "Recusado pela moderação",
  canceled: "Cancelado",
};

export function ReferenceVideoStudioPage() {
  const [credentialsConfigured, setCredentialsConfigured] = useState(false);
  const [generations, setGenerations] = useState<PublicGeneration[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [suggestion, setSuggestion] = useState<ComposerSuggestion | null>(null);
  const [preparingReferenceId, setPreparingReferenceId] = useState<string | null>(null);
  const [gallery, setGallery] = useState<GalleryItemCard[]>([]);
  const [galleryTab, setGalleryTab] = useState<"generations" | "clips" | "images">("generations");
  const [viewedGalleryId, setViewedGalleryId] = useState<string | null>(null);
  const [clipStart, setClipStart] = useState<number | null>(null);
  const [clipEnd, setClipEnd] = useState<number | null>(null);
  const [savingGallery, setSavingGallery] = useState(false);
  const suggestionToken = useRef(0);
  const composerRef = useRef<ComposerHandle>(null);
  const playerRef = useRef<HTMLVideoElement>(null);

  const selected = generations.find((generation) => generation.id === selectedId) ?? null;

  const replaceGeneration = useCallback((generation: PublicGeneration) => {
    setGenerations((current) => {
      const without = current.filter((item) => item.id !== generation.id);
      return [generation, ...without].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const response = await fetch("/api/generations");
      const payload = (await response.json()) as {
        credentialsConfigured?: boolean;
        generations?: PublicGeneration[];
      };
      if (cancelled) return;
      setCredentialsConfigured(payload.credentialsConfigured !== false);
      const items = payload.generations ?? [];
      setGenerations(items);
      setSelectedId((current) => current ?? items[0]?.id ?? null);
      setLoaded(true);
    }
    void load();
    void refreshGallery();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selected?.polling) return;
    const timer = window.setInterval(() => {
      void fetch(`/api/generations/${selected.id}`)
        .then((response) => response.json())
        .then((payload: { generation?: PublicGeneration }) => {
          if (payload.generation) replaceGeneration(payload.generation);
        })
        .catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [replaceGeneration, selected?.id, selected?.polling]);

  async function refreshGallery() {
    const response = await fetch("/api/galeria");
    if (!response.ok) return;
    const payload = (await response.json()) as { items?: GalleryItemCard[] };
    setGallery(payload.items ?? []);
  }

  function sourceOfRecorte(): { generationId: string } | { galleryItemId: string } | null {
    const clip = gallery.find((item) => item.id === viewedGalleryId && item.kind === "video");
    if (clip) return { galleryItemId: clip.id };
    if (selected?.mediaUrl) return { generationId: selected.id };
    return null;
  }

  function clearClipMarks() {
    setClipStart(null);
    setClipEnd(null);
  }

  async function saveFrame() {
    const source = sourceOfRecorte();
    if (!source || savingGallery) return;
    setSavingGallery(true);
    setFormError(null);
    try {
      const response = await fetch("/api/galeria/frame", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...source, timeSeconds: playerRef.current?.currentTime ?? 0 }),
      });
      const payload = (await response.json()) as { error?: string; item?: GalleryItemCard };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível salvar o frame.");
      await refreshGallery();
      if (payload.item) setViewedGalleryId(payload.item.id);
      setGalleryTab("images");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível salvar o frame.");
    } finally {
      setSavingGallery(false);
    }
  }

  async function saveClip() {
    const source = sourceOfRecorte();
    if (!source || clipStart === null || clipEnd === null || savingGallery) return;
    setSavingGallery(true);
    setFormError(null);
    try {
      const response = await fetch("/api/galeria/clipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...source, startSeconds: clipStart, endSeconds: clipEnd }),
      });
      const payload = (await response.json()) as { error?: string; item?: GalleryItemCard };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível salvar o clipe.");
      await refreshGallery();
      if (payload.item) setViewedGalleryId(payload.item.id);
      clearClipMarks();
      setGalleryTab("clips");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível salvar o clipe.");
    } finally {
      setSavingGallery(false);
    }
  }

  async function useGalleryItem(item: GalleryItemCard) {
    if (preparingReferenceId) return;
    setPreparingReferenceId(item.id);
    setFormError(null);
    try {
      const response = await fetch(`/api/galeria/${item.id}/referencia`, { method: "POST" });
      const payload = (await response.json()) as { error?: string; publicUrl?: string; kind?: "image" | "video"; previewUrl?: string };
      if (!response.ok || !payload.publicUrl || (payload.kind !== "image" && payload.kind !== "video")) {
        throw new Error(payload.error ?? "Não foi possível usar esse item como referência.");
      }
      composerRef.current?.addRemoteReference(payload.kind, payload.publicUrl, payload.previewUrl ?? item.mediaUrl);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível usar esse item como referência.");
    } finally {
      setPreparingReferenceId(null);
    }
  }

  async function handleGenerate(submission: ComposerSubmission) {
    setBusy(true);
    setFormError(null);
    const clientSubmissionId = crypto.randomUUID();
    try {
      const imageUrls: string[] = [];
      const videoUrls: string[] = [];
      const audioUrls: string[] = [];
      for (const reference of submission.references) {
        if (reference.remoteUrl) {
          if (reference.kind === "image") imageUrls.push(reference.remoteUrl);
          if (reference.kind === "video") videoUrls.push(reference.remoteUrl);
          if (reference.kind === "audio") audioUrls.push(reference.remoteUrl);
          continue;
        }
        if (!reference.file) continue;
        const body = new FormData();
        body.set("file", reference.file);
        const uploadResponse = await fetch("/api/uploads", { method: "POST", body });
        const uploadPayload = (await uploadResponse.json()) as { error?: string; publicUrl?: string; kind?: string };
        if (!uploadResponse.ok || !uploadPayload.publicUrl) {
          throw new Error(uploadPayload.error ?? "Falha ao enviar a referência.");
        }
        if (uploadPayload.kind === "image") imageUrls.push(uploadPayload.publicUrl);
        if (uploadPayload.kind === "video") videoUrls.push(uploadPayload.publicUrl);
        if (uploadPayload.kind === "audio") audioUrls.push(uploadPayload.publicUrl);
      }

      const response = await fetch("/api/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientSubmissionId,
          model: submission.model,
          prompt: submission.prompt,
          duration: submission.duration,
          resolution: submission.resolution,
          aspectRatio: submission.aspectRatio,
          generateAudio: submission.generateAudio,
          enableThinking: submission.model === "wan-3.0" ? submission.enableThinking : undefined,
          imageUrls,
          videoUrls,
          audioUrls,
          fileUrl: submission.fileUrl || undefined,
          linkUrl: submission.linkUrl || undefined,
        }),
      });
      const payload = (await response.json()) as { error?: string; generation?: PublicGeneration };
      if (payload.generation) {
        replaceGeneration(payload.generation);
        setViewedGalleryId(null);
        setSelectedId(payload.generation.id);
      }
      if (!response.ok) {
        setFormError(payload.error ?? payload.generation?.error ?? "A geração não foi enviada.");
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Falha ao gerar o vídeo.");
    } finally {
      setBusy(false);
    }
  }

  function reuseGeneration(generation: PublicGeneration) {
    setViewedGalleryId(null);
    setSelectedId(generation.id);
    setFormError(null);
    suggestionToken.current += 1;
    setSuggestion({
      token: suggestionToken.current,
      model: generation.model,
      prompt: generation.prompt,
      duration: generation.duration,
      resolution: generation.resolution,
      aspectRatio: generation.aspectRatio,
      generateAudio: generation.generateAudio,
      enableThinking: generation.enableThinking,
      fileUrl: generation.fileUrl ?? "",
      linkUrl: generation.linkUrl ?? "",
      references: [
        ...(generation.imageUrls ?? []).map((url) => ({ kind: "image" as const, url })),
        ...(generation.videoUrls ?? []).map((url) => ({ kind: "video" as const, url })),
        ...(generation.audioUrls ?? []).map((url) => ({ kind: "audio" as const, url })),
      ],
    });
  }

  async function addGeneratedVideoAsReference(generation: PublicGeneration) {
    if (generation.status !== "completed" || !generation.mediaUrl || preparingReferenceId) return;
    setPreparingReferenceId(generation.id);
    setFormError(null);
    try {
      const response = await fetch(`/api/generations/${generation.id}/referencia-de-video`, { method: "POST" });
      const payload = (await response.json()) as { error?: string; publicUrl?: string };
      if (!response.ok || !payload.publicUrl) {
        throw new Error(payload.error ?? "Não foi possível usar esse vídeo como referência.");
      }
      composerRef.current?.addGeneratedVideo(payload.publicUrl, generation.mediaUrl);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível usar esse vídeo como referência.");
    } finally {
      setPreparingReferenceId(null);
    }
  }

  const viewedGallery = gallery.find((item) => item.id === viewedGalleryId) ?? null;
  const playbackUrl = viewedGallery?.kind === "video" ? viewedGallery.mediaUrl : selected?.mediaUrl ?? selected?.remoteVideoUrl ?? null;

  async function removeGalleryItem(item: GalleryItemCard) {
    if (!window.confirm(`Apagar ${item.label}? O vídeo original permanece.`)) return;
    setFormError(null);
    const response = await fetch(`/api/galeria/${item.id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setFormError(payload.error ?? "Não foi possível apagar.");
      return;
    }
    if (viewedGalleryId === item.id) setViewedGalleryId(null);
    await refreshGallery();
  }

  async function removeGeneration(generation: PublicGeneration) {
    if (!window.confirm("Apagar esta geração da VPS? Frames e clipes tirados dela permanecem.")) return;
    setFormError(null);
    const response = await fetch(`/api/generations/${generation.id}`, { method: "DELETE" });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      setFormError(payload.error ?? "Não foi possível apagar.");
      return;
    }
    const remaining = generations.filter((item) => item.id !== generation.id);
    setGenerations(remaining);
    if (selectedId === generation.id) setSelectedId(remaining[0]?.id ?? null);
  }

  function openGeneration(id: string) {
    clearClipMarks();
    setViewedGalleryId(null);
    setSelectedId(id);
  }

  function openGalleryItem(id: string) {
    clearClipMarks();
    setViewedGalleryId(id);
  }

  return (
    <div className="flex h-dvh flex-col bg-black text-zinc-100">
      <header className="flex h-12 shrink-0 items-center gap-6 border-b border-white/10 px-4 text-sm">
        <span className="border-b-2 border-white pb-3 pt-3 font-medium">Criar vídeo</span>
        <span className="text-zinc-500">Editar vídeo</span>
        <span className="text-zinc-500">Motion control</span>
      </header>

      {!credentialsConfigured ? (
        <p className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm text-amber-100">
          Configure HF_API_KEY_ID e HF_API_KEY_SECRET em .env.local e reinicie o servidor. Sem as chaves, nada é enviado à Higgsfield.
        </p>
      ) : null}

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)_360px]">
        <aside className="min-h-0 border-b border-white/10 lg:border-b-0 lg:border-r">
          {formError ? <p className="px-3 pt-3 text-xs text-amber-200">{formError}</p> : null}
          <ReferenceVideoComposer
            ref={composerRef}
            key={suggestion?.token ?? 0}
            busy={busy}
            credentialsConfigured={credentialsConfigured}
            draft={suggestion}
            onGenerate={(submission) => {
              void handleGenerate(submission);
            }}
          />
        </aside>

        <main className="flex min-h-0 flex-col bg-black">
          <div className="px-4 py-3 text-sm text-zinc-300">
            <p className="line-clamp-2">
              {viewedGallery ? viewedGallery.label : selected ? selected.prompt || "Vídeo gerado" : "Visor"}
            </p>
          </div>
          <section className="flex flex-1 items-center justify-center px-6 pb-8" aria-live="polite">
            {viewedGallery?.kind === "image" ? (
              <div className="flex w-full max-w-4xl flex-col items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={viewedGallery.mediaUrl}
                  alt={viewedGallery.label}
                  className="max-h-[72vh] w-full rounded-2xl bg-black object-contain"
                />
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    className="rounded-full bg-white/10 px-4 py-2 text-sm"
                    disabled={preparingReferenceId === viewedGallery.id}
                    onClick={() => {
                      void useGalleryItem(viewedGallery);
                    }}
                  >
                    {preparingReferenceId === viewedGallery.id ? "Preparando referência…" : "Usar como referência"}
                  </button>
                  <button
                    type="button"
                    className="rounded-full bg-red-500/15 px-4 py-2 text-sm text-red-200"
                    onClick={() => {
                      void removeGalleryItem(viewedGallery);
                    }}
                  >
                    Apagar
                  </button>
                </div>
              </div>
            ) : playbackUrl && (viewedGallery?.kind === "video" || selected) ? (
              <div className="flex w-full max-w-4xl flex-col items-center gap-3">
                <video
                  ref={playerRef}
                  key={playbackUrl}
                  src={playbackUrl}
                  controls
                  className="max-h-[72vh] w-full rounded-2xl bg-black object-contain"
                />
                {viewedGallery?.kind === "video" ? (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      className="rounded-full bg-white/10 px-4 py-2 text-sm"
                      disabled={preparingReferenceId === viewedGallery.id}
                      onClick={() => {
                        void useGalleryItem(viewedGallery);
                      }}
                    >
                      {preparingReferenceId === viewedGallery.id ? "Preparando referência…" : "Usar como referência"}
                    </button>
                    <RecorteButtons
                      saving={savingGallery}
                      clipStart={clipStart}
                      clipEnd={clipEnd}
                      onSaveFrame={() => {
                        void saveFrame();
                      }}
                      onMarkStart={() => setClipStart(playerRef.current?.currentTime ?? 0)}
                      onMarkEnd={() => setClipEnd(playerRef.current?.currentTime ?? 0)}
                      onSaveClip={() => {
                        void saveClip();
                      }}
                    />
                    <button
                      type="button"
                      className="rounded-full bg-red-500/15 px-4 py-2 text-sm text-red-200"
                      onClick={() => {
                        void removeGalleryItem(viewedGallery);
                      }}
                    >
                      Apagar
                    </button>
                  </div>
                ) : selected?.status === "completed" && selected.mediaUrl ? (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      className="rounded-full bg-white/10 px-4 py-2 text-sm"
                      disabled={preparingReferenceId === selected.id}
                      onClick={() => {
                        void addGeneratedVideoAsReference(selected);
                      }}
                    >
                      {preparingReferenceId === selected.id ? "Preparando referência…" : "Usar como referência"}
                    </button>
                    <RecorteButtons
                      saving={savingGallery}
                      clipStart={clipStart}
                      clipEnd={clipEnd}
                      onSaveFrame={() => {
                        void saveFrame();
                      }}
                      onMarkStart={() => setClipStart(playerRef.current?.currentTime ?? 0)}
                      onMarkEnd={() => setClipEnd(playerRef.current?.currentTime ?? 0)}
                      onSaveClip={() => {
                        void saveClip();
                      }}
                    />
                    <button
                      type="button"
                      className="rounded-full bg-red-500/15 px-4 py-2 text-sm text-red-200"
                      onClick={() => {
                        void removeGeneration(selected);
                      }}
                    >
                      Apagar
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="max-w-md text-center">
                <p className="text-xl font-medium">
                  {selected?.error
                    ? selected.error
                    : selected
                      ? STATUS_LABEL[selected.status]
                      : "O vídeo aparece aqui"}
                </p>
                <p className="mt-2 text-sm text-zinc-500">
                  {selected
                    ? selected.statusDetail || (selected.error ? "Este envio não foi repetido." : "A geração continua na Higgsfield.")
                    : "Escolha um item na grade ou gere um vídeo."}
                </p>
                {selected?.correlationId ? (
                  <p className="mt-2 text-xs text-zinc-600">Correlação: {selected.correlationId}</p>
                ) : null}
                {selected ? (
                  <button
                    type="button"
                    className="mt-4 rounded-full bg-red-500/15 px-4 py-2 text-sm text-red-200"
                    onClick={() => {
                      void removeGeneration(selected);
                    }}
                  >
                    Apagar
                  </button>
                ) : null}
              </div>
            )}
          </section>
        </main>

        <aside className="min-h-0 overflow-y-auto border-t border-white/10 p-3 lg:border-t-0 lg:border-l">
          <div className="mb-3 grid grid-cols-3 rounded-xl bg-[#141414] p-1 text-xs">
            <button
              type="button"
              className={`rounded-lg px-2 py-2 ${galleryTab === "generations" ? "bg-[#2a2a2a] text-white" : "text-zinc-500"}`}
              onClick={() => setGalleryTab("generations")}
            >
              Gerações
            </button>
            <button
              type="button"
              className={`rounded-lg px-2 py-2 ${galleryTab === "clips" ? "bg-[#2a2a2a] text-white" : "text-zinc-500"}`}
              onClick={() => setGalleryTab("clips")}
            >
              Clipes
            </button>
            <button
              type="button"
              className={`rounded-lg px-2 py-2 ${galleryTab === "images" ? "bg-[#2a2a2a] text-white" : "text-zinc-500"}`}
              onClick={() => setGalleryTab("images")}
            >
              Imagens
            </button>
          </div>
          {galleryTab === "generations" ? (
            generations.length === 0 && loaded ? (
              <p className="px-1 text-sm text-zinc-500">Nenhuma geração nesta sessão.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {generations.map((generation) => {
                  const preview = generation.mediaUrl ?? generation.remoteVideoUrl;
                  const open = generation.id === selectedId && !viewedGallery;
                  return (
                    <div
                      key={generation.id}
                      className={`rounded-xl bg-[#141414] p-1.5 ${open ? "ring-1 ring-white/50" : ""}`}
                    >
                      <button type="button" className="w-full text-left" onClick={() => openGeneration(generation.id)}>
                        {preview ? (
                          <video src={preview} muted playsInline className="pointer-events-none aspect-video w-full rounded-lg object-cover" />
                        ) : (
                          <div className="flex aspect-video items-center justify-center rounded-lg bg-black text-[11px] text-zinc-500">
                            {STATUS_LABEL[generation.status]}
                          </div>
                        )}
                        <p className="mt-1 line-clamp-2 text-xs text-zinc-100">{generation.prompt || "Sem prompt"}</p>
                      </button>
                      <div className="mt-1 grid grid-cols-2 gap-1">
                        <button
                          type="button"
                          className="rounded-md bg-white/10 py-1 text-[10px] text-white"
                          onClick={() => reuseGeneration(generation)}
                        >
                          De novo
                        </button>
                        <button
                          type="button"
                          className="rounded-md bg-red-500/15 py-1 text-[10px] text-red-200"
                          onClick={() => {
                            void removeGeneration(generation);
                          }}
                        >
                          Apagar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <GalleryCards
              items={gallery.filter((item) => item.kind === (galleryTab === "clips" ? "video" : "image"))}
              empty={
                galleryTab === "clips"
                  ? "Nenhum clipe. No vídeo gerado, marque Início e Fim e clique em Salvar clipe."
                  : "Nenhum frame. No vídeo gerado, clique em Salvar frame."
              }
              selectedId={viewedGalleryId}
              onOpen={(item) => openGalleryItem(item.id)}
              onDelete={(item) => {
                void removeGalleryItem(item);
              }}
            />
          )}
        </aside>
      </div>
    </div>
  );
}

function RecorteButtons({
  saving,
  clipStart,
  clipEnd,
  onSaveFrame,
  onMarkStart,
  onMarkEnd,
  onSaveClip,
}: {
  saving: boolean;
  clipStart: number | null;
  clipEnd: number | null;
  onSaveFrame: () => void;
  onMarkStart: () => void;
  onMarkEnd: () => void;
  onSaveClip: () => void;
}) {
  return (
    <>
      <button type="button" className="rounded-full bg-white/10 px-4 py-2 text-sm" disabled={saving} onClick={onSaveFrame}>
        Salvar frame
      </button>
      <button type="button" className="rounded-full bg-white/10 px-4 py-2 text-sm" onClick={onMarkStart}>
        Início {clipStart === null ? "" : `${clipStart.toFixed(1)}s`}
      </button>
      <button type="button" className="rounded-full bg-white/10 px-4 py-2 text-sm" onClick={onMarkEnd}>
        Fim {clipEnd === null ? "" : `${clipEnd.toFixed(1)}s`}
      </button>
      <button
        type="button"
        className="rounded-full bg-[#d6ff3f] px-4 py-2 text-sm font-semibold text-black disabled:opacity-40"
        disabled={saving || clipStart === null || clipEnd === null}
        onClick={onSaveClip}
      >
        Salvar clipe
      </button>
    </>
  );
}

function GalleryCards({
  items,
  empty,
  selectedId,
  onOpen,
  onDelete,
}: {
  items: GalleryItemCard[];
  empty: string;
  selectedId: string | null;
  onOpen: (item: GalleryItemCard) => void;
  onDelete: (item: GalleryItemCard) => void;
}) {
  if (items.length === 0) {
    return <p className="px-1 text-sm text-zinc-500">{empty}</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={`rounded-xl bg-[#141414] p-1.5 ${item.id === selectedId ? "ring-1 ring-white/50" : ""}`}
        >
          <button type="button" className="w-full text-left" onClick={() => onOpen(item)}>
            {item.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.mediaUrl} alt="" className="aspect-video w-full rounded-lg object-cover" />
            ) : (
              <video src={item.mediaUrl} muted playsInline className="pointer-events-none aspect-video w-full rounded-lg object-cover" />
            )}
            <p className="mt-1 line-clamp-2 text-xs text-zinc-100">{item.label}</p>
          </button>
          <button
            type="button"
            className="mt-1 w-full rounded-md bg-red-500/15 py-1 text-[10px] text-red-200"
            onClick={() => onDelete(item)}
          >
            Apagar
          </button>
        </div>
      ))}
    </div>
  );
}
