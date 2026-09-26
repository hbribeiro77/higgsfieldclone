export const MAX_GALLERY_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_GALLERY_IMAGE_SIDE = 8192;
export const GALLERY_JPEG_QUALITIES = [0.92, 0.8, 0.6] as const;

const JPEG_ERROR = "Envie uma imagem JPEG de até 20 MB.";
const EMPTY_LABEL = "Informe um rótulo para a imagem.";
const LONG_LABEL = "O rótulo da imagem pode ter no máximo 120 caracteres.";
const BAD_ORIGIN = "A geração de origem da imagem é inválida.";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"]);

export type GalleryImageItem = {
  id: string;
  kind: "image";
  sourceGenerationId: string;
  label: string;
  createdAt: string;
  timeSeconds: null;
  startSeconds: null;
  endSeconds: null;
};

export function validateGalleryJpeg(bytes: Uint8Array): string | null {
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!isJpeg || bytes.length > MAX_GALLERY_IMAGE_BYTES) return JPEG_ERROR;
  return null;
}

export function readGalleryLabel(label: string): { label: string } | { error: string } {
  const trimmed = label.trim();
  if (trimmed.length === 0) return { error: EMPTY_LABEL };
  if (trimmed.length > 120) return { error: LONG_LABEL };
  return { label: trimmed };
}

export function validateGallerySourceGenerationId(value: string): string | null {
  if (value.length === 0 || UUID_PATTERN.test(value)) return null;
  return BAD_ORIGIN;
}

export function annotationLabel(originalLabel: string): string {
  return `Anotação de ${originalLabel}`.slice(0, 120);
}

export function buildGalleryImageItem(input: {
  id: string;
  createdAt: string;
  label: string;
  sourceGenerationId: string;
}): GalleryImageItem {
  return {
    id: input.id,
    kind: "image",
    sourceGenerationId: input.sourceGenerationId,
    label: input.label,
    createdAt: input.createdAt,
    timeSeconds: null,
    startSeconds: null,
    endSeconds: null,
  };
}

export function isGallerySourceImageType(type: string): boolean {
  return SOURCE_IMAGE_TYPES.has(type.toLowerCase());
}

export function shouldConsumeImagePaste(input: {
  hasImageFile: boolean;
  tagName: string;
  isContentEditable: boolean;
}): boolean {
  if (!input.hasImageFile || input.isContentEditable) return false;
  const tag = input.tagName.toLowerCase();
  return tag !== "input" && tag !== "textarea";
}

export function scaledGalleryImageSize(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= MAX_GALLERY_IMAGE_SIDE) return { width, height };
  const scale = MAX_GALLERY_IMAGE_SIDE / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
