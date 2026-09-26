import {
  GALLERY_JPEG_QUALITIES,
  isGallerySourceImageType,
  MAX_GALLERY_IMAGE_BYTES,
  scaledGalleryImageSize,
} from "@/lib/validacao-de-imagem-da-galeria";

export const GALLERY_SOURCE_TYPE_OR_SIZE_ERROR = "Envie um JPEG, PNG, WebP ou GIF de até 20 MB.";
export const GALLERY_STILL_TOO_BIG_ERROR = "A imagem continua grande demais depois de reduzir.";
export const GALLERY_UNREADABLE_IMAGE_ERROR = "Não foi possível ler essa imagem.";

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

export async function encodeCanvasAsGalleryJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  for (const quality of GALLERY_JPEG_QUALITIES) {
    const blob = await canvasToJpegBlob(canvas, quality);
    if (blob && blob.size > 0 && blob.size <= MAX_GALLERY_IMAGE_BYTES) return blob;
  }
  throw new Error(GALLERY_STILL_TOO_BIG_ERROR);
}

export async function fileToGalleryJpeg(file: Blob): Promise<Blob> {
  if (file.size <= 0 || file.size > MAX_GALLERY_IMAGE_BYTES || !isGallerySourceImageType(file.type)) {
    throw new Error(GALLERY_SOURCE_TYPE_OR_SIZE_ERROR);
  }
  const bitmap = await readBitmap(file);
  const size = scaledGalleryImageSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error(GALLERY_UNREADABLE_IMAGE_ERROR);
  }
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  return encodeCanvasAsGalleryJpeg(canvas);
}

export async function loadScaledGalleryBitmap(url: string): Promise<ImageBitmap> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(GALLERY_UNREADABLE_IMAGE_ERROR);
  const bitmap = await readBitmap(await response.blob());
  const size = scaledGalleryImageSize(bitmap.width, bitmap.height);
  if (size.width === bitmap.width && size.height === bitmap.height) return bitmap;
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error(GALLERY_UNREADABLE_IMAGE_ERROR);
  }
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  return createImageBitmap(canvas);
}

async function readBitmap(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob);
  } catch {
    throw new Error(GALLERY_UNREADABLE_IMAGE_ERROR);
  }
}
