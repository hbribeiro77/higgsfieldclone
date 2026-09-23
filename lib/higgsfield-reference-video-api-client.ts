import {
  isAllowedStatusUrl,
  isPublicHttpsUrl,
  readAcceptedHiggsfieldSubmission,
} from "@/lib/reference-video-request-validation";

const HIGGSFIELD_API_ORIGIN = "https://api.higgsfield.ai";

export type HiggsfieldCredentials = {
  keyId: string;
  keySecret: string;
};

export type HiggsfieldUploadTarget = {
  publicUrl: string;
  uploadUrl: string;
  uploadHeaders: Record<string, string>;
  correlationId: string | null;
};

export type SubmittedReferenceVideo = {
  status: string;
  requestId: string;
  statusUrl: string;
  cancelUrl: string | null;
  correlationId: string | null;
};

export type HiggsfieldStatusResponse = {
  httpStatus: number;
  correlationId: string | null;
  body: unknown;
};

export class HiggsfieldRequestError extends Error {
  readonly status: number;
  readonly correlationId: string | null;

  constructor(message: string, status: number, correlationId: string | null) {
    super(message);
    this.name = "HiggsfieldRequestError";
    this.status = status;
    this.correlationId = correlationId;
  }
}

export function higgsfieldCredentials(): HiggsfieldCredentials | null {
  const keyId = process.env.HF_API_KEY_ID?.trim() ?? "";
  const keySecret = process.env.HF_API_KEY_SECRET?.trim() ?? "";
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

export function higgsfieldCredentialsConfigured(): boolean {
  return higgsfieldCredentials() !== null;
}

export async function createHiggsfieldUploadTarget(contentType: string): Promise<HiggsfieldUploadTarget> {
  const response = await higgsfieldFetch("/files/generate-upload-url", {
    method: "POST",
    body: JSON.stringify({ content_type: contentType }),
  });
  const payload = asRecord(response.body);
  const publicUrl = readString(payload, "public_url");
  const uploadUrl = readString(payload, "upload_url");
  const uploadHeaders = readStringRecord(payload?.upload_headers);
  if (!publicUrl || !isPublicHttpsUrl(publicUrl) || !uploadUrl || !isPublicHttpsUrl(uploadUrl) || !uploadHeaders) {
    throw new HiggsfieldRequestError(
      "A Higgsfield não devolveu um destino de upload utilizável.",
      response.httpStatus,
      response.correlationId,
    );
  }
  return {
    publicUrl,
    uploadUrl,
    uploadHeaders,
    correlationId: response.correlationId,
  };
}

export async function putFileToHiggsfieldUpload(
  target: HiggsfieldUploadTarget,
  bytes: Buffer,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(target.uploadUrl, {
      method: "PUT",
      headers: target.uploadHeaders,
      body: new Uint8Array(bytes),
      redirect: "manual",
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new HiggsfieldRequestError("Não foi possível enviar o arquivo de referência.", 0, target.correlationId);
  }
  if (response.status >= 300 && response.status < 400) {
    throw new HiggsfieldRequestError("O destino do arquivo recusou o redirecionamento.", response.status, null);
  }
  if (!response.ok) {
    throw new HiggsfieldRequestError("O envio do arquivo de referência falhou.", response.status, null);
  }
}

export async function submitReferenceVideo(
  endpointPath: string,
  body: Record<string, unknown>,
): Promise<SubmittedReferenceVideo> {
  if (!endpointPath.startsWith("/")) {
    throw new HiggsfieldRequestError("Endpoint de geração inválido.", 0, null);
  }
  const response = await higgsfieldFetch(endpointPath, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const accepted = readAcceptedHiggsfieldSubmission(response.body);
  if (!accepted) {
    console.error(
      `Resposta Higgsfield sem pedido acompanhável status=${response.httpStatus} keys=${responseKeys(response.body)} correlation=${response.correlationId ?? "ausente"}`,
    );
    throw new HiggsfieldRequestError(
      "A Higgsfield aceitou a conexão, mas não devolveu um pedido acompanhável. O envio não foi repetido.",
      response.httpStatus,
      response.correlationId,
    );
  }
  return {
    status: accepted.status,
    requestId: accepted.requestId,
    statusUrl: accepted.statusUrl,
    cancelUrl: accepted.cancelUrl,
    correlationId: response.correlationId,
  };
}

export async function fetchReferenceVideoStatus(statusUrl: string): Promise<HiggsfieldStatusResponse> {
  if (!isAllowedStatusUrl(statusUrl)) {
    throw new HiggsfieldRequestError("URL de status fora da API Higgsfield.", 0, null);
  }
  const credentials = requireCredentials();
  let response: Response;
  try {
    response = await fetch(statusUrl, {
      method: "GET",
      headers: { Authorization: authorizationHeader(credentials) },
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new HiggsfieldRequestError("Falha de rede ao consultar o status.", 0, null);
  }
  const correlationId = response.headers.get("x-correlation-id");
  if (response.status >= 300 && response.status < 400) {
    throw new HiggsfieldRequestError("A consulta de status tentou redirecionar para fora.", response.status, correlationId);
  }
  const body = await readJsonBody(response);
  return { httpStatus: response.status, correlationId, body };
}

async function higgsfieldFetch(pathname: string, init: { method: string; body: string }): Promise<HiggsfieldStatusResponse> {
  const credentials = requireCredentials();
  const url = new URL(pathname, HIGGSFIELD_API_ORIGIN);
  if (url.origin !== HIGGSFIELD_API_ORIGIN) {
    throw new HiggsfieldRequestError("Endpoint fora da API Higgsfield.", 0, null);
  }
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method,
      headers: {
        Authorization: authorizationHeader(credentials),
        "Content-Type": "application/json",
      },
      body: init.body,
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new HiggsfieldRequestError(
      "Não foi possível confirmar o envio para a Higgsfield. Ele não foi repetido.",
      0,
      null,
    );
  }
  const correlationId = response.headers.get("x-correlation-id");
  if (response.status >= 300 && response.status < 400) {
    throw new HiggsfieldRequestError("A Higgsfield tentou redirecionar o pedido.", response.status, correlationId);
  }
  const body = await readJsonBody(response);
  if (!response.ok) {
    console.error(`Higgsfield ${response.status} em ${pathname} correlation=${correlationId ?? "ausente"}`);
    throw new HiggsfieldRequestError(messageForStatus(response.status, body), response.status, correlationId);
  }
  return { httpStatus: response.status, correlationId, body };
}

function requireCredentials(): HiggsfieldCredentials {
  const credentials = higgsfieldCredentials();
  if (!credentials) {
    throw new HiggsfieldRequestError(
      "Configure HF_API_KEY_ID e HF_API_KEY_SECRET em .env.local. A geração não foi enviada.",
      503,
      null,
    );
  }
  return credentials;
}

function authorizationHeader(credentials: HiggsfieldCredentials): string {
  return `Key ${credentials.keyId}:${credentials.keySecret}`;
}

function messageForStatus(status: number, body: unknown): string {
  const detail = detailText(body);
  if (status === 401) return "Credenciais inválidas. Confira HF_API_KEY_ID e HF_API_KEY_SECRET.";
  if (status === 403) return "Créditos insuficientes na conta Higgsfield.";
  if (status === 404) return "Modelo ou pedido não encontrado nesta conta.";
  if (status === 422) return "A Higgsfield recusou os parâmetros deste pedido.";
  if (status === 423) return "O modelo está temporariamente bloqueado.";
  if (status === 503) return "O modelo está indisponível agora.";
  if (status === 400 && /concurrent/i.test(detail)) {
    return "A conta atingiu o máximo de gerações ao mesmo tempo. Espere uma terminar.";
  }
  if (status === 400) return "A Higgsfield recusou o pedido. Revise o prompt e as referências.";
  if (status >= 500) return "Erro temporário na Higgsfield. Este envio não foi repetido.";
  return "A Higgsfield recusou o pedido.";
}

function detailText(body: unknown): string {
  const record = asRecord(body);
  const detail = record?.detail;
  return typeof detail === "string" ? detail : "";
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readStringRecord(value: unknown): Record<string, string> | null {
  const record = asRecord(value);
  if (!record) return null;
  const headers: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(record)) {
    if (typeof headerValue !== "string") return null;
    headers[key] = headerValue;
  }
  return headers;
}

function responseKeys(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return typeof body;
  return Object.keys(body).join(",");
}
