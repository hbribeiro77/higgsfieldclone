import { readFile } from "node:fs/promises";
import { getOrCreateOwnerId } from "@/lib/anonymous-session-owner";
import { findGenerationForOwner } from "@/lib/generation-ownership-file-store";
import { localMediaPath } from "@/lib/refresh-owned-generation-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const ownerId = await getOrCreateOwnerId();
  const record = await findGenerationForOwner(ownerId, id);
  if (!record?.localMediaReady) {
    return Response.json({ error: "Vídeo não encontrado." }, { status: 404 });
  }

  try {
    const bytes = await readFile(localMediaPath(record.id));
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return Response.json({ error: "Vídeo não encontrado." }, { status: 404 });
  }
}
