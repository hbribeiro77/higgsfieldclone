import assert from "node:assert/strict";
import test from "node:test";
import { validateClipRange, validateFrameTime } from "./validacao-de-recorte-de-frame-e-clipe.ts";

test("o frame aceita um instante dentro do vídeo", () => {
  assert.equal(validateFrameTime(0, 2), null);
  assert.equal(validateFrameTime(1.2, 2), null);
  assert.equal(validateFrameTime(2, 2), "Esse instante passa do fim do vídeo.");
  assert.equal(validateFrameTime(-1, 2), "O instante do frame precisa ser zero ou maior.");
});

test("o clipe exige intervalo curto e dentro do vídeo", () => {
  assert.equal(validateClipRange(0.2, 1.4, 2), null);
  assert.equal(validateClipRange(1, 1.1, 2), "O clipe precisa ter pelo menos 0,3 segundos.");
  assert.equal(validateClipRange(0, 31, 40), "O clipe pode ter no máximo 30 segundos.");
  assert.equal(validateClipRange(1.5, 1.5, 2), "O fim do clipe precisa ser depois do início.");
  assert.equal(validateClipRange(0, 2.2, 2), "O clipe passa do fim do vídeo.");
});
