import { saveFrameFromVideo, toPublicGalleryItem } from "@/lib/arquivo-da-galeria-de-frames-e-clipes";
import { resolveRecorteSource } from "@/lib/origem-do-recorte-de-frame-e-clipe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await readJson(request);
  const timeSeconds = payload?.timeSeconds;
  if (!payload || typeof timeSeconds !== "number") {
    return Response.json({ error: "Informe o vídeo e o instante do frame." }, { status: 422 });
  }
  const source = await resolveRecorteSource(payload);
  if (!source.ok) return Response.json({ error: source.error }, { status: source.status });
  try {
    const item = await saveFrameFromVideo({
      sourcePath: source.sourcePath,
      sourceGenerationId: source.sourceGenerationId,
      timeSeconds,
    });
    return Response.json({ item: toPublicGalleryItem(item) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível salvar o frame.";
    const status = message.includes("ffmpeg") ? 503 : 422;
    return Response.json({ error: message }, { status });
  }
}

async function readJson(request: Request): Promise<{
  generationId?: unknown;
  galleryItemId?: unknown;
  timeSeconds?: unknown;
} | null> {
  try {
    return (await request.json()) as { generationId?: unknown; galleryItemId?: unknown; timeSeconds?: unknown };
  } catch {
    return null;
  }
}
