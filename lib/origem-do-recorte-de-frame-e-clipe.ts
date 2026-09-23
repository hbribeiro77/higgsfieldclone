import { findGalleryItem, galleryItemPath, isGalleryId } from "@/lib/arquivo-da-galeria-de-frames-e-clipes";
import { findGenerationForOwner, isGenerationId } from "@/lib/generation-ownership-file-store";
import { localMediaPath } from "@/lib/refresh-owned-generation-status";

export type RecorteSource =
  | { ok: true; sourcePath: string; sourceGenerationId: string }
  | { ok: false; error: string; status: number };

export async function resolveRecorteSource(input: {
  generationId?: unknown;
  galleryItemId?: unknown;
}): Promise<RecorteSource> {
  if (typeof input.galleryItemId === "string") {
    if (!isGalleryId(input.galleryItemId)) {
      return { ok: false, error: "Clipe inválido.", status: 422 };
    }
    const item = await findGalleryItem(input.galleryItemId);
    if (!item || item.kind !== "video") {
      return { ok: false, error: "Esse clipe não está salvo na VPS.", status: 404 };
    }
    return {
      ok: true,
      sourcePath: galleryItemPath(item),
      sourceGenerationId: item.sourceGenerationId,
    };
  }

  if (typeof input.generationId !== "string" || !isGenerationId(input.generationId)) {
    return { ok: false, error: "Informe o vídeo de origem.", status: 422 };
  }

  const record = await findGenerationForOwner("estudio", input.generationId);
  if (!record || record.status !== "completed" || !record.localMediaReady) {
    return { ok: false, error: "Esse vídeo ainda não está salvo na VPS.", status: 404 };
  }

  return { ok: true, sourcePath: localMediaPath(record.id), sourceGenerationId: record.id };
}
