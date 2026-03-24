import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { getTenantIdFromQuery, requireAuthenticatedClient } from '../lib/request.js';

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

const saveWhatsappConfigSchema = z.object({
  enabled: z.boolean().default(false),
  confirmationTemplate: z.string().optional().nullable(),
});

const connectWhatsappSchema = z.object({
  connectedNumber: z.string().min(8),
});

const syncWhatsappSchema = z.object({
  connectedNumber: z.string().min(8),
});

function onlyDigits(value?: string | null): string {
  return (value ?? '').replace(/\D/g, '');
}

function withBrazilCountryCode(value?: string | null): string | null {
  const digits = onlyDigits(value);
  if (!digits) return null;
  if (digits.startsWith('55')) return digits;
  return `55${digits}`;
}

function withoutBrazilCountryCode(value?: string | null): string {
  const digits = onlyDigits(value);
  if (digits.startsWith('55')) return digits.slice(2);
  return digits;
}

function parseConnected(statusPayload: unknown): boolean {
  if (!statusPayload || typeof statusPayload !== 'object') return false;
  const payload = statusPayload as { connected?: unknown; data?: unknown };
  if (typeof payload.connected === 'boolean') {
    return payload.connected;
  }

  if (payload.data && typeof payload.data === 'object') {
    const nestedConnected = (payload.data as { connected?: unknown }).connected;
    if (typeof nestedConnected === 'boolean') {
      return nestedConnected;
    }
  }

  return false;
}

async function getTenantWhatsappConfig(supabase: any, tenantId: string) {
  const { data, error } = await supabase
    .from('tenants')
    .select('whatsapp_wuzapi_enabled, whatsapp_wuzapi_connected_number, whatsapp_confirmation_template')
    .eq('id', tenantId)
    .maybeSingle();

  if (error) {
    return { error: error.message } as const;
  }

  if (!data) {
    return { error: 'Tenant nao encontrado' } as const;
  }

  return { data: data as { whatsapp_wuzapi_enabled?: boolean | null; whatsapp_wuzapi_connected_number?: string | null; whatsapp_confirmation_template?: string | null } } as const;
}

async function callWuzapi(baseUrl: string, token: string, path: string, method: 'GET' | 'POST') {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      token,
      'Content-Type': 'application/json',
    },
    body: method === 'POST' ? '{}' : undefined,
  });

  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
  };
}

export async function whatsappRoutes(app: FastifyInstance) {
  app.get('/v1/whatsapp/config', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const tenantId = getTenantIdFromQuery(request, reply);
    if (!tenantId) return;

    const config = await getTenantWhatsappConfig(auth.supabase, tenantId);
    if ('error' in config) {
      return reply.code(400).send({ message: config.error });
    }

    return reply.send({
      enabled: Boolean(config.data.whatsapp_wuzapi_enabled),
      connectedNumber: withoutBrazilCountryCode(config.data.whatsapp_wuzapi_connected_number),
      confirmationTemplate: config.data.whatsapp_confirmation_template ?? '',
    });
  });

  app.put('/v1/whatsapp/config', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const tenantId = getTenantIdFromQuery(request, reply);
    if (!tenantId) return;

    const payload = saveWhatsappConfigSchema.safeParse(request.body ?? {});
    if (!payload.success) {
      return reply.code(400).send({ message: 'Payload invalido', issues: payload.error.issues });
    }

    const { error } = await auth.supabase
      .from('tenants')
      .update({
        whatsapp_wuzapi_enabled: payload.data.enabled,
        whatsapp_confirmation_template: payload.data.confirmationTemplate?.trim() || null,
      })
      .eq('id', tenantId);

    if (error) {
      return reply.code(400).send({ message: error.message });
    }

    return reply.send({ message: 'Configuracao do WhatsApp salva com sucesso' });
  });

  app.get('/v1/whatsapp/session/status', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const tenantId = getTenantIdFromQuery(request, reply);
    if (!tenantId) return;

    if (!env.WUZAPI_BASE_URL || !env.WUZAPI_TOKEN) {
      return reply.code(500).send({ message: 'WUZAPI_BASE_URL e WUZAPI_TOKEN devem estar configurados no backend' });
    }

    const [{ data: tenantConfig }, result] = await Promise.all([
      auth.supabase
        .from('tenants')
        .select('whatsapp_wuzapi_connected_number')
        .eq('id', tenantId)
        .maybeSingle(),
      callWuzapi(normalizeBaseUrl(env.WUZAPI_BASE_URL), env.WUZAPI_TOKEN, '/session/status', 'GET'),
    ]);

    if (!result.ok) {
      return reply.code(400).send({ message: 'Falha ao consultar status da sessao', details: result.payload });
    }

    return reply.send({
      connected: parseConnected(result.payload),
      connectedNumber: withoutBrazilCountryCode((tenantConfig as { whatsapp_wuzapi_connected_number?: string | null } | null)?.whatsapp_wuzapi_connected_number),
      status: result.payload,
    });
  });

  app.post('/v1/whatsapp/session/connect', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const tenantId = getTenantIdFromQuery(request, reply);
    if (!tenantId) return;

    const payload = connectWhatsappSchema.safeParse(request.body ?? {});
    if (!payload.success) {
      return reply.code(400).send({ message: 'Payload invalido', issues: payload.error.issues });
    }

    if (!env.WUZAPI_BASE_URL || !env.WUZAPI_TOKEN) {
      return reply.code(500).send({ message: 'WUZAPI_BASE_URL e WUZAPI_TOKEN devem estar configurados no backend' });
    }

    const connectResult = await callWuzapi(normalizeBaseUrl(env.WUZAPI_BASE_URL), env.WUZAPI_TOKEN, '/session/connect', 'POST');
    if (!connectResult.ok) {
      return reply.code(400).send({ message: 'Falha ao iniciar conexao da sessao', details: connectResult.payload });
    }

    const qrResult = await callWuzapi(normalizeBaseUrl(env.WUZAPI_BASE_URL), env.WUZAPI_TOKEN, '/session/qr', 'GET');
    if (!qrResult.ok) {
      return reply.code(400).send({ message: 'Conexao iniciada, mas falhou ao obter QR', details: qrResult.payload });
    }

    const statusResult = await callWuzapi(normalizeBaseUrl(env.WUZAPI_BASE_URL), env.WUZAPI_TOKEN, '/session/status', 'GET');
    const connected = statusResult.ok ? parseConnected(statusResult.payload) : false;
    if (connected) {
      await saveConnectedNumber(auth.supabase, tenantId, payload.data.connectedNumber);
    }

    return reply.send({
      message: connected ? 'Numero conectado com sucesso' : 'Conexao iniciada',
      connected,
      qr: qrResult.payload,
    });
  });

  app.post('/v1/whatsapp/session/sync', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const tenantId = getTenantIdFromQuery(request, reply);
    if (!tenantId) return;

    const payload = syncWhatsappSchema.safeParse(request.body ?? {});
    if (!payload.success) {
      return reply.code(400).send({ message: 'Payload invalido', issues: payload.error.issues });
    }

    if (!env.WUZAPI_BASE_URL || !env.WUZAPI_TOKEN) {
      return reply.code(500).send({ message: 'WUZAPI_BASE_URL e WUZAPI_TOKEN devem estar configurados no backend' });
    }

    const result = await callWuzapi(normalizeBaseUrl(env.WUZAPI_BASE_URL), env.WUZAPI_TOKEN, '/session/status', 'GET');
    if (!result.ok) {
      return reply.code(400).send({ message: 'Falha ao consultar status da sessao', details: result.payload });
    }

    const connected = parseConnected(result.payload);
    if (connected) {
      await saveConnectedNumber(auth.supabase, tenantId, payload.data.connectedNumber);
    }

    return reply.send({ connected, status: result.payload });
  });

  app.get('/v1/whatsapp/session/qr', async (request, reply) => {
    const auth = await requireAuthenticatedClient(request, reply);
    if (!auth) return;

    const tenantId = getTenantIdFromQuery(request, reply);
    if (!tenantId) return;

    if (!env.WUZAPI_BASE_URL || !env.WUZAPI_TOKEN) {
      return reply.code(500).send({ message: 'WUZAPI_BASE_URL e WUZAPI_TOKEN devem estar configurados no backend' });
    }

    const result = await callWuzapi(normalizeBaseUrl(env.WUZAPI_BASE_URL), env.WUZAPI_TOKEN, '/session/qr', 'GET');
    if (!result.ok) {
      return reply.code(400).send({ message: 'Falha ao obter QR da sessao', details: result.payload });
    }

    return reply.send({ qr: result.payload });
  });
}

async function saveConnectedNumber(supabase: any, tenantId: string, connectedNumber: string) {
  const withCountryCode = withBrazilCountryCode(connectedNumber);
  if (!withCountryCode) return;

  await supabase
    .from('tenants')
    .update({ whatsapp_wuzapi_connected_number: withCountryCode })
    .eq('id', tenantId);
}