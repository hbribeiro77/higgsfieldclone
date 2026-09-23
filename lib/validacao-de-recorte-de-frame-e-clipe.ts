const MIN_CLIP_SECONDS = 0.3;
const MAX_CLIP_SECONDS = 30;

export function validateFrameTime(timeSeconds: number, durationSeconds: number | null): string | null {
  if (!Number.isFinite(timeSeconds) || timeSeconds < 0) return "O instante do frame precisa ser zero ou maior.";
  if (durationSeconds !== null && timeSeconds >= durationSeconds) return "Esse instante passa do fim do vídeo.";
  return null;
}

export function validateClipRange(startSeconds: number, endSeconds: number, durationSeconds: number | null): string | null {
  if (!Number.isFinite(startSeconds) || startSeconds < 0) return "O início do clipe precisa ser zero ou maior.";
  if (!Number.isFinite(endSeconds) || endSeconds <= startSeconds) return "O fim do clipe precisa ser depois do início.";
  const length = endSeconds - startSeconds;
  if (length < MIN_CLIP_SECONDS) return "O clipe precisa ter pelo menos 0,3 segundos.";
  if (length > MAX_CLIP_SECONDS) return "O clipe pode ter no máximo 30 segundos.";
  if (durationSeconds !== null && endSeconds > durationSeconds + 0.05) return "O clipe passa do fim do vídeo.";
  return null;
}
