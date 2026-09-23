import {
  claimGenerationSubmission,
  isGenerationId,
  listGenerationsForOwner,
  toPublicGeneration,
  updateGeneration,
  type GenerationStatus,
} from "@/lib/generation-ownership-file-store";
import {
  higgsfieldCredentialsConfigured,
  HiggsfieldRequestError,
  submitReferenceVideo,
} from "@/lib/higgsfield-reference-video-api-client";
import { validateReferenceVideoRequest } from "@/lib/reference-video-request-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCEPTED_STATUSES = new Set<GenerationStatus>(["queued", "in_progress", "completed", "failed", "nsfw", "canceled"]);

const STUDIO_OWNER_ID = "estudio";

export async function GET() {
  const generations = await listGenerationsForOwner();
  return Response.json({
    credentialsConfigured: higgsfieldCredentialsConfigured(),
    generations: generations.map(toPublicGeneration),
  });
}

export async function POST(request: Request) {
  const payload = await readJson(request);
  if (!payload) {
    return Response.json({ error: "Envie um JSON válido." }, { status: 422 });
  }

  const clientSubmissionId = payload.clientSubmissionId;
  if (typeof clientSubmissionId !== "string" || !isGenerationId(clientSubmissionId)) {
    return Response.json({ error: "Identificador de envio inválido." }, { status: 422 });
  }

  const validated = validateReferenceVideoRequest(payload);
  if (!validated.ok) {
    return Response.json({ error: validated.errors.join(" ") }, { status: 422 });
  }

  if (!higgsfieldCredentialsConfigured()) {
    return Response.json(
      { error: "Configure HF_API_KEY_ID e HF_API_KEY_SECRET em .env.local. A geração não foi enviada." },
      { status: 503 },
    );
  }

  const claimed = await claimGenerationSubmission({
    ownerId: STUDIO_OWNER_ID,
    clientSubmissionId,
    model: validated.value.model,
    prompt: typeof validated.value.body.prompt === "string" ? validated.value.body.prompt : "",
    endpointPath: validated.value.endpointPath,
    requestBody: validated.value.body,
    requestId: null,
    statusUrl: null,
    cancelUrl: null,
    correlationId: null,
    status: "submitting",
    error: null,
    statusDetail: null,
    statusPollStopped: false,
    remoteVideoUrl: null,
    localMediaReady: false,
  });

  if (!claimed.created) {
    return Response.json({ generation: toPublicGeneration(claimed.record) });
  }

  try {
    const submitted = await submitReferenceVideo(validated.value.endpointPath, validated.value.body);
    const status = ACCEPTED_STATUSES.has(submitted.status as GenerationStatus)
      ? (submitted.status as GenerationStatus)
      : "queued";
    const updated = await updateGeneration(claimed.record.id, STUDIO_OWNER_ID, {
      requestId: submitted.requestId,
      statusUrl: submitted.statusUrl,
      cancelUrl: submitted.cancelUrl,
      correlationId: submitted.correlationId,
      status,
      error: null,
      statusPollStopped: false,
    });
    return Response.json({ generation: toPublicGeneration(updated ?? claimed.record) }, { status: 201 });
  } catch (error) {
    const higgsfieldError = error instanceof HiggsfieldRequestError ? error : null;
    const unconfirmed = !higgsfieldError || higgsfieldError.status === 0;
    const updated = await updateGeneration(claimed.record.id, STUDIO_OWNER_ID, {
      status: unconfirmed ? "submit_unknown" : "failed",
      error: higgsfieldError?.message ?? "Falha ao enviar a geração. O envio não foi repetido.",
      correlationId: higgsfieldError?.correlationId ?? null,
      statusPollStopped: true,
    });
    return Response.json(
      {
        error: updated?.error ?? "Falha ao enviar a geração. O envio não foi repetido.",
        generation: toPublicGeneration(updated ?? claimed.record),
      },
      { status: unconfirmed ? 504 : 502 },
    );
  }
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const payload = (await request.json()) as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}
