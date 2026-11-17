# Configurar Supabase (gratuito) e login com Google

Este passo troca o emulador local pelo Supabase real. Tudo abaixo pode ser feito no **plano gratuito**.
Tempo estimado: 20–30 minutos. Nenhum conhecimento de programação é necessário para os passos 1–4.

## 1. Criar o projeto Supabase

1. Acesse supabase.com, crie uma conta e clique em **New project**.
2. Escolha um nome (ex.: `rpg-ai`), uma senha forte para o banco (guarde em local seguro) e a região **South America (São Paulo)**.
3. Aguarde o projeto ficar pronto.

## 2. Coletar as chaves (Project Settings)

| Onde                                                                        | O que copiar               | Variável no `.env`                                                                                                      |
| --------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Settings → API → Project URL                                                | `https://xxxx.supabase.co` | `SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_URL`                                                                             |
| Settings → API → `anon` / publishable key                                   | chave pública              | `SUPABASE_ANON_KEY` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`                                                                   |
| Settings → API → JWT Settings → JWT Secret (se o projeto usar chave legada) | segredo                    | `SUPABASE_JWT_SECRET` (deixe vazio se o projeto usar chaves assimétricas; a API usa as chaves públicas automaticamente) |
| Settings → Database → Connection string (URI, modo _Session_)               | URL com senha              | `DATABASE_URL`                                                                                                          |

**Nunca** compartilhe a `service_role key`, o JWT Secret ou a senha do banco. O projeto não precisa da `service_role key`.

## 3. Criar as tabelas

Com o `.env` apontando para o Supabase: `pnpm db:migrate`.
⚠️ **Não** rode `pnpm db:bootstrap-local` em um projeto Supabase (o comando se recusa a rodar fora de `localhost`).

## 4. URLs de retorno (Authentication → URL Configuration)

- **Site URL:** o endereço do site (local: `http://localhost:3000`).
- **Redirect URLs:** adicione `http://localhost:3000/auth/callback` (e depois o endereço de produção + `/auth/callback`).

## 5. Login com Google (gratuito)

1. No Google Cloud Console (console.cloud.google.com): crie um projeto → **APIs & Services → OAuth consent screen** → tipo _External_ → preencha nome do app e e-mail de suporte.
2. **Credentials → Create credentials → OAuth client ID** → tipo _Web application_.
3. Em **Authorized redirect URIs**, cole a URL que o Supabase mostra em _Authentication → Providers → Google_ (formato `https://xxxx.supabase.co/auth/v1/callback`).
4. Copie **Client ID** e **Client Secret** para _Authentication → Providers → Google_ no Supabase e ative.
5. No `.env` do site: `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=true`.

## 6. E-mails (confirmação, recuperação de senha)

O Supabase gratuito envia e-mails com limite baixo por hora — suficiente para testes. Para produção, configure um SMTP próprio (Authentication → SMTP Settings); há provedores com plano gratuito.

## Limites do plano gratuito a conhecer

- Projetos sem uso por cerca de uma semana são **pausados** (basta reativar no painel).
- Banco e armazenamento com cotas reduzidas.
  Esses limites podem mudar; confira a página de preços do Supabase.
