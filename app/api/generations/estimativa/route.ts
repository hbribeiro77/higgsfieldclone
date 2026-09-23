import { quoteFromPricingDescription } from "@/lib/calculo-da-estimativa-de-custo-da-geracao";
import {
  higgsfieldCredentialsConfigured,
  HiggsfieldRequestError,
  estimateReferenceVideo,
} from "@/lib/higgsfield-reference-video-api-client";
import {
  formatUsdEstimateLabel,
  SEEDANCE_MODEL_ID,
  validateReferenceVideoRequest,
  WAN_MODEL_ID,
} from "@/lib/reference-video-request-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await readJson(request);
  if (!payload) {
    return Response.json({ error: "Envie um JSON válido." }, { status: 422 });
  }

  const validated = validateReferenceVideoRequest(payload, { forEstimate: true });
  if (!validated.ok) {
    return Response.json({ error: validated.errors.join(" ") }, { status: 422 });
  }

  if (!higgsfieldCredentialsConfigured()) {
    return Response.json({ error: "Configure as chaves da Higgsfield para ver o custo." }, { status: 503 });
  }

  const body = { ...validated.value.body };
  if (validated.value.model === WAN_MODEL_ID && typeof body.prompt !== "string") {
    body.prompt = "estimativa";
  }
  const hasVideoReference = Array.isArray(body.video_urls) && body.video_urls.length > 0;
  if (validated.value.model === SEEDANCE_MODEL_ID && !hasVideoReference && !Array.isArray(body.image_urls)) {
    body.image_urls = ["https://example.com/referencia.jpg"];
  }

  try {
    const estimate = await estimateReferenceVideo(validated.value.endpointPath, body);
    if ("pricingDescription" in estimate) {
      const usd = quoteFromPricingDescription(estimate.pricingDescription, {
        duration: typeof body.duration === "number" ? body.duration : 0,
        resolution: typeof body.resolution === "string" ? body.resolution : "",
        aspectRatio: typeof body.aspect_ratio === "string" ? body.aspect_ratio : "",
        inputVideoSeconds: 0,
        hasVideoReference,
      });
      const label = usd === null ? null : formatUsdEstimateLabel(String(usd));
      if (!label) {
        return Response.json({ error: "A Higgsfield não devolveu o custo desta geração." }, { status: 502 });
      }
      const note = hasVideoReference
        ? "Valor de tabela, antes de desconto. Os segundos dos vídeos de referência entram na conta e não estão neste valor."
        : "Valor de tabela, antes de desconto da conta.";
      return Response.json({ usd: String(usd), label, note });
    }
    return Response.json({
      usd: estimate.usd,
      credits: estimate.credits,
      label: formatUsdEstimateLabel(estimate.usd),
    });
  } catch (error) {
    const message = error instanceof HiggsfieldRequestError ? error.message : "Não foi possível calcular o custo.";
    const status = error instanceof HiggsfieldRequestError && error.status === 401 ? 401 : 502;
    return Response.json({ error: message }, { status });
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
