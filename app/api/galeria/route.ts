import { listGalleryItems, toPublicGalleryItem } from "@/lib/arquivo-da-galeria-de-frames-e-clipes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const items = await listGalleryItems();
  return Response.json({ items: items.map(toPublicGalleryItem) });
}
