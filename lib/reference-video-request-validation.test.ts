import assert from "node:assert/strict";
import test from "node:test";
import {
  formatUsdEstimateLabel,
  isAllowedStatusUrl,
  readAcceptedHiggsfieldSubmission,
  readHiggsfieldCostEstimate,
  resolveUploadContentType,
  validateReferenceVideoRequest,
} from "./reference-video-request-validation.ts";

const image = (name: string) => `https://cdn.example.com/${name}.jpg`;
const video = (name: string) => `https://cdn.example.com/${name}.mp4`;
const audio = (name: string) => `https://cdn.example.com/${name}.wav`;

test("Wan 3.0 exige prompt e aplica os padrões documentados", () => {
  const missing = validateReferenceVideoRequest({ model: "wan-3.0" });
  assert.equal(missing.ok, false);
  if (!missing.ok) {
    assert.match(missing.errors.join(" "), /prompt/);
  }

  const result = validateReferenceVideoRequest({
    model: "wan-3.0",
    prompt: "  um plano costeiro  ",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.endpointPath, "/alibaba/wan-3.0/reference-to-video");
    assert.deepEqual(result.value.body, {
      prompt: "um plano costeiro",
      duration: 5,
      resolution: "1080p",
      aspect_ratio: "adaptive",
      generate_audio: true,
      enable_thinking: false,
    });
  }
});

test("Wan 3.0 limita duração, quantidade de referências, resolução e proporção", () => {
  const tooShort = validateReferenceVideoRequest({ model: "wan-3.0", prompt: "mar", duration: 1 });
  const tooLong = validateReferenceVideoRequest({ model: "wan-3.0", prompt: "mar", duration: 31 });
  const edges = validateReferenceVideoRequest({ model: "wan-3.0", prompt: "mar", duration: 2 });
  const upper = validateReferenceVideoRequest({ model: "wan-3.0", prompt: "mar", duration: 30 });
  assert.equal(tooShort.ok, false);
  assert.equal(tooLong.ok, false);
  assert.equal(edges.ok, true);
  assert.equal(upper.ok, true);

  const tooManyImages = validateReferenceVideoRequest({
    model: "wan-3.0",
    prompt: "mar",
    imageUrls: Array.from({ length: 11 }, (_, index) => image(String(index))),
  });
  const tenImages = validateReferenceVideoRequest({
    model: "wan-3.0",
    prompt: "mar",
    imageUrls: Array.from({ length: 10 }, (_, index) => image(String(index))),
  });
  assert.equal(tooManyImages.ok, false);
  assert.equal(tenImages.ok, true);

  const tooManyVideos = validateReferenceVideoRequest({
    model: "wan-3.0",
    prompt: "mar",
    videoUrls: Array.from({ length: 6 }, (_, index) => video(String(index))),
  });
  const tooManyAudios = validateReferenceVideoRequest({
    model: "wan-3.0",
    prompt: "mar",
    audioUrls: Array.from({ length: 6 }, (_, index) => audio(String(index))),
  });
  assert.equal(tooManyVideos.ok, false);
  assert.equal(tooManyAudios.ok, false);

  const fourK = validateReferenceVideoRequest({ model: "wan-3.0", prompt: "mar", resolution: "4k" });
  const cinema = validateReferenceVideoRequest({ model: "wan-3.0", prompt: "mar", aspectRatio: "21:9" });
  const adaptive = validateReferenceVideoRequest({ model: "wan-3.0", prompt: "mar", aspectRatio: "adaptive" });
  assert.equal(fourK.ok, false);
  assert.equal(cinema.ok, false);
  assert.equal(adaptive.ok, true);
});

test("Wan 3.0 mantém o documento quando documento e página vêm juntos e omite semente zero", () => {
  const both = validateReferenceVideoRequest({
    model: "wan-3.0",
    prompt: "mar",
    fileUrl: "https://cdn.example.com/roteiro.pdf",
    linkUrl: "https://example.com/referencia",
    seed: 0,
  });
  assert.equal(both.ok, true);
  if (both.ok) {
    assert.equal(both.value.body.file_url, "https://cdn.example.com/roteiro.pdf");
    assert.equal("link_url" in both.value.body, false);
    assert.equal("seed" in both.value.body, false);
  }

  const seeded = validateReferenceVideoRequest({ model: "wan-3.0", prompt: "mar", seed: 7 });
  assert.equal(seeded.ok, true);
  if (seeded.ok) assert.equal(seeded.value.body.seed, 7);

  const negative = validateReferenceVideoRequest({ model: "wan-3.0", prompt: "mar", seed: -1 });
  assert.equal(negative.ok, false);
});

test("Seedance 2.0 exige imagem ou vídeo e recusa áudio sozinho", () => {
  const promptOnly = validateReferenceVideoRequest({ model: "seedance-2.0", prompt: "mar" });
  const audioOnly = validateReferenceVideoRequest({
    model: "seedance-2.0",
    audioUrls: [audio("voz")],
  });
  const withImage = validateReferenceVideoRequest({
    model: "seedance-2.0",
    imageUrls: [image("quadro")],
  });
  assert.equal(promptOnly.ok, false);
  assert.equal(audioOnly.ok, false);
  assert.equal(withImage.ok, true);
  if (withImage.ok) {
    assert.equal(withImage.value.endpointPath, "/bytedance/seedance-2.0/reference-to-video");
    assert.equal("prompt" in withImage.value.body, false);
    assert.deepEqual(withImage.value.body.image_urls, [image("quadro")]);
    assert.equal(withImage.value.body.duration, 5);
    assert.equal(withImage.value.body.resolution, "720p");
    assert.equal(withImage.value.body.aspect_ratio, "16:9");
    assert.equal(withImage.value.body.generate_audio, true);
    assert.equal("enable_thinking" in withImage.value.body, false);
    assert.equal("file_url" in withImage.value.body, false);
  }
});

test("Seedance 2.0 aceita 4k e 21:9 e recusa adaptive, documento e excesso de mídia", () => {
  const accepted = validateReferenceVideoRequest({
    model: "seedance-2.0",
    prompt: "mar",
    imageUrls: [image("a")],
    resolution: "4k",
    aspectRatio: "21:9",
    duration: 4,
  });
  const tooLong = validateReferenceVideoRequest({
    model: "seedance-2.0",
    imageUrls: [image("a")],
    duration: 16,
  });
  const adaptive = validateReferenceVideoRequest({
    model: "seedance-2.0",
    imageUrls: [image("a")],
    aspectRatio: "adaptive",
  });
  const document = validateReferenceVideoRequest({
    model: "seedance-2.0",
    imageUrls: [image("a")],
    fileUrl: "https://cdn.example.com/roteiro.pdf",
    enableThinking: true,
  });
  const tooManyImages = validateReferenceVideoRequest({
    model: "seedance-2.0",
    imageUrls: Array.from({ length: 10 }, (_, index) => image(String(index))),
  });
  const tooManyVideos = validateReferenceVideoRequest({
    model: "seedance-2.0",
    videoUrls: Array.from({ length: 4 }, (_, index) => video(String(index))),
  });

  assert.equal(accepted.ok, true);
  assert.equal(tooLong.ok, false);
  assert.equal(adaptive.ok, false);
  assert.equal(document.ok, false);
  assert.equal(tooManyImages.ok, false);
  assert.equal(tooManyVideos.ok, false);
});

test("referências locais e status fora da API são recusados", () => {
  const local = validateReferenceVideoRequest({
    model: "wan-3.0",
    prompt: "mar",
    imageUrls: ["https://127.0.0.1/segredo.jpg"],
  });
  const metadata = validateReferenceVideoRequest({
    model: "wan-3.0",
    prompt: "mar",
    imageUrls: ["http://169.254.169.254/latest"],
  });
  assert.equal(local.ok, false);
  assert.equal(metadata.ok, false);
  assert.equal(isAllowedStatusUrl("https://api.higgsfield.ai/requests/abc/status"), true);
  assert.equal(isAllowedStatusUrl("https://platform.higgsfield.ai/requests/abc/status"), true);
  assert.equal(isAllowedStatusUrl("https://api.higgsfield.ai/bytedance/seedance-2.0/text-to-video"), false);
  assert.equal(isAllowedStatusUrl("https://example.com/requests/abc/status"), false);
});

test("a resposta aceita o status em platform.higgsfield.ai", () => {
  const requestId = "d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff";
  const accepted = readAcceptedHiggsfieldSubmission({
    status: "queued",
    request_id: requestId,
    status_url: `https://platform.higgsfield.ai/requests/${requestId}/status`,
    cancel_url: `https://platform.higgsfield.ai/requests/${requestId}/cancel`,
  });
  assert.ok(accepted);
  assert.equal(accepted?.requestId, requestId);
  assert.equal(accepted?.statusUrl, `https://platform.higgsfield.ai/requests/${requestId}/status`);
  assert.equal(accepted?.cancelUrl, `https://platform.higgsfield.ai/requests/${requestId}/cancel`);

  const fromIdOnly = readAcceptedHiggsfieldSubmission({
    requestId,
    status: "completed",
    video: { url: "https://cdn.example.com/video.mp4" },
  });
  assert.equal(fromIdOnly?.statusUrl, `https://api.higgsfield.ai/requests/${requestId}/status`);
});

test("a estimativa lê créditos e dólares e formata em real brasileiro de dólar", () => {
  assert.deepEqual(readHiggsfieldCostEstimate({ credits: "1.500", usd: "0.094" }), {
    credits: "1.500",
    usd: "0.094",
  });
  assert.deepEqual(readHiggsfieldCostEstimate({ data: { credits: 8, usd: 0.4 } }), {
    credits: "8",
    usd: "0.4",
  });
  assert.equal(readHiggsfieldCostEstimate({ status: "queued" }), null);
  assert.equal(formatUsdEstimateLabel("0.4"), "US$ 0,40");
  assert.equal(formatUsdEstimateLabel("0.094"), "US$ 0,09");
  assert.equal(formatUsdEstimateLabel(""), null);
});

test("a estimativa aceita Wan sem prompt e Seedance sem referência", () => {
  const wan = validateReferenceVideoRequest({ model: "wan-3.0", duration: 2, resolution: "480p" }, { forEstimate: true });
  assert.equal(wan.ok, true);
  if (wan.ok) {
    assert.equal(wan.value.body.duration, 2);
    assert.equal(wan.value.body.resolution, "480p");
    assert.equal(wan.value.body.prompt, undefined);
  }

  const seedance = validateReferenceVideoRequest({ model: "seedance-2.0" }, { forEstimate: true });
  assert.equal(seedance.ok, true);

  const generation = validateReferenceVideoRequest({ model: "wan-3.0" });
  assert.equal(generation.ok, false);
});

test("o upload aceita os tipos documentados e recusa mp3", () => {
  assert.equal(resolveUploadContentType("foto.png", "image/png"), "image/png");
  assert.equal(resolveUploadContentType("foto.jpg", ""), "image/jpeg");
  assert.equal(resolveUploadContentType("clipe.mp4", "video/mp4"), "video/mp4");
  assert.equal(resolveUploadContentType("voz.wav", "audio/wav"), "audio/wav");
  assert.equal(resolveUploadContentType("voz.mp3", "audio/mpeg"), null);
  assert.equal(resolveUploadContentType("roteiro.pdf", "application/pdf"), null);
});
