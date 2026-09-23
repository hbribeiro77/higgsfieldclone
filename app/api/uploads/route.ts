import {
  createHiggsfieldUploadTarget,
  higgsfieldCredentialsConfigured,
  HiggsfieldRequestError,
  putFileToHiggsfieldUpload,
} from "@/lib/higgsfield-reference-video-api-client";
import { resolveUploadContentType, UPLOAD_CONTENT_TYPES } from "@/lib/reference-video-request-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REFERENCE_BYTES = 80 * 1024 * 1024;

export async function POST(request: Request) {
  if (!higgsfieldCredentialsConfigured()) {
    return Response.json(
      { error: "Configure HF_API_KEY_ID e HF_API_KEY_SECRET em .env.local. Nenhum arquivo foi enviado." },
      { status: 503 },
    );
  }

  const form = await readForm(request);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Envie o arquivo no campo file." }, { status: 422 });
  }
  if (file.size <= 0 || file.size > MAX_REFERENCE_BYTES) {
    return Response.json({ error: "O arquivo precisa ter até 80 MB." }, { status: 422 });
  }

  const contentType = resolveUploadContentType(file.name, file.type);
  if (!contentType || !(contentType in UPLOAD_CONTENT_TYPES)) {
    return Response.json({ error: "Use JPEG, PNG, WebP, GIF, WAV ou MP4." }, { status: 422 });
  }

  try {
    const target = await createHiggsfieldUploadTarget(contentType);
    const bytes = Buffer.from(await file.arrayBuffer());
    await putFileToHiggsfieldUpload(target, bytes);
    return Response.json({
      publicUrl: target.publicUrl,
      kind: UPLOAD_CONTENT_TYPES[contentType],
    });
  } catch (error) {
    const message = error instanceof HiggsfieldRequestError ? error.message : "Falha ao enviar a referência.";
    const status = error instanceof HiggsfieldRequestError ? error.status : 0;
    const httpStatus = status === 401 || status === 403 ? status : 502;
    return Response.json({ error: message }, { status: httpStatus });
  }
}

async function readForm(request: Request): Promise<FormData | null> {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}
