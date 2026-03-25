import type { FastifyBaseLogger } from 'fastify';
import { env } from '../config/env.js';
import { supabaseAdmin } from './supabase.js';

const DEFAULT_CONFIRMATION_TEMPLATE = [
  'Oi {{cliente_nome}}, seu agendamento foi confirmado.',
  '',
  'Empresa: {{empresa}}',
  'Servico: {{servico}}',
  'Profissional: {{profissional_nome}}',
  'Data: {{data}}',
  'Horario: {{hora_inicio}} as {{hora_fim}}',
  '',
  'Se precisar reagendar, fale conosco: {{telefone_empresa}}',
].join('\n');

interface TenantWhatsappConfig {
  tenantName: string;
  tenantContactPhone: string | null;
  enabled: boolean;
  connectedNumber: string | null;
  template: string;
}

interface ConfirmationInput {
  tenantId: string;
  clientName: string;
  clientPhone: string | null;
  serviceName: string;
  startAtIso: string;
  endAtIso: string;
  professionalId?: string | null;
}

function normalizeDigits(value?: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length > 0 ? digits : null;
}

function withBrazilCountryCode(value?: string | null): string | null {
  const digits = normalizeDigits(value);
  if (!digits) return null;
  if (digits.startsWith('55')) return digits;
  return `55${digits}`;
}

function normalizeEvolutionBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '');
}

function getInstanceName(tenantId: string): string {
  return `markei_${tenantId.replace(/-/g, '')}`;
}

function formatDatePtBr(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function formatTimePtBr(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, rawKey: string) => variables[rawKey] ?? '');
}

async function loadTenantWhatsappConfig(tenantId: string, log: FastifyBaseLogger): Promise<TenantWhatsappConfig | null> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('name, contact, whatsapp, whatsapp_wuzapi_enabled, whatsapp_wuzapi_connected_number, whatsapp_confirmation_template')
    .eq('id', tenantId)
    .maybeSingle();

  if (error) {
    if (error.message.includes('whatsapp_wuzapi_enabled')) {
      log.warn({ tenantId }, 'Schema desatualizado para notificacoes WhatsApp');
      return null;
    }

    log.error({ err: error, tenantId }, 'Erro ao carregar configuracao WhatsApp do tenant');
    return null;
  }

  if (!data) {
    return null;
  }

  const row = data as {
    name?: string | null;
    contact?: string | null;
    whatsapp?: string | null;
    whatsapp_wuzapi_enabled?: boolean | null;
    whatsapp_wuzapi_connected_number?: string | null;
    whatsapp_confirmation_template?: string | null;
  };

  return {
    tenantName: row.name?.trim() || 'Minha Agenda',
    tenantContactPhone: normalizeDigits(row.whatsapp ?? row.contact),
    enabled: Boolean(row.whatsapp_wuzapi_enabled),
    connectedNumber: normalizeDigits(row.whatsapp_wuzapi_connected_number),
    template: row.whatsapp_confirmation_template?.trim() || DEFAULT_CONFIRMATION_TEMPLATE,
  };
}

async function resolveProfessionalName(tenantId: string, professionalId?: string | null): Promise<string> {
  if (!professionalId) return 'Profissional';

  const { data } = await supabaseAdmin
    .from('professionals')
    .select('name')
    .eq('tenant_id', tenantId)
    .eq('id', professionalId)
    .maybeSingle();

  return (data as { name?: string | null } | null)?.name?.trim() || 'Profissional';
}

async function postTextMessage(
  baseUrl: string,
  apiKey: string,
  instanceName: string,
  phone: string,
  message: string,
): Promise<Response> {
  return fetch(`${normalizeEvolutionBaseUrl(baseUrl)}/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: JSON.stringify({
      number: phone,
      text: message,
      delay: 0,
      linkPreview: false,
    }),
  });
}

export async function sendAppointmentCreatedWhatsapp(
  input: ConfirmationInput,
  log: FastifyBaseLogger,
): Promise<void> {
  const config = await loadTenantWhatsappConfig(input.tenantId, log);
  if (!config || !config.enabled) return;

  if (!env.EVOLUTION_API_BASE_URL || !env.EVOLUTION_API_KEY) {
    log.warn({ tenantId: input.tenantId }, 'Evolution API habilitada, mas URL/apikey internas nao configuradas no backend');
    return;
  }

  const toPhone = withBrazilCountryCode(input.clientPhone);
  if (!toPhone) {
    log.warn({ tenantId: input.tenantId }, 'Agendamento criado sem telefone valido para WhatsApp');
    return;
  }

  const professionalName = await resolveProfessionalName(input.tenantId, input.professionalId);
  const message = renderTemplate(config.template, {
    cliente_nome: input.clientName,
    servico: input.serviceName,
    profissional_nome: professionalName,
    data: formatDatePtBr(input.startAtIso),
    hora_inicio: formatTimePtBr(input.startAtIso),
    hora_fim: formatTimePtBr(input.endAtIso),
    empresa: config.tenantName,
    telefone_empresa: config.tenantContactPhone ?? config.connectedNumber ?? '',
  });

  if (!message.trim()) {
    log.warn({ tenantId: input.tenantId }, 'Template de WhatsApp resultou em mensagem vazia');
    return;
  }

  try {
    const response = await postTextMessage(
      env.EVOLUTION_API_BASE_URL,
      env.EVOLUTION_API_KEY,
      getInstanceName(input.tenantId),
      toPhone,
      message,
    );

    if (!response.ok) {
      const body = await response.text();
      log.error(
        {
          tenantId: input.tenantId,
          status: response.status,
          body,
        },
        'Falha ao enviar confirmacao de agendamento para Evolution API',
      );
      return;
    }

    log.info({ tenantId: input.tenantId, toPhone }, 'Confirmacao de agendamento enviada via Evolution API');
  } catch (error) {
    log.error({ err: error, tenantId: input.tenantId }, 'Erro inesperado no envio WhatsApp via Evolution API');
  }
}

export const whatsappTemplateVars = [
  'cliente_nome',
  'servico',
  'profissional_nome',
  'data',
  'hora_inicio',
  'hora_fim',
  'empresa',
  'telefone_empresa',
];

export { DEFAULT_CONFIRMATION_TEMPLATE };