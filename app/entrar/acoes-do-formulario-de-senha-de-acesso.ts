"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  STUDIO_ACCESS_COOKIE,
  passwordMatchesStudioAccessSecret,
  studioAccessCookieValue,
} from "@/lib/verificacao-da-senha-de-acesso-do-estudio";

export async function entrarNoEstudio(formData: FormData) {
  const password = String(formData.get("senha") ?? "");
  if (!passwordMatchesStudioAccessSecret(password)) {
    redirect("/entrar?erro=1");
  }

  const headerStore = await headers();
  const jar = await cookies();
  jar.set(STUDIO_ACCESS_COOKIE, studioAccessCookieValue(), {
    httpOnly: true,
    sameSite: "lax",
    secure: headerStore.get("x-forwarded-proto") === "https",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/");
}
