import { NextResponse, type NextRequest } from "next/server";
import {
  STUDIO_ACCESS_COOKIE,
  studioAccessCookieIsValid,
  studioAccessGateIsActive,
} from "@/lib/verificacao-da-senha-de-acesso-do-estudio";

export function proxy(request: NextRequest) {
  if (!studioAccessGateIsActive()) return NextResponse.next();

  if (!process.env.STUDIO_ACCESS_SECRET?.trim()) {
    return new NextResponse("Defina STUDIO_ACCESS_SECRET no ambiente da VPS.", { status: 503 });
  }

  const pathname = request.nextUrl.pathname;
  if (pathname === "/entrar") return NextResponse.next();

  if (studioAccessCookieIsValid(request.cookies.get(STUDIO_ACCESS_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Entre com a senha do estúdio." }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/entrar", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
