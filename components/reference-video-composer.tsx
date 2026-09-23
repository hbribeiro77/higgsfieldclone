"use client";

import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import {
  MODEL_LIMITS,
  resolveUploadContentType,
  SEEDANCE_MODEL_ID,
  UPLOAD_CONTENT_TYPES,
  WAN_MODEL_ID,
  type StudioModelId,
} from "@/lib/reference-video-request-validation";

export type ComposerReference = {
  id: string;
  file: File | null;
  remoteUrl: string | null;
  kind: "image" | "video" | "audio";
  previewUrl: string | null;
};

export type ComposerSuggestion = {
  token: number;
  model: StudioModelId;
  prompt: string;
  duration: number | null;
  resolution: string | null;
  aspectRatio: string | null;
  generateAudio: boolean;
  enableThinking: boolean;
  fileUrl: string;
  linkUrl: string;
  references: Array<{ kind: "image" | "video" | "audio"; url: string }>;
};

export type ComposerSubmission = {
  model: StudioModelId;
  prompt: string;
  duration: number;
  resolution: string;
  aspectRatio: string;
  generateAudio: boolean;
  enableThinking: boolean;
  fileUrl: string;
  linkUrl: string;
  references: ComposerReference[];
};

export type ComposerHandle = {
  addGeneratedVideo: (url: string, previewUrl: string) => void;
  addRemoteReference: (kind: "image" | "video", url: string, previewUrl: string) => void;
};

type ReferenceVideoComposerProps = {
  ref?: Ref<ComposerHandle>;
  busy: boolean;
  credentialsConfigured: boolean;
  draft: ComposerSuggestion | null;
  onGenerate: (submission: ComposerSubmission) => void;
};

const FILE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,audio/wav,video/mp4,.jpg,.jpeg,.png,.webp,.gif,.wav,.mp4";

export function ReferenceVideoComposer({ ref, busy, credentialsConfigured, draft, onGenerate }: ReferenceVideoComposerProps) {
  const initialModel = draft?.model ?? WAN_MODEL_ID;
  const initialLimits = MODEL_LIMITS[initialModel];
  const [model, setModel] = useState<StudioModelId>(initialModel);
  const [prompt, setPrompt] = useState(draft?.prompt ?? "");
  const [duration, setDuration] = useState<number>(
    clamp(draft?.duration ?? initialLimits.duration.default, initialLimits.duration.min, initialLimits.duration.max),
  );
  const [resolution, setResolution] = useState<string>(
    draft?.resolution && (initialLimits.resolutions as readonly string[]).includes(draft.resolution)
      ? draft.resolution
      : initialLimits.defaultResolution,
  );
  const [aspectRatio, setAspectRatio] = useState<string>(
    draft?.aspectRatio && (initialLimits.aspectRatios as readonly string[]).includes(draft.aspectRatio)
      ? draft.aspectRatio
      : initialLimits.defaultAspectRatio,
  );
  const [generateAudio, setGenerateAudio] = useState(draft?.generateAudio ?? true);
  const [enableThinking, setEnableThinking] = useState(initialLimits.supportsThinking ? draft?.enableThinking ?? false : false);
  const [fileUrl, setFileUrl] = useState(initialLimits.supportsDocumentOrLink ? draft?.fileUrl ?? "" : "");
  const [linkUrl, setLinkUrl] = useState(initialLimits.supportsDocumentOrLink ? draft?.linkUrl ?? "" : "");
  const [references, setReferences] = useState<ComposerReference[]>(() => remoteReferencesFromDraft(draft));
  const [estimateLabel, setEstimateLabel] = useState<string | null>(null);
  const [estimateNote, setEstimateNote] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    draft ? "Campos preenchidos com a geração anterior. Revise e clique em Gerar quando quiser." : null,
  );
  const addInputRef = useRef<HTMLInputElement>(null);

  const limits = MODEL_LIMITS[model];
  const counts = useMemo(() => countReferences(references), [references]);
  const referencesRef = useRef(references);

  useEffect(() => {
    referencesRef.current = references;
  });

  useEffect(() => {
    if (!credentialsConfigured) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const imageUrls = references.flatMap((reference) => (reference.kind === "image" && reference.remoteUrl ? [reference.remoteUrl] : []));
      const videoUrls = references.flatMap((reference) => (reference.kind === "video" && reference.remoteUrl ? [reference.remoteUrl] : []));
      const audioUrls = references.flatMap((reference) => (reference.kind === "audio" && reference.remoteUrl ? [reference.remoteUrl] : []));
      void fetch("/api/generations/estimativa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          prompt,
          duration,
          resolution,
          aspectRatio,
          generateAudio,
          enableThinking: model === WAN_MODEL_ID ? enableThinking : undefined,
          imageUrls,
          videoUrls,
          audioUrls,
          fileUrl: fileUrl || undefined,
          linkUrl: linkUrl || undefined,
        }),
      })
        .then(async (response) => {
          const payload = (await response.json()) as { label?: string | null; error?: string; note?: string };
          if (!response.ok || !payload.label) {
            setEstimateLabel(null);
            setEstimateNote(payload.error ?? "Não foi possível calcular o custo.");
            return;
          }
          setEstimateLabel(payload.label);
          setEstimateNote(payload.note ?? null);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setEstimateLabel(null);
          setEstimateNote("Não foi possível calcular o custo.");
        });
    }, 400);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    aspectRatio,
    credentialsConfigured,
    duration,
    enableThinking,
    fileUrl,
    generateAudio,
    linkUrl,
    model,
    prompt,
    references,
    resolution,
  ]);

  useImperativeHandle(ref, () => ({
    addGeneratedVideo(url: string, previewUrl: string) {
      pushRemoteReference("video", url, previewUrl, "Vídeo gerado adicionado como referência. Nada foi enviado.");
    },
    addRemoteReference(kind: "image" | "video", url: string, previewUrl: string) {
      const notice = kind === "image"
        ? "Imagem da galeria adicionada como referência. Nada foi gerado."
        : "Clipe adicionado como referência. Nada foi gerado.";
      pushRemoteReference(kind, url, previewUrl, notice);
    },
  }), [model]);

  function pushRemoteReference(kind: "image" | "video", url: string, previewUrl: string, notice: string) {
    const limit = kind === "video" ? MODEL_LIMITS[model].maxVideos : MODEL_LIMITS[model].maxImages;
    const count = referencesRef.current.filter((reference) => reference.kind === kind).length;
    if (count >= limit) {
      const noun = kind === "video" ? "vídeos" : "imagens";
      setNotice(`${MODEL_LIMITS[model].label} aceita no máximo ${limit} ${noun}.`);
      return;
    }
    setReferences((current) => [
      ...current,
      { id: crypto.randomUUID(), file: null, remoteUrl: url, kind, previewUrl },
    ]);
    setNotice(notice);
  }

  useEffect(() => {
    return () => {
      for (const reference of referencesRef.current) {
        if (reference.file && reference.previewUrl) URL.revokeObjectURL(reference.previewUrl);
      }
    };
  }, []);

  function switchModel(nextModel: StudioModelId) {
    const nextLimits = MODEL_LIMITS[nextModel];
    setModel(nextModel);
    setDuration((current) => clamp(current, nextLimits.duration.min, nextLimits.duration.max));
    setResolution((current) => ((nextLimits.resolutions as readonly string[]).includes(current) ? current : nextLimits.defaultResolution));
    setAspectRatio((current) => ((nextLimits.aspectRatios as readonly string[]).includes(current) ? current : nextLimits.defaultAspectRatio));
    if (!nextLimits.supportsThinking) setEnableThinking(false);
    if (!nextLimits.supportsDocumentOrLink) {
      setFileUrl("");
      setLinkUrl("");
    }
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const next = [...references];
    const rejected: string[] = [];
    for (const file of fileList) {
      const contentType = resolveUploadContentType(file.name, file.type);
      if (!contentType || !(contentType in UPLOAD_CONTENT_TYPES)) {
        rejected.push(`${file.name}: use JPEG, PNG, WebP, GIF, WAV ou MP4.`);
        continue;
      }
      const kind = UPLOAD_CONTENT_TYPES[contentType];
      const limit = kind === "image" ? limits.maxImages : kind === "video" ? limits.maxVideos : limits.maxAudios;
      const currentCount = next.filter((item) => item.kind === kind).length;
      if (currentCount >= limit) {
        rejected.push(`${limits.label} aceita no máximo ${limit} ${kind === "image" ? "imagens" : kind === "video" ? "vídeos" : "áudios"}.`);
        continue;
      }
      next.push({
        id: crypto.randomUUID(),
        file,
        remoteUrl: null,
        kind,
        previewUrl: kind === "audio" ? null : URL.createObjectURL(file),
      });
    }
    setReferences(next);
    setNotice(rejected.length > 0 ? rejected[0] : null);
  }

  function removeReference(id: string) {
    setReferences((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.file && target.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }

  const missingVisual = limits.requiresVisualReference && counts.image === 0 && counts.video === 0;
  const missingPrompt = model === WAN_MODEL_ID && prompt.trim().length === 0;
  const blocked = busy || !credentialsConfigured || missingVisual || missingPrompt;
  return (
    <form
      className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto px-3 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (blocked) return;
        onGenerate({
          model,
          prompt: prompt.trim(),
          duration,
          resolution,
          aspectRatio,
          generateAudio,
          enableThinking,
          fileUrl: fileUrl.trim(),
          linkUrl: linkUrl.trim(),
          references,
        });
      }}
    >
      <div className="rounded-2xl bg-[#1a1a1a] p-2">
        {references.length > 0 ? (
          <div>
            <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-[#d6ff3f]">
              {referenceTrayLabel(counts)}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {references.map((reference) => (
                <ReferencePreviewCard
                  key={reference.id}
                  reference={reference}
                  fill={references.length === 1}
                  onRemove={() => removeReference(reference.id)}
                />
              ))}
              <button
                type="button"
                className="flex h-48 w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-white/20 text-zinc-300"
                onClick={() => addInputRef.current?.click()}
              >
                <span className="text-xl leading-none">+</span>
                <span className="text-[10px]">Adicionar</span>
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="flex h-36 w-full flex-col items-center justify-center gap-2 text-zinc-400"
            onClick={() => addInputRef.current?.click()}
          >
            <ReferenceIcons />
            <span className="text-sm text-zinc-200">Adicionar referências</span>
            <span className="text-xs text-zinc-500">
              Até {limits.maxImages} imagens, {limits.maxVideos} vídeos e {limits.maxAudios} áudios
            </span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 rounded-xl bg-[#141414] p-1 text-sm">
        <span className="rounded-lg px-3 py-2 text-center text-zinc-500">Quadros</span>
        <span className="rounded-lg bg-[#2a2a2a] px-3 py-2 text-center text-white">Referências</span>
      </div>
      <input
        ref={addInputRef}
        type="file"
        accept={FILE_ACCEPT}
        multiple
        className="sr-only"
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = "";
        }}
      />

      <label className="block">
        <span className="mb-2 block text-sm text-zinc-400">Prompt</span>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={model === WAN_MODEL_ID ? "Descreva o vídeo" : "Opcional no Seedance"}
          rows={4}
          className="w-full resize-none rounded-2xl border border-white/10 bg-[#141414] px-3 py-3 text-sm text-white outline-none placeholder:text-zinc-600"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-sm text-zinc-400">Modelo</span>
        <select
          aria-label="Modelo"
          value={model}
          onChange={(event) => switchModel(event.target.value as StudioModelId)}
          className="w-full rounded-2xl border border-white/10 bg-[#141414] px-3 py-3 text-sm"
        >
          <option value={WAN_MODEL_ID}>Wan 3.0</option>
          <option value={SEEDANCE_MODEL_ID}>Seedance 2.0</option>
        </select>
      </label>

      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Duração em segundos"
          value={duration}
          onChange={(event) => setDuration(clamp(Number(event.target.value), limits.duration.min, limits.duration.max))}
          className="rounded-full bg-[#1c1c1c] px-3 py-1.5 text-xs"
        >
          {Array.from({ length: limits.duration.max - limits.duration.min + 1 }, (_, index) => limits.duration.min + index).map((seconds) => (
            <option key={seconds} value={seconds}>
              {seconds} s
            </option>
          ))}
        </select>
        <select
          aria-label="Proporção"
          value={aspectRatio}
          onChange={(event) => setAspectRatio(event.target.value)}
          className="rounded-full bg-[#1c1c1c] px-3 py-1.5 text-xs"
        >
          {limits.aspectRatios.map((item) => (
            <option key={item} value={item}>{item === "adaptive" ? "Auto" : item}</option>
          ))}
        </select>
        <select
          aria-label="Resolução"
          value={resolution}
          onChange={(event) => setResolution(event.target.value)}
          className="rounded-full bg-[#1c1c1c] px-3 py-1.5 text-xs"
        >
          {limits.resolutions.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
        <label className="flex items-center gap-1 rounded-full bg-[#1c1c1c] px-3 py-1.5 text-xs">
          <input type="checkbox" checked={generateAudio} onChange={(event) => setGenerateAudio(event.target.checked)} />
          Áudio
        </label>
        {limits.supportsThinking ? (
          <label className="flex items-center gap-1 rounded-full bg-[#1c1c1c] px-3 py-1.5 text-xs">
            <input type="checkbox" checked={enableThinking} onChange={(event) => setEnableThinking(event.target.checked)} />
            Thinking
          </label>
        ) : null}
      </div>

      {limits.supportsDocumentOrLink ? (
        <div className="grid gap-2">
          <input
            value={fileUrl}
            onChange={(event) => setFileUrl(event.target.value)}
            placeholder="URL https de um documento"
            className="rounded-xl bg-[#141414] px-3 py-2 text-xs outline-none ring-1 ring-white/10"
          />
          <input
            value={linkUrl}
            onChange={(event) => setLinkUrl(event.target.value)}
            placeholder="URL https de uma página"
            className="rounded-xl bg-[#141414] px-3 py-2 text-xs outline-none ring-1 ring-white/10"
          />
        </div>
      ) : null}

      <div className="mt-auto space-y-2 pt-2">
        {notice ? <p className="text-xs text-amber-300">{notice}</p> : null}
        {estimateNote ? <p className="text-xs text-zinc-500">{estimateNote}</p> : null}
        {missingVisual ? <p className="text-xs text-zinc-500">O Seedance pede uma imagem ou um vídeo.</p> : null}
        <button
          type="submit"
          disabled={blocked}
          className="flex w-full items-center justify-center rounded-xl bg-[#d6ff3f] py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Enviando…" : estimateLabel ? `Gerar · ${estimateLabel}` : "Gerar"}
        </button>
      </div>
    </form>
  );
}

function ReferencePreviewCard({
  reference,
  fill,
  onRemove,
}: {
  reference: ComposerReference;
  fill: boolean;
  onRemove: () => void;
}) {
  const visualUrl = reference.previewUrl ?? reference.remoteUrl;
  const label =
    reference.kind === "video" ? "Referência de vídeo" : reference.kind === "image" ? "Referência de imagem" : "Referência de áudio";
  return (
    <div
      className={`relative h-48 overflow-hidden rounded-2xl border border-[#d6ff3f]/70 bg-black ${fill ? "min-w-0 flex-1" : "w-36 shrink-0"}`}
    >
      {reference.kind === "video" && visualUrl ? (
        <video src={`${visualUrl}#t=0.1`} muted playsInline preload="metadata" className="h-full w-full object-cover" />
      ) : reference.kind === "image" && visualUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={visualUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full items-center justify-center px-2 text-center text-xs uppercase tracking-wide text-zinc-300">
          Áudio
        </span>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent px-2 pb-2 pt-8">
        <p className="text-xs font-semibold leading-tight text-[#d6ff3f]">{label}</p>
      </div>
      <button
        type="button"
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/80 text-base text-white"
        onClick={onRemove}
        aria-label={`Remover ${reference.file?.name ?? label}`}
      >
        ×
      </button>
    </div>
  );
}

function referenceTrayLabel(counts: { image: number; video: number; audio: number }) {
  const parts = [
    counts.video > 0 ? `${counts.video} ${counts.video === 1 ? "vídeo" : "vídeos"}` : null,
    counts.image > 0 ? `${counts.image} ${counts.image === 1 ? "imagem" : "imagens"}` : null,
    counts.audio > 0 ? `${counts.audio} ${counts.audio === 1 ? "áudio" : "áudios"}` : null,
  ].filter(Boolean);
  return `${parts.join(" · ")} nesta geração`;
}

function ReferenceIcons() {
  return (
    <span className="inline-flex items-center gap-1 text-zinc-400" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" />
        <circle cx="5.5" cy="6.5" r="1.2" fill="currentColor" />
        <path d="M2 12.5 6 8.5l2.5 2.5L11 8l3 4" stroke="currentColor" />
      </svg>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M6 12.5V3.5l7 4.5-7 4.5Z" stroke="currentColor" />
      </svg>
    </span>
  );
}

function remoteReferencesFromDraft(draft: ComposerSuggestion | null): ComposerReference[] {
  if (!draft) return [];
  return draft.references.map((reference) => ({
    id: crypto.randomUUID(),
    file: null,
    remoteUrl: reference.url,
    kind: reference.kind,
    previewUrl: reference.kind === "image" ? reference.url : null,
  }));
}

function countReferences(references: ComposerReference[]) {
  return {
    image: references.filter((item) => item.kind === "image").length,
    video: references.filter((item) => item.kind === "video").length,
    audio: references.filter((item) => item.kind === "audio").length,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}
