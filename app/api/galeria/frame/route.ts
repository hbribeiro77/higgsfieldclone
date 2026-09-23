import { saveFrameFromVideo, toPublicGalleryItem } from "@/lib/arquivo-da-galeria-de-frames-e-clipes";
import { findGenerationForOwner } from "@/lib/generation-ownership-file-store";
import { localMediaPath } from "@/lib/refresh-owned-generation-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await readJson(request);
  const generationId = payload?.generationId;
  const timeSeconds = payload?.timeSeconds;
  if (typeof generationId !== "string" || typeof timeSeconds !== "number") {
    return Response.json({ error: "Informe o vídeo e o instante do frame." }, { status: 422 });
  }
  const record = await findGenerationForOwner("estudio", generationId);
  if (!record || record.status !== "completed" || !record.localMediaReady) {
    return Response.json({ error: "Esse vídeo ainda não está salvo na VPS." }, { status: 404 });
  }
  try {
    const item = await saveFrameFromVideo({
      sourcePath: localMediaPath(record.id),
      sourceGenerationId: record.id,
      timeSeconds,
    });
    return Response.json({ item: toPublicGalleryItem(item) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível salvar o frame.";
    const status = message.includes("ffmpeg") ? 503 : 422;
    return Response.json({ error: message }, { status });
  }
}

async function readJson(request: Request): Promise<{ generationId?: unknown; timeSeconds?: unknown } | null> {
  try {
    return (await request.json()) as { generationId?: unknown; timeSeconds?: unknown };
  } catch {
    return null;
  }
}
