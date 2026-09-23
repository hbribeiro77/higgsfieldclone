export const WAN_MODEL_ID = "wan-3.0";
export const SEEDANCE_MODEL_ID = "seedance-2.0";

const HIGGSFIELD_API_ORIGIN = "https://api.higgsfield.ai";
const HIGGSFIELD_STATUS_ORIGINS = new Set([
  "https://api.higgsfield.ai",
  "https://platform.higgsfield.ai",
]);

export const MODEL_LIMITS = {
  [WAN_MODEL_ID]: {
    label: "Wan 3.0",
    endpointPath: "/alibaba/wan-3.0/reference-to-video",
    duration: { min: 2, max: 30, default: 5 },
    resolutions: ["480p", "720p", "1080p"],
    defaultResolution: "1080p",
    aspectRatios: ["16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"],
    defaultAspectRatio: "adaptive",
    maxImages: 10,
    maxVideos: 5,
    maxAudios: 5,
    requiresVisualReference: false,
    supportsThinking: true,
    supportsDocumentOrLink: true,
  },
  [SEEDANCE_MODEL_ID]: {
    label: "Seedance 2.0",
    endpointPath: "/bytedance/seedance-2.0/reference-to-video",
    duration: { min: 4, max: 15, default: 5 },
    resolutions: ["480p", "720p", "1080p", "4k"],
    defaultResolution: "720p",
    aspectRatios: ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"],
    defaultAspectRatio: "16:9",
    maxImages: 9,
    maxVideos: 3,
    maxAudios: 3,
    requiresVisualReference: true,
    supportsThinking: false,
    supportsDocumentOrLink: false,
  },
} as const;

export type StudioModelId = keyof typeof MODEL_LIMITS;

export const UPLOAD_CONTENT_TYPES: Record<string, "image" | "video" | "audio"> = {
  "image/jpeg": "image",
  "image/jpg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "audio/wav": "audio",
  "audio/x-wav": "audio",
  "video/mp4": "video",
};

const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
};

export type ReferenceVideoRequestInput = {
  model?: unknown;
  prompt?: unknown;
  duration?: unknown;
  resolution?: unknown;
  aspectRatio?: unknown;
  generateAudio?: unknown;
  enableThinking?: unknown;
  imageUrls?: unknown;
  videoUrls?: unknown;
  audioUrls?: unknown;
  fileUrl?: unknown;
  linkUrl?: unknown;
  seed?: unknown;
};

export type ValidatedReferenceVideoRequest = {
  model: StudioModelId;
  endpointPath: string;
  body: Record<string, unknown>;
};

export type ReferenceVideoValidationResult =
  | { ok: true; value: ValidatedReferenceVideoRequest }
  | { ok: false; errors: string[] };

export function resolveUploadContentType(fileName: string, browserType: string): string | null {
  const normalizedType = browserType.trim().toLowerCase();
  if (normalizedType in UPLOAD_CONTENT_TYPES) {
    return normalizedType === "image/jpg" ? "image/jpeg" : normalizedType;
  }
  const dot = fileName.lastIndexOf(".");
  if (dot === -1) return null;
  return EXTENSION_CONTENT_TYPES[fileName.slice(dot).toLowerCase()] ?? null;
}

export type AcceptedHiggsfieldSubmission = {
  requestId: string;
  statusUrl: string;
  status: string;
  cancelUrl: string | null;
};

export function isAllowedStatusUrl(statusUrl: string): boolean {
  return isHiggsfieldRequestUrl(statusUrl, "/status");
}

export function isAllowedCancelUrl(cancelUrl: string): boolean {
  return isHiggsfieldRequestUrl(cancelUrl, "/cancel");
}

export function readAcceptedHiggsfieldSubmission(body: unknown): AcceptedHiggsfieldSubmission | null {
  const record = firstRecord(body);
  if (!record) return null;

  const requestId = readResponseString(record, "request_id") ?? readResponseString(record, "requestId");
  const status = readResponseString(record, "status") ?? "queued";
  let statusUrl = readResponseString(record, "status_url") ?? readResponseString(record, "statusUrl");
  let cancelUrl = readResponseString(record, "cancel_url") ?? readResponseString(record, "cancelUrl");

  if ((!statusUrl || !isAllowedStatusUrl(statusUrl)) && requestId && isSafeRequestId(requestId)) {
    statusUrl = `${HIGGSFIELD_API_ORIGIN}/requests/${requestId}/status`;
  }
  if (!requestId || !statusUrl || !isAllowedStatusUrl(statusUrl)) return null;
  if (!cancelUrl || !isAllowedCancelUrl(cancelUrl)) cancelUrl = null;

  return { requestId, statusUrl, status, cancelUrl };
}

function isHiggsfieldRequestUrl(value: string, suffix: string): boolean {
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/+$/, "");
    return HIGGSFIELD_STATUS_ORIGINS.has(url.origin) && path.startsWith("/requests/") && path.endsWith(suffix);
  } catch {
    return false;
  }
}

function firstRecord(body: unknown): Record<string, unknown> | null {
  const record = asResponseRecord(body);
  if (!record) return null;
  if (readResponseString(record, "request_id") || readResponseString(record, "requestId") || readResponseString(record, "status_url")) {
    return record;
  }
  return asResponseRecord(record.data) ?? asResponseRecord(record.result) ?? record;
}

function asResponseRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readResponseString(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isSafeRequestId(value: string): boolean {
  return /^[0-9a-f-]{8,80}$/i.test(value);
}

export function readHiggsfieldCostEstimate(body: unknown): { credits: string; usd: string } | null {
  const record = asResponseRecord(body);
  const nested = asResponseRecord(record?.data) ?? asResponseRecord(record?.result);
  const source = readNumericLike(record, "usd") || readNumericLike(record, "credits") ? record : nested ?? record;
  if (!source) return null;
  const usd = readNumericLike(source, "usd");
  const credits = readNumericLike(source, "credits");
  if (!usd && !credits) return null;
  return { usd: usd ?? "", credits: credits ?? "" };
}

export function formatUsdEstimateLabel(usd: string): string | null {
  const value = Number(usd);
  if (!usd.trim() || !Number.isFinite(value)) return null;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "USD" }).replace(/\u00a0/g, " ");
}

function readNumericLike(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return value.trim();
  return null;
}

export function validateReferenceVideoRequest(
  input: ReferenceVideoRequestInput,
  options?: { forEstimate?: boolean },
): ReferenceVideoValidationResult {
  const errors: string[] = [];
  const model = input.model;
  if (model !== WAN_MODEL_ID && model !== SEEDANCE_MODEL_ID) {
    return { ok: false, errors: ["Escolha Wan 3.0 ou Seedance 2.0."] };
  }

  const limits = MODEL_LIMITS[model];
  const prompt = readOptionalString(input.prompt);
  if (model === WAN_MODEL_ID) {
    if (!prompt && !options?.forEstimate) errors.push("O Wan 3.0 exige um prompt.");
  } else if (input.prompt !== undefined && input.prompt !== null && input.prompt !== "" && !prompt) {
    errors.push("O prompt não pode ficar em branco.");
  } else if (typeof input.prompt === "string" && input.prompt.trim().length === 0 && input.prompt.length > 0) {
    errors.push("O prompt não pode ficar em branco.");
  }

  const duration = readInteger(input.duration, limits.duration.default, "Duração", limits.duration.min, limits.duration.max, errors);
  const resolution = readEnum(input.resolution, limits.resolutions, limits.defaultResolution, "Resolução", errors);
  const aspectRatio = readEnum(input.aspectRatio, limits.aspectRatios, limits.defaultAspectRatio, "Proporção", errors);
  const generateAudio = readBoolean(input.generateAudio, true, "Som", errors);

  const imageUrls = readUrlList(input.imageUrls, "Imagens", limits.maxImages, errors);
  const videoUrls = readUrlList(input.videoUrls, "Vídeos", limits.maxVideos, errors);
  const audioUrls = readUrlList(input.audioUrls, "Áudios", limits.maxAudios, errors);

  if (limits.requiresVisualReference && !options?.forEstimate && imageUrls.length === 0 && videoUrls.length === 0) {
    errors.push("O Seedance 2.0 exige pelo menos uma imagem ou um vídeo. Áudio sozinho não basta.");
  }

  const fileUrl = readOptionalUrl(input.fileUrl, "Documento", errors);
  let linkUrl = readOptionalUrl(input.linkUrl, "Página", errors);
  let enableThinking = false;

  if (model === SEEDANCE_MODEL_ID) {
    if (fileUrl || linkUrl || input.enableThinking !== undefined) {
      if (fileUrl || linkUrl) {
        errors.push("O Seedance 2.0 não aceita documento nem página.");
      }
      if (input.enableThinking !== undefined) {
        errors.push("O Seedance 2.0 não aceita deep thinking.");
      }
    }
  } else {
    enableThinking = readBoolean(input.enableThinking, false, "Deep thinking", errors);
    if (fileUrl && linkUrl) {
      linkUrl = undefined;
    }
  }

  const seed = readOptionalSeed(input.seed, errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const body: Record<string, unknown> = {
    duration,
    resolution,
    aspect_ratio: aspectRatio,
    generate_audio: generateAudio,
  };

  if (prompt) body.prompt = prompt;
  if (imageUrls.length > 0) body.image_urls = imageUrls;
  if (videoUrls.length > 0) body.video_urls = videoUrls;
  if (audioUrls.length > 0) body.audio_urls = audioUrls;

  if (model === WAN_MODEL_ID) {
    body.enable_thinking = enableThinking;
    if (fileUrl) body.file_url = fileUrl;
    else if (linkUrl) body.link_url = linkUrl;
    if (seed !== undefined) body.seed = seed;
  }

  return {
    ok: true,
    value: {
      model,
      endpointPath: limits.endpointPath,
      body,
    },
  };
}

function readOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readInteger(
  value: unknown,
  fallback: number,
  label: string,
  min: number,
  max: number,
  errors: string[],
): number {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    errors.push(`${label} precisa ser um número inteiro.`);
    return fallback;
  }
  if (value < min || value > max) {
    errors.push(`${label} precisa ficar entre ${min} e ${max} segundos.`);
    return fallback;
  }
  return value;
}

function readEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  label: string,
  errors: string[],
): T {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    errors.push(`${label} não é aceita por este modelo.`);
    return fallback;
  }
  return value as T;
}

function readBoolean(value: unknown, fallback: boolean, label: string, errors: string[]): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") {
    errors.push(`${label} precisa ser verdadeiro ou falso.`);
    return fallback;
  }
  return value;
}

function readUrlList(value: unknown, label: string, max: number, errors: string[]): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    errors.push(`${label} precisam ser uma lista de URLs.`);
    return [];
  }
  if (value.length > max) {
    errors.push(`${label}: no máximo ${max}.`);
  }
  const urls: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !isPublicHttpsUrl(item)) {
      errors.push(`${label} só aceitam URLs https públicas.`);
      return urls;
    }
    urls.push(item);
  }
  return urls.slice(0, max);
}

function readOptionalUrl(value: unknown, label: string, errors: string[]): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !isPublicHttpsUrl(value)) {
    errors.push(`${label} precisa ser uma URL https pública.`);
    return undefined;
  }
  return value;
}

function readOptionalSeed(value: unknown, errors: string[]): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    errors.push("A semente precisa ser um número inteiro.");
    return undefined;
  }
  if (value < 0 || value > 2147483647) {
    errors.push("A semente fica fora do intervalo aceito.");
    return undefined;
  }
  if (value === 0) return undefined;
  return value;
}

export function isPublicHttpsUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".localhost")) return false;
  if (host === "0.0.0.0" || host === "::" || host === "::1") return false;
  if (isPrivateIpv4(host) || isPrivateIpv6(host)) return false;
  return true;
}

function isPrivateIpv4(host: string): boolean {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  if (parts.some((part) => part > 255)) return true;
  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const normalized = host.toLowerCase();
  return normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe80:");
}
