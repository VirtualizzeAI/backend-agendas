# Backend separado (SaaS) - Minha Agenda

Este backend foi criado para deploy independente do frontend, usando Supabase como banco + auth no schema `public`.

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
- `CORS_ORIGIN` (aceita um ou varios origins separados por virgula)
- `WUZAPI_BASE_URL` (url interna do provedor WuzAPI do SaaS)
- `WUZAPI_TOKEN` (token interno do SaaS para a WuzAPI)

Exemplo local:

`CORS_ORIGIN=http://localhost:5173,http://localhost:5174`

## 3) Criar schema no Supabase

No SQL Editor do Supabase, execute:

- `sql/0001_init_saas.sql`

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

Rotas admin:

- `GET /v1/admin/bootstrap`
- `GET /v1/admin/plans`
- `POST /v1/admin/plans`
- `GET /v1/admin/customers`
- `POST /v1/admin/customers`
- `PUT /v1/admin/customers/:id`
- `POST /v1/admin/customers/:id/send-password-reset`

Rotas operacionais SaaS:

- `GET /v1/clients?tenantId=UUID`
- `POST /v1/clients`
- `GET /v1/professionals?tenantId=UUID`
- `POST /v1/professionals`
- `GET /v1/services?tenantId=UUID`
- `POST /v1/services`
- `GET /v1/appointments?tenantId=UUID`
- `POST /v1/appointments`
- `GET /v1/whatsapp/config?tenantId=UUID`
- `PUT /v1/whatsapp/config?tenantId=UUID`
- `GET /v1/whatsapp/session/status?tenantId=UUID`
- `POST /v1/whatsapp/session/connect?tenantId=UUID`
- `GET /v1/whatsapp/session/qr?tenantId=UUID`

## 5) Deploy separado

Deploy sugerido para o backend: Railway, Render, Fly.io ou outro serviço Node.

Deploy sugerido para frontend: Vercel, Netlify ou Cloudflare Pages.

Assim front e back ficam totalmente separados.
