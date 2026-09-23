import { readFile } from "node:fs/promises";
import { deleteGalleryItem, findGalleryItem, galleryItemPath } from "@/lib/arquivo-da-galeria-de-frames-e-clipes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const removed = await deleteGalleryItem(id);
  if (!removed) return Response.json({ error: "Item da galeria não encontrado." }, { status: 404 });
  return Response.json({ ok: true });
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const item = await findGalleryItem(id);
  if (!item) return Response.json({ error: "Item da galeria não encontrado." }, { status: 404 });
  try {
    const bytes = await readFile(galleryItemPath(item));
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": item.kind === "image" ? "image/jpeg" : "video/mp4",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return Response.json({ error: "O arquivo da galeria não está disponível." }, { status: 404 });
  }
}
