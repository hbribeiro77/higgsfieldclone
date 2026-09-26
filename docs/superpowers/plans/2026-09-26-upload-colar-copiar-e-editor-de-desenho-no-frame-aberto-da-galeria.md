# Upload, colar, copiar e editor de desenho no frame aberto da galeria

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir enviar ou colar uma imagem na galeria, copiar o frame aberto e anotar esse frame com rabisco, seta e texto, gravando um JPEG novo.

**Architecture:** Funções puras validam JPEG, rótulo e origem. O `POST /api/galeria/imagem` grava o arquivo na mesma fila da galeria. O navegador converte e desenha; a página do estúdio liga envio, colagem, cópia e o editor.

**Tech Stack:** Next.js 16, React 19, Node test runner, Canvas 2D no navegador. Sem biblioteca nova.

## Global Constraints

- Sem biblioteca de canvas.
- JPEG de até 20 MB; lado maior reduzido para 8192 px.
- Qualidades 0,92, depois 0,8, depois 0,6.
- Rótulo de 1 a 120 caracteres depois do trim.
- Anotação herda `sourceGenerationId`; envio e colagem gravam string vazia.
- `timeSeconds`, `startSeconds` e `endSeconds` nulos.
- Colagem ignorada em `input`, `textarea` e `contenteditable`, e quando não há imagem.
- Salvar a anotação cria outro frame e abre esse frame.
- Copiar grava PNG na área de transferência e não altera a galeria.
- Mensagens de erro são as da spec.

---

### Task 1: Validação pura

**Files:**
- Create: `lib/validacao-de-imagem-da-galeria.ts`
- Test: `lib/validacao-de-imagem-da-galeria.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `validateGalleryJpeg`, `readGalleryLabel`, `validateGallerySourceGenerationId`, `annotationLabel`, `buildGalleryImageItem`, `shouldConsumeImagePaste`, `isGallerySourceImageType`, `scaledGalleryImageSize`, `GALLERY_JPEG_QUALITIES`, `MAX_GALLERY_IMAGE_BYTES`

- [ ] Escrever o teste, ver falhar, implementar, ver passar, incluir no `npm test`.

### Task 2: Gravação e rota

**Files:**
- Modify: `lib/arquivo-da-galeria-de-frames-e-clipes.ts`
- Create: `app/api/galeria/imagem/route.ts`

**Interfaces:**
- Consumes: as funções da Task 1
- Produces: `saveGalleryImage({ bytes, label, sourceGenerationId })` e `POST /api/galeria/imagem` com campos `file`, `label`, `sourceGenerationId`

- [ ] Gravar o JPEG na fila existente e responder `201` com `{ item }`.

### Task 3: Navegador

**Files:**
- Create: `components/conversao-de-arquivo-de-imagem-para-jpeg-da-galeria.ts`
- Create: `components/editor-de-desenho-sobre-o-frame-aberto-da-galeria.tsx`
- Modify: `components/reference-video-studio-page.tsx`

- [ ] Enviar imagem, colar, copiar, editar, desfazer, cancelar e salvar conforme a spec.
- [ ] Conferir no navegador.
