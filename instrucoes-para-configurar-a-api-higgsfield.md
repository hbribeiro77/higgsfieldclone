# Configurar a API Higgsfield neste estúdio

As chaves ficam só no servidor. Não as coloque em código, em URL, em print nem no browser.

1. Crie as credenciais no console da Higgsfield. Cada credencial tem um key id e um secret.
2. Na raiz do projeto, copie `.env.example` para `.env.local`.
3. Preencha `HF_API_KEY_ID` e `HF_API_KEY_SECRET` nesse arquivo.
4. Reinicie o servidor de desenvolvimento (`npm run dev`).

O header enviado à API é `Authorization: Key SEU_KEY_ID:SEU_SECRET`, sempre a partir das rotas em `app/api`. Sem as duas variáveis, o estúdio avisa na tela e não chama `https://api.higgsfield.ai`.

Use credenciais diferentes para desenvolvimento e produção. Se uma chave vazar, revogue-a no console e gere outra.
