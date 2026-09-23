import { entrarNoEstudio } from "./acoes-do-formulario-de-senha-de-acesso";
import { studioAccessSecret } from "@/lib/verificacao-da-senha-de-acesso-do-estudio";

export default async function PaginaDeSenhaDeAcesso({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const configured = studioAccessSecret().length > 0;

  return (
    <main className="flex min-h-full flex-1 items-center justify-center bg-[#070709] px-4">
      <form action={entrarNoEstudio} className="w-full max-w-sm rounded-2xl bg-[#141414] p-6">
        <h1 className="text-lg font-semibold text-white">Estúdio de vídeo</h1>
        <p className="mt-2 text-sm text-zinc-400">Digite a senha para entrar.</p>
        {configured ? (
          <input
            name="senha"
            type="password"
            autoComplete="current-password"
            required
            className="mt-5 w-full rounded-xl border border-white/10 bg-[#070709] px-3 py-3 text-sm text-white outline-none"
          />
        ) : (
          <p className="mt-5 text-sm text-amber-300">Defina STUDIO_ACCESS_SECRET no ambiente.</p>
        )}
        {erro ? <p className="mt-3 text-sm text-red-300">Senha incorreta.</p> : null}
        <button
          type="submit"
          disabled={!configured}
          className="mt-4 w-full rounded-xl bg-[#d6ff3f] py-3 text-sm font-semibold text-black disabled:opacity-40"
        >
          Entrar
        </button>
      </form>
    </main>
  );
}
