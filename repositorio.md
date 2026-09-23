# Repositório

Remoto: https://github.com/hbribeiro77/higgsfieldclone.git
Branch: master
Repositório privado.

## Enviar

1. Não incluir `.env.local` nem a pasta `data/`.
2. Commit na `master`.
3. `git push origin master`.

## Depois do push

No EasyPanel, no app `higgsfieldclone`, clicar em Implantar.
O volume `dados-do-estudio` precisa continuar montado em `/app/data`.
Sem esse volume, o deploy apaga gerações, frames e clipes.
