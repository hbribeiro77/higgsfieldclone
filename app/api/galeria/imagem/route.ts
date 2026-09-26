import { saveGalleryImage, toPublicGalleryItem } from "@/lib/arquivo-da-galeria-de-frames-e-clipes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KNOWN_ERRORS = new Set([
  "Envie uma imagem JPEG de até 20 MB.",
  "Informe um rótulo para a imagem.",
  "O rótulo da imagem pode ter no máximo 120 caracteres.",
  "A geração de origem da imagem é inválida.",
]);

export async function POST(request: Request) {
  const form = await readForm(request);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "Envie uma imagem JPEG de até 20 MB." }, { status: 422 });
  }
  const label = form?.get("label");
  const source = form?.get("sourceGenerationId");
  try {
    const item = await saveGalleryImage({
      bytes: Buffer.from(await file.arrayBuffer()),
      label: typeof label === "string" ? label : "",
      sourceGenerationId: typeof source === "string" ? source : "",
    });
    return Response.json({ item: toPublicGalleryItem(item) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível salvar a imagem.";
    return Response.json({ error: message }, { status: KNOWN_ERRORS.has(message) ? 422 : 500 });
  }
}

async function readForm(request: Request): Promise<FormData | null> {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}
