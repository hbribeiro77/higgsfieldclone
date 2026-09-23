import assert from "node:assert/strict";
import test from "node:test";
import { quoteFromPricingDescription } from "./calculo-da-estimativa-de-custo-da-geracao.ts";

const wan =
  "Priced per generated second by resolution: 480p $0.05, 720p $0.10, or 1080p $0.20. Rates shown are before any applicable customer discount.";

const seedance =
  "Token-metered pricing. Billable video tokens = ceil((input video seconds + generated video seconds) × output width × output height × 24 fps / 1024). Image and audio references do not count as video input. Per 1,000 video tokens: without video input — 480p/720p/1080p $0.014, 4K $0.008; with video input — 480p/720p/1080p $0.0084, 4K $0.0048 (0.6× the standard rate). With video references, both input and generated video durations are billable.";

test("Wan cobra por segundo conforme a resolução", () => {
  assert.equal(quoteFromPricingDescription(wan, quote({ duration: 5, resolution: "480p" })), 0.25);
  assert.equal(quoteFromPricingDescription(wan, quote({ duration: 2, resolution: "1080p" })), 0.4);
  assert.equal(quoteFromPricingDescription(wan, quote({ duration: 5, resolution: "720p" })), 0.5);
});

test("Seedance cobra tokens do quadro gerado", () => {
  const usd = quoteFromPricingDescription(seedance, quote({ duration: 5, resolution: "720p", aspectRatio: "16:9" }));
  assert.equal(usd, 1.512);
  const withVideo = quoteFromPricingDescription(
    seedance,
    quote({ duration: 5, resolution: "720p", aspectRatio: "16:9", hasVideoReference: true, inputVideoSeconds: 2 }),
  );
  assert.ok(withVideo !== null && Math.abs(withVideo - 1.27008) < 0.000001);
});

function quote(overrides: Partial<Parameters<typeof quoteFromPricingDescription>[1]>) {
  return {
    duration: 5,
    resolution: "480p",
    aspectRatio: "16:9",
    inputVideoSeconds: 0,
    hasVideoReference: false,
    ...overrides,
  };
}
