import { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';
import { z } from 'zod';
import { env } from '../config/env.js';
import { getTenantIdFromQuery, requireAuthenticatedClient } from '../lib/request.js';

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

interface EvolutionResponse {
  ok: boolean;
  status: number;
  payload: unknown;
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

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

function getInstanceName(tenantId: string): string {
  return `markei_${tenantId.replace(/-/g, '')}`;
}

function parseConnectedState(statusPayload: unknown): boolean {
  if (!statusPayload || typeof statusPayload !== 'object') return false;
  const payload = statusPayload as { instance?: { state?: unknown } };
  return payload.instance?.state === 'open';
}

function extractConnectionCode(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const response = payload as { code?: unknown; pairingCode?: unknown };
  if (typeof response.code === 'string' && response.code.trim()) return response.code.trim();
  if (typeof response.pairingCode === 'string' && response.pairingCode.trim()) return response.pairingCode.trim();
  return null;
}

async function getTenantWhatsappConfig(supabase: any, tenantId: string) {
  const { data, error } = await supabase
    .from('tenants')
    .select('whatsapp_wuzapi_enabled, whatsapp_wuzapi_connected_number, whatsapp_confirmation_template')
    .eq('id', tenantId)
    .maybeSingle();

  if (error) return { error: error.message } as const;
  if (!data) return { error: 'Tenant nao encontrado' } as const;

  return {
    data: data as {
      whatsapp_wuzapi_enabled?: boolean | null;
      whatsapp_wuzapi_connected_number?: string | null;
      whatsapp_confirmation_template?: string | null;
    },
  } as const;
}

async function callEvolution(path: string, method: 'GET' | 'POST', body?: unknown): Promise<EvolutionResponse> {
  if (!env.EVOLUTION_API_BASE_URL || !env.EVOLUTION_API_KEY) {
    return {
      ok: false,
      status: 500,
      payload: { message: 'EVOLUTION_API_BASE_URL e EVOLUTION_API_KEY devem estar configurados no backend' },
    };
  }

  const response = await fetch(`${normalizeBaseUrl(env.EVOLUTION_API_BASE_URL)}${path}`, {
    method,
    headers: {
      apikey: env.EVOLUTION_API_KEY,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
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

  return { ok: response.ok, status: response.status, payload };
}

async function fetchInstance(instanceName: string): Promise<unknown | null> {
  const result = await callEvolution(`/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`, 'GET');
  if (!result.ok || !Array.isArray(result.payload)) return null;

  const match = result.payload.find((item) => {
    if (!item || typeof item !== 'object') return false;
    const instance = (item as { instance?: { instanceName?: unknown } }).instance;
    return instance?.instanceName === instanceName;
  });

  return match ?? null;
}

async function ensureInstance(instanceName: string, phoneNumber: string | null): Promise<EvolutionResponse> {
  const existing = await fetchInstance(instanceName);
  if (existing) return { ok: true, status: 200, payload: existing };

  return callEvolution('/instance/create', 'POST', {
    instanceName,
    integration: 'WHATSAPP-BAILEYS',
    qrcode: false,
    number: phoneNumber,
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

    const instanceName = getInstanceName(tenantId);
    const [{ data: tenantConfig }, result] = await Promise.all([
      auth.supabase
        .from('tenants')
        .select('whatsapp_wuzapi_connected_number')
        .eq('id', tenantId)
        .maybeSingle(),
      callEvolution(`/instance/connectionState/${encodeURIComponent(instanceName)}`, 'GET'),
    ]);

    const connected = result.ok ? parseConnectedState(result.payload) : false;

    return reply.send({
      connected,
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

    const phoneNumber = withBrazilCountryCode(payload.data.connectedNumber);
    if (!phoneNumber) {
      return reply.code(400).send({ message: 'Número invalido para Conexão' });
    }

    const instanceName = getInstanceName(tenantId);
    const ensureResult = await ensureInstance(instanceName, phoneNumber);
    if (!ensureResult.ok) {
      return reply.code(400).send({ message: 'Falha ao criar ou localizar instancia', details: ensureResult.payload });
    }

    const connectResult = await callEvolution(
      `/instance/connect/${encodeURIComponent(instanceName)}?number=${encodeURIComponent(phoneNumber)}`,
      'GET',
    );
    if (!connectResult.ok) {
      return reply.code(400).send({ message: 'Falha ao conectar instancia', details: connectResult.payload });
    }

    const statusResult = await callEvolution(`/instance/connectionState/${encodeURIComponent(instanceName)}`, 'GET');
    const connected = statusResult.ok ? parseConnectedState(statusResult.payload) : false;
    const connectionCode = extractConnectionCode(connectResult.payload);

    let qrCodeDataUrl: string | null = null;
    if (!connected && connectionCode) {
      qrCodeDataUrl = await QRCode.toDataURL(connectionCode, { margin: 1, width: 320 });
    }

    if (connected) {
      await saveConnectedNumber(auth.supabase, tenantId, payload.data.connectedNumber);
    }

    return reply.send({
      message: connected ? 'Número conectado com sucesso' : 'Conexão iniciada',
      connected,
      qrCodeDataUrl,
      pairingCode: (connectResult.payload as { pairingCode?: string } | null)?.pairingCode ?? null,
      instanceName,
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

    const instanceName = getInstanceName(tenantId);
    const result = await callEvolution(`/instance/connectionState/${encodeURIComponent(instanceName)}`, 'GET');
    const connected = result.ok ? parseConnectedState(result.payload) : false;

    if (connected) {
      await saveConnectedNumber(auth.supabase, tenantId, payload.data.connectedNumber);
    }

    return reply.send({ connected, status: result.payload });
  });
}
