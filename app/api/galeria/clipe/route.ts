import { saveClipFromVideo, toPublicGalleryItem } from "@/lib/arquivo-da-galeria-de-frames-e-clipes";
import { findGenerationForOwner } from "@/lib/generation-ownership-file-store";
import { localMediaPath } from "@/lib/refresh-owned-generation-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await readJson(request);
  const generationId = payload?.generationId;
  const startSeconds = payload?.startSeconds;
  const endSeconds = payload?.endSeconds;
  if (typeof generationId !== "string" || typeof startSeconds !== "number" || typeof endSeconds !== "number") {
    return Response.json({ error: "Informe o vídeo, o início e o fim do clipe." }, { status: 422 });
  }
  const record = await findGenerationForOwner("estudio", generationId);
  if (!record || record.status !== "completed" || !record.localMediaReady) {
    return Response.json({ error: "Esse vídeo ainda não está salvo na VPS." }, { status: 404 });
  }
  try {
    const item = await saveClipFromVideo({
      sourcePath: localMediaPath(record.id),
      sourceGenerationId: record.id,
      startSeconds,
      endSeconds,
    });
    return Response.json({ item: toPublicGalleryItem(item) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível salvar o clipe.";
    const status = message.includes("ffmpeg") ? 503 : 422;
    return Response.json({ error: message }, { status });
  }
}

async function readJson(request: Request): Promise<{
  generationId?: unknown;
  startSeconds?: unknown;
  endSeconds?: unknown;
} | null> {
  try {
    return (await request.json()) as { generationId?: unknown; startSeconds?: unknown; endSeconds?: unknown };
  } catch {
    return null;
  }
}
