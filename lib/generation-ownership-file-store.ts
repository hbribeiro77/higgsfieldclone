import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { MODEL_LIMITS, type StudioModelId } from "@/lib/reference-video-request-validation";

export type GenerationStatus =
  | "submitting"
  | "submit_unknown"
  | "queued"
  | "in_progress"
  | "completed"
  | "failed"
  | "nsfw"
  | "canceled";

export type GenerationRecord = {
  id: string;
  ownerId: string;
  clientSubmissionId: string;
  model: StudioModelId;
  prompt: string;
  endpointPath: string;
  requestBody: Record<string, unknown>;
  requestId: string | null;
  statusUrl: string | null;
  cancelUrl: string | null;
  correlationId: string | null;
  status: GenerationStatus;
  error: string | null;
  statusDetail: string | null;
  statusPollStopped: boolean;
  remoteVideoUrl: string | null;
  localMediaReady: boolean;
  pollDelaySeconds: number;
  nextPollAt: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicGeneration = {
  id: string;
  model: StudioModelId;
  modelLabel: string;
  prompt: string;
  status: GenerationStatus;
  error: string | null;
  statusDetail: string | null;
  createdAt: string;
  mediaUrl: string | null;
  remoteVideoUrl: string | null;
  correlationId: string | null;
  polling: boolean;
  duration: number | null;
  resolution: string | null;
  aspectRatio: string | null;
  generateAudio: boolean;
  enableThinking: boolean;
  fileUrl: string | null;
  linkUrl: string | null;
  imageUrls: string[];
  videoUrls: string[];
  audioUrls: string[];
};

type StoreFile = {
  generations: GenerationRecord[];
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let writeQueue: Promise<void> = Promise.resolve();

function storePath(): string {
  return path.join(process.cwd(), "data", "geracoes-do-estudio-de-video.json");
}

export function isGenerationId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function toPublicGeneration(record: GenerationRecord): PublicGeneration {
  const showRemote = record.status === "completed" && !record.localMediaReady;
  const showCorrelation = Boolean(record.error) || record.status === "submit_unknown" || record.status === "failed" || record.status === "nsfw";
  return {
    id: record.id,
    model: record.model,
    modelLabel: MODEL_LIMITS[record.model].label,
    prompt: record.prompt,
    status: record.status,
    error: record.error,
    statusDetail: record.statusDetail,
    createdAt: record.createdAt,
    mediaUrl: record.localMediaReady ? `/api/media/${record.id}` : null,
    remoteVideoUrl: showRemote ? record.remoteVideoUrl : null,
    correlationId: showCorrelation ? record.correlationId : null,
    polling: isStillPolling(record),
    duration: typeof record.requestBody.duration === "number" ? record.requestBody.duration : null,
    resolution: typeof record.requestBody.resolution === "string" ? record.requestBody.resolution : null,
    aspectRatio: typeof record.requestBody.aspect_ratio === "string" ? record.requestBody.aspect_ratio : null,
    generateAudio: record.requestBody.generate_audio !== false,
    enableThinking: record.requestBody.enable_thinking === true,
    fileUrl: typeof record.requestBody.file_url === "string" ? record.requestBody.file_url : null,
    linkUrl: typeof record.requestBody.link_url === "string" ? record.requestBody.link_url : null,
    imageUrls: readStoredUrls(record.requestBody.image_urls),
    videoUrls: readStoredUrls(record.requestBody.video_urls),
    audioUrls: readStoredUrls(record.requestBody.audio_urls),
  };
}

function readStoredUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

function isStillPolling(record: GenerationRecord): boolean {
  if (record.statusPollStopped) return false;
  if (record.status === "submitting" || record.status === "queued" || record.status === "in_progress") return true;
  return record.status === "completed" && !record.localMediaReady && Boolean(record.remoteVideoUrl);
}

export async function listGenerationsForOwner(_ownerId?: string): Promise<GenerationRecord[]> {
  return enqueue(async () => {
    const data = await readStoreUnlocked();
    return data.generations.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  });
}

export async function findGenerationForOwner(_ownerId: string, generationId: string): Promise<GenerationRecord | null> {
  if (!isGenerationId(generationId)) return null;
  return enqueue(async () => {
    const data = await readStoreUnlocked();
    return data.generations.find((generation) => generation.id === generationId) ?? null;
  });
}

export async function claimGenerationSubmission(
  input: Omit<GenerationRecord, "id" | "createdAt" | "updatedAt" | "pollDelaySeconds" | "nextPollAt">,
): Promise<{ record: GenerationRecord; created: boolean }> {
  return enqueue(async () => {
    const data = await readStoreUnlocked();
    const existing = data.generations.find((generation) => generation.clientSubmissionId === input.clientSubmissionId);
    if (existing) return { record: existing, created: false };

    const now = new Date();
    const record: GenerationRecord = {
      ...input,
      id: randomUUID(),
      pollDelaySeconds: 2,
      nextPollAt: new Date(now.getTime() + 2000).toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    data.generations.push(record);
    await persistStore(data);
    return { record, created: true };
  });
}

export async function deleteGeneration(generationId: string): Promise<GenerationRecord | null> {
  if (!isGenerationId(generationId)) return null;
  return enqueue(async () => {
    const data = await readStoreUnlocked();
    const index = data.generations.findIndex((generation) => generation.id === generationId);
    if (index === -1) return null;
    const [removed] = data.generations.splice(index, 1);
    await persistStore(data);
    return removed;
  });
}

export async function updateGeneration(
  generationId: string,
  _ownerId: string,
  patch: Partial<Omit<GenerationRecord, "id" | "ownerId" | "createdAt">>,
): Promise<GenerationRecord | null> {
  return enqueue(async () => {
    const data = await readStoreUnlocked();
    const index = data.generations.findIndex((generation) => generation.id === generationId);
    if (index === -1) return null;
    const current = data.generations[index];
    const updated: GenerationRecord = {
      ...current,
      ...patch,
      id: current.id,
      ownerId: current.ownerId,
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    };
    data.generations[index] = updated;
    await persistStore(data);
    return updated;
  });
}

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(task, task);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function readStoreUnlocked(): Promise<StoreFile> {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as StoreFile;
    if (!parsed || !Array.isArray(parsed.generations)) return { generations: [] };
    return parsed;
  } catch (error) {
    if (isMissingFile(error)) return { generations: [] };
    throw error;
  }
}

async function persistStore(data: StoreFile): Promise<void> {
  await mkdir(path.dirname(storePath()), { recursive: true });
  await writeFile(storePath(), JSON.stringify(data, null, 2), "utf8");
}

function isMissingFile(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
}
