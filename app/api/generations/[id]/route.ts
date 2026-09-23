import { rm } from "node:fs/promises";
import { deleteGeneration, findGenerationForOwner, toPublicGeneration } from "@/lib/generation-ownership-file-store";
import { localMediaPath, refreshOwnedGenerationStatus } from "@/lib/refresh-owned-generation-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const removed = await deleteGeneration(id);
  if (!removed) return Response.json({ error: "Geração não encontrada." }, { status: 404 });
  await rm(localMediaPath(removed.id), { force: true });
  return Response.json({ ok: true });
}

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const record = await findGenerationForOwner("estudio", id);
  if (!record) {
    return Response.json({ error: "Geração não encontrada." }, { status: 404 });
  }
  const refreshed = await refreshOwnedGenerationStatus(record);
  return Response.json({ generation: toPublicGeneration(refreshed) });
}
