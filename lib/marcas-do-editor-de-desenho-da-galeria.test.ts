import assert from "node:assert/strict";
import test from "node:test";
import {
  galleryMarkBounds,
  initialTextBox,
  textResizeHandleHit,
  textWidthFromDrag,
  topGalleryMarkIndex,
  translateGalleryMark,
  wrapGalleryText,
  type GalleryDrawMark,
} from "./marcas-do-editor-de-desenho-da-galeria.ts";

const measure = (line: string) => line.length * 10;

test("o texto quebra na largura e respeita a quebra explícita", () => {
  assert.deepEqual(wrapGalleryText("aa bb cc", 25, measure), ["aa", "bb", "cc"]);
  assert.deepEqual(wrapGalleryText("aa\nbb", 100, measure), ["aa", "bb"]);
  assert.deepEqual(wrapGalleryText("abcdef", 30, measure), ["abc", "def"]);
  assert.deepEqual(wrapGalleryText("", 30, measure), [""]);
});

test("o retângulo do texto nasce com largura e cabe na imagem", () => {
  assert.deepEqual(initialTextBox({ x: 10, y: 4 }, 400), { x: 10, y: 4, width: 280 });
  assert.deepEqual(initialTextBox({ x: 160, y: 4 }, 320), { x: 20, y: 4, width: 280 });
  assert.deepEqual(initialTextBox({ x: 90, y: 4 }, 100), { x: 0, y: 4, width: 80 });
});

test("a largura arrastada não fica menor que o mínimo", () => {
  assert.equal(textWidthFromDrag(80, 20), 100);
  assert.equal(textWidthFromDrag(80, -100), 48);
});

test("o toque pega o item de cima e a borda direita do texto", () => {
  const marks: GalleryDrawMark[] = [
    { kind: "rabisco", color: "#fff", points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] },
    { kind: "seta", color: "#fff", from: { x: 0, y: 30 }, to: { x: 40, y: 30 } },
    { kind: "texto", color: "#fff", x: 10, y: 50, width: 40, text: "aa bb" },
  ];
  assert.equal(topGalleryMarkIndex(marks, { x: 20, y: 0 }, measure), 0);
  assert.equal(topGalleryMarkIndex(marks, { x: 20, y: 30 }, measure), 1);
  assert.equal(topGalleryMarkIndex(marks, { x: 12, y: 52 }, measure), 2);
  assert.equal(topGalleryMarkIndex(marks, { x: 200, y: 200 }, measure), null);
  assert.equal(textResizeHandleHit(marks[2], { x: 50, y: 55 }, measure), true);
  assert.equal(textResizeHandleHit(marks[2], { x: 12, y: 55 }, measure), false);
});

test("mover desloca o item e o retângulo informa a altura das linhas", () => {
  const moved = translateGalleryMark(
    { kind: "texto", color: "#fff", x: 10, y: 4, width: 40, text: "aa bb" },
    3,
    5,
  );
  assert.deepEqual(moved, { kind: "texto", color: "#fff", x: 13, y: 9, width: 40, text: "aa bb" });
  const arrow = translateGalleryMark(
    { kind: "seta", color: "#000", from: { x: 1, y: 1 }, to: { x: 4, y: 5 } },
    2,
    2,
  );
  assert.deepEqual(arrow, { kind: "seta", color: "#000", from: { x: 3, y: 3 }, to: { x: 6, y: 7 } });
  assert.deepEqual(galleryMarkBounds(moved, measure), { x: 13, y: 9, width: 40, height: 80 });
});
