import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

const OWNER_COOKIE = "estudio_dono_id";
const OWNER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getOrCreateOwnerId(): Promise<string> {
  const jar = await cookies();
  const current = jar.get(OWNER_COOKIE)?.value;
  if (current && OWNER_ID.test(current)) return current;

  const ownerId = randomUUID();
  jar.set(OWNER_COOKIE, ownerId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
  });
  return ownerId;
}
