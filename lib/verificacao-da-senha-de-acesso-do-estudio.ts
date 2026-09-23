import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const STUDIO_ACCESS_COOKIE = "estudio_acesso";

const COOKIE_PAYLOAD = "estudio-acesso-v1";

export function studioAccessSecret(): string {
  return process.env.STUDIO_ACCESS_SECRET?.trim() ?? "";
}

export function studioAccessGateIsActive(): boolean {
  return studioAccessSecret().length > 0 || process.env.NODE_ENV === "production";
}

export function passwordMatchesStudioAccessSecret(password: string, secret = studioAccessSecret()): boolean {
  if (!secret) return false;
  const provided = createHash("sha256").update(password).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(provided, expected);
}

export function studioAccessCookieValue(secret = studioAccessSecret()): string {
  return createHmac("sha256", secret).update(COOKIE_PAYLOAD).digest("hex");
}

export function studioAccessCookieIsValid(value: string | undefined, secret = studioAccessSecret()): boolean {
  if (!secret || !value) return false;
  const expected = Buffer.from(studioAccessCookieValue(secret));
  const provided = Buffer.from(value);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
