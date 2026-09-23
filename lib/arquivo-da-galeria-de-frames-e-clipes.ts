import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateClipRange, validateFrameTime } from "@/lib/validacao-de-recorte-de-frame-e-clipe";

export type GalleryKind = "image" | "video";

export type GalleryItem = {
  id: string;
  kind: GalleryKind;
  sourceGenerationId: string;
  label: string;
  createdAt: string;
  timeSeconds: number | null;
  startSeconds: number | null;
  endSeconds: number | null;
};

type GalleryFile = { items: GalleryItem[] };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let writeQueue: Promise<void> = Promise.resolve();

export function galleryRoot(): string {
  return path.join(process.cwd(), "data", "galeria");
}

export function galleryItemPath(item: Pick<GalleryItem, "id" | "kind">): string {
  const folder = item.kind === "image" ? "imagens" : "clipes";
  const extension = item.kind === "image" ? "jpg" : "mp4";
  return path.join(galleryRoot(), folder, `${item.id}.${extension}`);
}

export function toPublicGalleryItem(item: GalleryItem) {
  return { ...item, mediaUrl: `/api/galeria/${item.id}` };
}

export function isGalleryId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export async function listGalleryItems(): Promise<GalleryItem[]> {
  const data = await readGallery();
  return data.items.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function deleteGalleryItem(id: string): Promise<boolean> {
  if (!isGalleryId(id)) return false;
  const removed = await enqueue(async () => {
    const data = await readGallery();
    const item = data.items.find((entry) => entry.id === id) ?? null;
    if (!item) return null;
    data.items = data.items.filter((entry) => entry.id !== id);
    await mkdir(galleryRoot(), { recursive: true });
    await writeFile(path.join(galleryRoot(), "indice-da-galeria.json"), JSON.stringify(data, null, 2), "utf8");
    return item;
  });
  if (!removed) return false;
  await rm(galleryItemPath(removed), { force: true });
  return true;
}

export async function findGalleryItem(id: string): Promise<GalleryItem | null> {
  if (!isGalleryId(id)) return null;
  const data = await readGallery();
  return data.items.find((item) => item.id === id) ?? null;
}

export async function saveFrameFromVideo(input: {
  sourcePath: string;
  sourceGenerationId: string;
  timeSeconds: number;
}): Promise<GalleryItem> {
  const duration = await probeDurationSeconds(input.sourcePath);
  const error = validateFrameTime(input.timeSeconds, duration);
  if (error) throw new Error(error);
  const item = newItem("image", input.sourceGenerationId, `Frame em ${input.timeSeconds.toFixed(1)}s`, {
    timeSeconds: input.timeSeconds,
  });
  await mkdir(path.dirname(galleryItemPath(item)), { recursive: true });
  await runTool("ffmpeg", [
    "-y",
    "-i",
    input.sourcePath,
    "-ss",
    String(input.timeSeconds),
    "-frames:v",
    "1",
    "-q:v",
    "2",
    galleryItemPath(item),
  ]);
  await remember(item);
  return item;
}

export async function saveClipFromVideo(input: {
  sourcePath: string;
  sourceGenerationId: string;
  startSeconds: number;
  endSeconds: number;
}): Promise<GalleryItem> {
  const duration = await probeDurationSeconds(input.sourcePath);
  const error = validateClipRange(input.startSeconds, input.endSeconds, duration);
  if (error) throw new Error(error);
  const item = newItem(
    "video",
    input.sourceGenerationId,
    `Clipe ${input.startSeconds.toFixed(1)}s–${input.endSeconds.toFixed(1)}s`,
    { startSeconds: input.startSeconds, endSeconds: input.endSeconds },
  );
  await mkdir(path.dirname(galleryItemPath(item)), { recursive: true });
  await runTool("ffmpeg", [
    "-y",
    "-i",
    input.sourcePath,
    "-ss",
    String(input.startSeconds),
    "-to",
    String(input.endSeconds),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    galleryItemPath(item),
  ]);
  await remember(item);
  return item;
}

function newItem(
  kind: GalleryKind,
  sourceGenerationId: string,
  label: string,
  times: { timeSeconds?: number; startSeconds?: number; endSeconds?: number },
): GalleryItem {
  return {
    id: randomUUID(),
    kind,
    sourceGenerationId,
    label,
    createdAt: new Date().toISOString(),
    timeSeconds: times.timeSeconds ?? null,
    startSeconds: times.startSeconds ?? null,
    endSeconds: times.endSeconds ?? null,
  };
}

async function remember(item: GalleryItem): Promise<void> {
  await enqueue(async () => {
    const data = await readGallery();
    data.items.push(item);
    await mkdir(galleryRoot(), { recursive: true });
    await writeFile(path.join(galleryRoot(), "indice-da-galeria.json"), JSON.stringify(data, null, 2), "utf8");
  });
}

async function readGallery(): Promise<GalleryFile> {
  try {
    const raw = await readFile(path.join(galleryRoot(), "indice-da-galeria.json"), "utf8");
    const parsed = JSON.parse(raw) as GalleryFile;
    return { items: Array.isArray(parsed.items) ? parsed.items : [] };
  } catch {
    return { items: [] };
  }
}

async function probeDurationSeconds(filePath: string): Promise<number | null> {
  try {
    const output = await runTool("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const duration = Number(output.trim());
    return Number.isFinite(duration) && duration > 0 ? duration : null;
  } catch {
    return null;
  }
}

function runTool(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(new Error("O ffmpeg não está instalado neste servidor."));
        return;
      }
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim().slice(-400) || `${command} falhou.`));
    });
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
