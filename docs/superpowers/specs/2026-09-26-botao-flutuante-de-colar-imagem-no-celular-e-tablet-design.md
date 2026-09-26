# Botão flutuante de colar imagem no celular e no tablet

## O que fica pronto

No celular e no tablet, um botão **Colar** fica fixo no canto inferior direito, acima da barra do sistema. O toque lê a área de transferência. Se houver JPEG, PNG, WebP ou GIF, a imagem segue o mesmo caminho do Ctrl+V: vira um frame com o rótulo "Imagem colada", a aba **Imagens** abre e o visor mostra esse frame.

No computador, com mouse, o botão não aparece. Ctrl+V continua valendo.

## Quando o botão aparece

A regra pura `shouldShowFloatingPasteButton` devolve verdadeiro só quando o ponteiro principal é grosso. Mouse, ainda que a tela não tenha hover, esconde o botão.

O botão também fica fora enquanto o editor de desenho do frame está aberto. Durante o envio da imagem, ele permanece visível e desabilitado.

## Toque

O toque chama `navigator.clipboard.read()`. O primeiro item cuja tipo é JPEG, PNG, WebP ou GIF vira o arquivo colado. Vários itens usam só o primeiro que for imagem.

Erros, na faixa que o estúdio já usa:

- Nenhuma imagem entre os itens: "Não há uma imagem na área de transferência."
- API ausente ou permissão recusada: "O navegador não permitiu colar a imagem."
- Arquivo ilegível, tipo fora da lista ou acima de 20 MB: as mensagens que o envio de imagem já usa.

## Testes

`lib/validacao-de-imagem-da-galeria.test.ts` cobre a regra de aparecer: ponteiro grosso mostra, mouse esconde. O toque é conferido no navegador.
