import assert from "node:assert/strict";
import test from "node:test";
import {
  annotationLabel,
  buildGalleryImageItem,
  isGallerySourceImageType,
  MAX_GALLERY_IMAGE_BYTES,
  readGalleryLabel,
  scaledGalleryImageSize,
  shouldConsumeImagePaste,
  validateGalleryJpeg,
  validateGallerySourceGenerationId,
} from "./validacao-de-imagem-da-galeria.ts";

const JPEG_ERROR = "Envie uma imagem JPEG de até 20 MB.";
const EMPTY_LABEL = "Informe um rótulo para a imagem.";
const LONG_LABEL = "O rótulo da imagem pode ter no máximo 120 caracteres.";
const BAD_ORIGIN = "A geração de origem da imagem é inválida.";
const UUID = "123e4567-e89b-12d3-a456-426614174000";

function jpeg(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  if (size >= 1) bytes[0] = 0xff;
  if (size >= 2) bytes[1] = 0xd8;
  if (size >= 3) bytes[2] = 0xff;
  return bytes;
}

test("o JPEG com cabeçalho e tamanho até 20 MB é aceito", () => {
  assert.equal(validateGalleryJpeg(jpeg(3)), null);
  assert.equal(validateGalleryJpeg(jpeg(MAX_GALLERY_IMAGE_BYTES)), null);
});

test("JPEG vazio, grande demais ou que não é JPEG é recusado", () => {
  assert.equal(validateGalleryJpeg(new Uint8Array()), JPEG_ERROR);
  assert.equal(validateGalleryJpeg(jpeg(MAX_GALLERY_IMAGE_BYTES + 1)), JPEG_ERROR);
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47]);
  assert.equal(validateGalleryJpeg(png), JPEG_ERROR);
  assert.equal(validateGalleryJpeg(Uint8Array.from([0xff, 0xd8])), JPEG_ERROR);
});

test("o rótulo vazio ou longo é recusado e as pontas são cortadas", () => {
  assert.deepEqual(readGalleryLabel("   "), { error: EMPTY_LABEL });
  assert.deepEqual(readGalleryLabel(""), { error: EMPTY_LABEL });
  assert.deepEqual(readGalleryLabel("a".repeat(121)), { error: LONG_LABEL });
  assert.deepEqual(readGalleryLabel("  Frame  "), { label: "Frame" });
});

test("a origem vazia ou UUID é aceita e outro texto é recusado", () => {
  assert.equal(validateGallerySourceGenerationId(""), null);
  assert.equal(validateGallerySourceGenerationId(UUID), null);
  assert.equal(validateGallerySourceGenerationId("geracao"), BAD_ORIGIN);
});

test("o item de imagem enviada não tem tempos nem geração", () => {
  assert.deepEqual(
    buildGalleryImageItem({
      id: UUID,
      createdAt: "2026-09-26T00:00:00.000Z",
      label: "Imagem enviada",
      sourceGenerationId: "",
    }),
    {
      id: UUID,
      kind: "image",
      sourceGenerationId: "",
      label: "Imagem enviada",
      createdAt: "2026-09-26T00:00:00.000Z",
      timeSeconds: null,
      startSeconds: null,
      endSeconds: null,
    },
  );
});

test("a anotação copia a origem e corta o rótulo em 120 caracteres", () => {
  const original = "x".repeat(130);
  const label = annotationLabel(original);
  assert.equal(label.length, 120);
  assert.equal(label.startsWith("Anotação de "), true);
  assert.deepEqual(
    buildGalleryImageItem({
      id: UUID,
      createdAt: "2026-09-26T00:00:00.000Z",
      label,
      sourceGenerationId: UUID,
    }).sourceGenerationId,
    UUID,
  );
});

test("a colagem só entra quando há imagem e o foco não é texto", () => {
  assert.equal(shouldConsumeImagePaste({ hasImageFile: true, tagName: "DIV", isContentEditable: false }), true);
  assert.equal(shouldConsumeImagePaste({ hasImageFile: false, tagName: "DIV", isContentEditable: false }), false);
  assert.equal(shouldConsumeImagePaste({ hasImageFile: true, tagName: "TEXTAREA", isContentEditable: false }), false);
  assert.equal(shouldConsumeImagePaste({ hasImageFile: true, tagName: "INPUT", isContentEditable: false }), false);
  assert.equal(shouldConsumeImagePaste({ hasImageFile: true, tagName: "DIV", isContentEditable: true }), false);
});

test("o tipo de origem e o lado máximo seguem a spec", () => {
  assert.equal(isGallerySourceImageType("image/png"), true);
  assert.equal(isGallerySourceImageType("image/jpg"), true);
  assert.equal(isGallerySourceImageType("video/mp4"), false);
  assert.deepEqual(scaledGalleryImageSize(1000, 500), { width: 1000, height: 500 });
  assert.deepEqual(scaledGalleryImageSize(16384, 8192), { width: 8192, height: 4096 });
});
