import { readFile } from "node:fs/promises";
import { getOrCreateOwnerId } from "@/lib/anonymous-session-owner";
import { findGenerationForOwner } from "@/lib/generation-ownership-file-store";
import {
  createHiggsfieldUploadTarget,
  higgsfieldCredentialsConfigured,
  HiggsfieldRequestError,
  putFileToHiggsfieldUpload,
} from "@/lib/higgsfield-reference-video-api-client";
import { localMediaPath } from "@/lib/refresh-owned-generation-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const ownerId = await getOrCreateOwnerId();
  const record = await findGenerationForOwner(ownerId, id);
  if (!record || record.status !== "completed") {
    return Response.json({ error: "Esse vídeo ainda não está pronto para virar referência." }, { status: 404 });
  }
  if (!higgsfieldCredentialsConfigured()) {
    return Response.json(
      { error: "Configure HF_API_KEY_ID e HF_API_KEY_SECRET em .env.local. O vídeo não foi reenviado." },
      { status: 503 },
    );
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(localMediaPath(record.id));
  } catch {
    return Response.json({ error: "A cópia local desse vídeo não está disponível." }, { status: 404 });
  }

  try {
    const target = await createHiggsfieldUploadTarget("video/mp4");
    await putFileToHiggsfieldUpload(target, bytes);
    return Response.json({ publicUrl: target.publicUrl, kind: "video" });
  } catch (error) {
    const message = error instanceof HiggsfieldRequestError ? error.message : "Falha ao preparar o vídeo como referência.";
    const status = error instanceof HiggsfieldRequestError && (error.status === 401 || error.status === 403) ? error.status : 502;
    return Response.json({ error: message }, { status });
  }
}
