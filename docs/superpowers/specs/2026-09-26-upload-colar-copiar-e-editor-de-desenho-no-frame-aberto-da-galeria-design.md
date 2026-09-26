# Upload, colar, copiar e editor de desenho no frame aberto da galeria

## Contexto

O estúdio já envia imagem, vídeo e áudio como referência no compositor, e já guarda frames extraídos de vídeo em `data/galeria/imagens` como JPEG. O visor central, quando um frame de imagem está aberto, oferece **Usar como referência** e **Apagar**.

Falta trazer uma imagem de fora para a galeria, copiar o frame aberto para a área de transferência e anotar esse frame com rabisco, seta e texto. O editor é um canvas nativo no visor, sem biblioteca nova. Os traços são achatados no JPEG. Não dá para selecionar ou mover um traço depois de soltá-lo. Corrigir é desfazer ou desenhar por cima.

## O que fica pronto

- A aba **Imagens** tem o botão **Enviar imagem**. O arquivo vira um frame JPEG, entra na grade e abre no visor.
- **Ctrl+V** em qualquer lugar do estúdio, quando a área de transferência tem uma imagem e o foco não está num campo de texto, cria o mesmo tipo de frame e abre no visor. A aba **Imagens** passa a ser a aba ativa.
- No frame aberto, a faixa de botões é **Usar como referência**, **Copiar**, **Editar** e **Apagar**.
- **Copiar** coloca um PNG desse frame na área de transferência. Nada é gravado na galeria.
- **Editar** desenha por cima do frame. **Salvar** cria um frame novo, deixa o original intacto e abre o novo. **Cancelar** descarta os traços e permanece no original.
- **Usar como referência** continua enviando o JPEG da galeria para a Higgsfield.

## Fora de escopo

- Mudar o upload de referências do compositor.
- Editar vídeo, clipe ou geração.
- Guardar os traços como vetor, reabrir a edição ou mover seta e texto depois de soltar.
- Refazer (redo).
- Biblioteca de canvas.
- Colar texto, URL ou arquivo que não seja imagem.

## Entrada da imagem

Há três entradas e um único destino: um item `kind: "image"` no índice da galeria, com arquivo `{id}.jpg`.

| Entrada | Rótulo | `sourceGenerationId` | `timeSeconds` |
| --- | --- | --- | --- |
| Enviar imagem | Imagem enviada | string vazia | `null` |
| Colar | Imagem colada | string vazia | `null` |
| Salvar anotação | `Anotação de ` + rótulo do frame aberto, cortado em 120 caracteres | o mesmo valor do frame aberto, inclusive string vazia | `null` |

O navegador aceita JPEG, PNG, WebP e GIF. GIF animado vira o primeiro quadro. Se o navegador não conseguir decodificar o arquivo, a gravação não acontece e a tela mostra "Não foi possível ler essa imagem." Se o lado maior passar de 8192 px, a imagem é reduzida em proporção antes de codificar. A codificação é JPEG com qualidade 0,92. Se o blob passar de 20 MB, tenta de novo com 0,8 e depois 0,6. Se ainda passar, a gravação não acontece e o visor não muda.

Vários arquivos de imagem na mesma colagem usam só o primeiro.

A colagem é ignorada, sem mensagem, quando:

- a área de transferência não tem imagem;
- o foco está em `input`, `textarea` ou elemento `contenteditable`.

O seletor de **Enviar imagem** lista só JPEG, PNG, WebP e GIF.

## Interface do frame aberto

Fora da edição, a faixa permanece com os quatro botões. **Copiar** e **Editar** só aparecem quando o visor mostra um frame de imagem da galeria.

**Editar** substitui a imagem do visor pelo canvas e esconde **Usar como referência**, **Copiar**, **Editar** e **Apagar**. A barra do editor tem:

- ferramentas **Rabisco**, **Seta** e **Texto**;
- cores branco (`#ffffff`), preto (`#000000`) e verde do estúdio (`#d6ff3f`);
- **Desfazer**, **Salvar** e **Cancelar**.

A ferramenta inicial é **Rabisco**. A cor inicial é `#d6ff3f`. Trocar de cor vale para o próximo traço, não para os já feitos.

**Salvar** fica desabilitado até existir pelo menos um traço, seta ou texto commitado. Um campo de texto ainda aberto não conta para habilitar o botão. Se já existe traço commitado e o campo continua aberto, **Salvar** grava o texto desse campo antes de enviar. Se o campo está vazio, **Salvar** só o fecha. **Cancelar** descarta o campo aberto junto com os traços. Durante o envio, **Salvar**, **Desfazer** e **Cancelar** ficam desabilitados. Se o envio falhar, o editor continua aberto com os traços. Se der certo, o visor abre o frame novo na aba **Imagens**.

## Desenho

O bitmap do canvas tem o tamanho da imagem já reduzida, não o tamanho da caixa na tela. O ponteiro (mouse e toque) é mapeado para esse bitmap, descontando o letterbox de `object-contain`. O traço captura o ponteiro, então soltar fora do canvas ainda encerra rabisco e seta.

Medidas no bitmap:

- rabisco e corpo da seta com 4 px;
- ponta da seta com 16 px;
- texto com 32 px, sem quebra de linha.

Cada rabisco completo, cada seta e cada texto commitado é um passo de desfazer. **Desfazer** remove só o último passo.

- Rabisco sem movimento não vira passo.
- Seta com arraste menor que 8 px no bitmap não vira passo.
- Texto: o clique abre um campo naquele ponto. Enter ou sair do campo grava o texto. Escape cancela o campo sem criar passo. Texto vazio ou só com espaços não cria passo.

**Salvar** desenha a imagem base e, por cima, os traços, num único JPEG, e envia esse arquivo. **Cancelar** solta o canvas e volta a mostrar o frame original.

## API e persistência

`POST /api/galeria/imagem` recebe `multipart/form-data`:

- `file`: JPEG obrigatório;
- `label`: texto obrigatório, depois do trim, de 1 a 120 caracteres;
- `sourceGenerationId`: opcional. Ausente ou vazio grava string vazia. Se vier preenchido, precisa ser um UUID. O servidor não consulta se essa geração ainda existe.

O servidor recusa o que não for JPEG pelos bytes `FF D8 FF`, arquivo vazio ou maior que 20 MB. A gravação usa a mesma fila e o mesmo índice de `data/galeria` que os frames de vídeo. A resposta de sucesso é `201` com `{ item }`, no formato de `toPublicGalleryItem`. O arquivo anterior não é alterado.

Erros do servidor, em JSON `{ error }`:

- `422` e "Envie uma imagem JPEG de até 20 MB." para arquivo ausente, vazio, grande demais ou que não seja JPEG;
- `422` e "Informe um rótulo para a imagem." para rótulo vazio;
- `422` e "O rótulo da imagem pode ter no máximo 120 caracteres." para rótulo acima de 120 caracteres;
- `422` e "A geração de origem da imagem é inválida." para `sourceGenerationId` preenchido que não seja UUID.

## Erros na tela

A mensagem aparece na faixa de erro que o estúdio já usa.

- Arquivo ou colagem que não seja JPEG, PNG, WebP ou GIF, ou que passe de 20 MB antes da conversão: "Envie um JPEG, PNG, WebP ou GIF de até 20 MB."
- JPEG que continua acima de 20 MB depois das qualidades 0,92, 0,8 e 0,6: "A imagem continua grande demais depois de reduzir."
- Falha de rede ou resposta de erro ao gravar: a mensagem do servidor, ou "Não foi possível salvar a imagem."
- **Copiar** sem API de área de transferência ou com permissão negada: "O navegador não permitiu copiar a imagem." O frame permanece.

Colar sem imagem não mostra erro.

## Testes

O script `test` passa a executar `lib/validacao-de-imagem-da-galeria.test.ts`. A função pura em `lib/validacao-de-imagem-da-galeria.ts` cobre:

- JPEG com cabeçalho `FF D8 FF` e tamanho entre 1 byte e 20 MB é aceito;
- vazio, acima de 20 MB, PNG e bytes que não são JPEG são recusados;
- rótulo vazio, rótulo só com espaços e rótulo acima de 120 caracteres são recusados;
- rótulo com espaços nas pontas é aceito já sem esses espaços;
- `sourceGenerationId` vazio é aceito e gravado como string vazia;
- UUID é aceito;
- outro texto é recusado.

A montagem do item também é pura e recebe `id` e `createdAt` já prontos. Envio e colagem saem com `sourceGenerationId` vazio e `timeSeconds`, `startSeconds` e `endSeconds` nulos. A anotação copia o `sourceGenerationId` do frame aberto. O rótulo da anotação é cortado em 120 caracteres antes de entrar no item.

Colar, copiar, desenhar, desfazer, cancelar e abrir o frame novo são conferidos no navegador. O projeto não tem teste de componente.

## Arquivos

- `lib/validacao-de-imagem-da-galeria.ts` valida bytes, rótulo, origem e monta o item.
- `lib/validacao-de-imagem-da-galeria.test.ts` cobre essa validação.
- `lib/arquivo-da-galeria-de-frames-e-clipes.ts` ganha a gravação do JPEG novo na fila já existente.
- `app/api/galeria/imagem/route.ts` é o `POST`.
- `components/editor-de-desenho-sobre-o-frame-aberto-da-galeria.tsx` é o canvas, as ferramentas e o achatamento.
- `components/reference-video-studio-page.tsx` liga o botão da aba, a colagem global, **Copiar**, **Editar** e a abertura do frame novo.
- `package.json` inclui o teste novo no script `test`.
