import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  fetchReferenceVideoStatus,
  HiggsfieldRequestError,
} from "@/lib/higgsfield-reference-video-api-client";
import {
  updateGeneration,
  type GenerationRecord,
  type GenerationStatus,
} from "@/lib/generation-ownership-file-store";
import { isPublicHttpsUrl } from "@/lib/reference-video-request-validation";

const TERMINAL_STATUSES = new Set<GenerationStatus>(["completed", "failed", "nsfw", "canceled", "submit_unknown"]);
const KNOWN_STATUSES = new Set<GenerationStatus>([
  "queued",
  "in_progress",
  "completed",
  "failed",
  "nsfw",
  "canceled",
]);

export function localMediaPath(generationId: string): string {
  return path.join(process.cwd(), "data", "media", `${generationId}.mp4`);
}

export async function refreshOwnedGenerationStatus(record: GenerationRecord): Promise<GenerationRecord> {
  if (record.status === "submitting") {
    const ageMs = Date.now() - Date.parse(record.updatedAt);
    if (ageMs > 120_000) {
      return (await updateGeneration(record.id, record.ownerId, {
        status: "submit_unknown",
        error: "O envio não foi confirmado. Ele não foi repetido.",
        statusPollStopped: true,
      })) ?? record;
    }
    return record;
  }

  if (record.statusPollStopped) return record;
  if (TERMINAL_STATUSES.has(record.status) && !(record.status === "completed" && !record.localMediaReady && record.remoteVideoUrl)) {
    return record;
  }
  if (Date.parse(record.nextPollAt) > Date.now()) return record;
  if (!record.statusUrl) return record;

  let statusResponse;
  try {
    statusResponse = await fetchReferenceVideoStatus(record.statusUrl);
  } catch (error) {
    const message = error instanceof HiggsfieldRequestError
      ? error.message
      : "Falha de rede ao consultar o status. A geração não foi reenviada.";
    return scheduleAnotherStatusCheck(record, message);
  }

  if (statusResponse.httpStatus === 401) {
    return (await updateGeneration(record.id, record.ownerId, {
      statusPollStopped: true,
      statusDetail: null,
      error: "Credenciais inválidas ao consultar o status.",
      correlationId: statusResponse.correlationId ?? record.correlationId,
    })) ?? record;
  }

  if (statusResponse.httpStatus === 404) {
    return (await updateGeneration(record.id, record.ownerId, {
      status: "failed",
      statusPollStopped: true,
      error: "Pedido não encontrado nesta conta.",
      correlationId: statusResponse.correlationId ?? record.correlationId,
    })) ?? record;
  }

  if (statusResponse.httpStatus !== 200) {
    return scheduleAnotherStatusCheck(record, "A consulta de status teve uma resposta temporária.");
  }

  const payload = asRecord(statusResponse.body);
  const incomingStatus = typeof payload?.status === "string" ? payload.status : "";
  if (!KNOWN_STATUSES.has(incomingStatus as GenerationStatus)) {
    return scheduleAnotherStatusCheck(record, "A Higgsfield devolveu um status desconhecido.");
  }

  const status = incomingStatus as GenerationStatus;
  const remoteVideoUrl = readVideoUrl(payload);
  let localMediaReady = record.localMediaReady;
  let error = typeof payload?.error === "string" ? payload.error : null;
  if (status === "nsfw") {
    error = "A moderação recusou a entrada ou o resultado.";
  }

  if (status === "completed" && remoteVideoUrl && !localMediaReady) {
    try {
      await saveRemoteVideo(record.id, remoteVideoUrl);
      localMediaReady = true;
    } catch {
      localMediaReady = false;
    }
  }

  const terminal = TERMINAL_STATUSES.has(status);
  const updated = await updateGeneration(record.id, record.ownerId, {
    status,
    error: status === "completed" ? null : error,
    statusDetail: status === "completed" && !localMediaReady ? "O vídeo remoto está disponível. A cópia local ainda não foi salva." : null,
    statusPollStopped: terminal && (status !== "completed" || localMediaReady || !remoteVideoUrl),
    remoteVideoUrl: remoteVideoUrl ?? record.remoteVideoUrl,
    localMediaReady,
    correlationId: statusResponse.correlationId ?? record.correlationId,
    ...(terminal ? {} : nextPollSchedule(record.pollDelaySeconds)),
  });
  return updated ?? record;
}

async function scheduleAnotherStatusCheck(record: GenerationRecord, statusDetail: string): Promise<GenerationRecord> {
  return (await updateGeneration(record.id, record.ownerId, {
    statusDetail,
    ...nextPollSchedule(record.pollDelaySeconds),
  })) ?? record;
}

function nextPollSchedule(currentDelaySeconds: number): { pollDelaySeconds: number; nextPollAt: string } {
  const grown = Math.min(currentDelaySeconds * 1.5, 10);
  const jitterSeconds = Math.random() * 0.5;
  return {
    pollDelaySeconds: grown,
    nextPollAt: new Date(Date.now() + (grown + jitterSeconds) * 1000).toISOString(),
  };
}

async function saveRemoteVideo(generationId: string, remoteVideoUrl: string): Promise<void> {
  if (!isPublicHttpsUrl(remoteVideoUrl)) {
    throw new Error("URL de vídeo recusada.");
  }
  const response = await fetch(remoteVideoUrl, {
    redirect: "manual",
    signal: AbortSignal.timeout(120_000),
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error("O vídeo remoto tentou redirecionar.");
  }
  if (!response.ok) {
    throw new Error("Falha ao baixar o vídeo.");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const destination = localMediaPath(generationId);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
}

function readVideoUrl(payload: Record<string, unknown> | null): string | null {
  const video = asRecord(payload?.video);
  const url = video?.url;
  return typeof url === "string" && isPublicHttpsUrl(url) ? url : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
