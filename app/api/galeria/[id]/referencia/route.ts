import { readFile } from "node:fs/promises";
import { findGalleryItem, galleryItemPath } from "@/lib/arquivo-da-galeria-de-frames-e-clipes";
import {
  createHiggsfieldUploadTarget,
  higgsfieldCredentialsConfigured,
  HiggsfieldRequestError,
  putFileToHiggsfieldUpload,
} from "@/lib/higgsfield-reference-video-api-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const item = await findGalleryItem(id);
  if (!item) return Response.json({ error: "Item da galeria não encontrado." }, { status: 404 });
  if (!higgsfieldCredentialsConfigured()) {
    return Response.json({ error: "Configure as chaves da Higgsfield. Nada foi enviado." }, { status: 503 });
  }
  const contentType = item.kind === "image" ? "image/jpeg" : "video/mp4";
  try {
    const bytes = await readFile(galleryItemPath(item));
    const target = await createHiggsfieldUploadTarget(contentType);
    await putFileToHiggsfieldUpload(target, bytes);
    return Response.json({ publicUrl: target.publicUrl, kind: item.kind, previewUrl: `/api/galeria/${item.id}` });
  } catch (error) {
    const missing = error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
    if (missing) return Response.json({ error: "O arquivo da galeria não está disponível." }, { status: 404 });
    const message = error instanceof HiggsfieldRequestError ? error.message : "Falha ao preparar a referência.";
    const status = error instanceof HiggsfieldRequestError && (error.status === 401 || error.status === 403) ? error.status : 502;
    return Response.json({ error: message }, { status });
  }
}
