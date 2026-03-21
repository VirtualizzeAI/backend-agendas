# Backend separado (SaaS) - Minha Agenda

Este backend foi criado para deploy independente do frontend, usando Supabase como banco + auth.

## 1) Instalar dependencias

```bash
cd backend
npm install
```

## 2) Configurar ambiente

Copie `.env.example` para `.env` e preencha:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CORS_ORIGIN`

## 3) Criar schema no Supabase

No SQL Editor do Supabase, execute:

- `sql/0001_init_saas.sql`

Depois, em `Project Settings -> API -> Exposed schemas`, inclua o schema `app`.

Este script cria:
- tabelas multi-tenant
- indices
- triggers
- funcao de onboarding
- RLS (Row Level Security)
- policies por tenant

## 4) Rodar local

```bash
npm run dev
```

Health check:

- `GET /health`

Bootstrap autenticado:

- `GET /v1/me/bootstrap`

Criar tenant autenticado:

- `POST /v1/tenants`

## 5) Deploy separado

Deploy sugerido para o backend: Railway, Render, Fly.io ou outro serviço Node.

Deploy sugerido para frontend: Vercel, Netlify ou Cloudflare Pages.

Assim front e back ficam totalmente separados.
