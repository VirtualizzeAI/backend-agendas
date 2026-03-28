import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { sendResetPasswordEmail, testSmtpConnection } from '../lib/email.js';
import { env, isForgotPasswordEmailConfigured } from '../config/env.js';

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const testSmtpSchema = z.object({
  to: z.string().email(),
});

export async function authRoutes(app: FastifyInstance) {
  // ── Diagnóstico SMTP (remover ou proteger com auth após validar) ─────────────
  app.post('/v1/auth/test-smtp', async (request, reply) => {
    try {
      const { to } = testSmtpSchema.parse(request.body ?? {});

      if (!isForgotPasswordEmailConfigured()) {
        return reply.code(503).send({
          ok: false,
          step: 'config',
          message: 'Variáveis SMTP/APP_URL incompletas no servidor.',
          missing: {
            SMTP_HOST: !env.SMTP_HOST,
            SMTP_USER: !env.SMTP_USER,
            SMTP_PASS: !env.SMTP_PASS,
            SMTP_FROM: !env.SMTP_FROM,
            APP_URL: !env.APP_URL,
          },
        });
      }

      // Verificar conexão SMTP
      const connectionResult = await testSmtpConnection();
      if (!connectionResult.ok) {
        return reply.code(502).send({
          ok: false,
          step: 'smtp_connection',
          message: 'Não foi possível conectar ao servidor SMTP. Verifique host, porta, usuário e senha.',
          error: connectionResult.error,
          config: {
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_SECURE,
            user: env.SMTP_USER,
          },
        });
      }

      // Enviar e-mail de teste
      const result = await sendResetPasswordEmail(to, 'https://exemplo.com/nova-senha?token=TESTE');

      return {
        ok: true,
        step: 'sent',
        messageId: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected,
      };
    } catch (err) {
      const error = err as Error;
      return reply.code(500).send({
        ok: false,
        step: 'error',
        message: error.message,
        name: error.name,
      });
    }
  });

  // ── Forgot password (produção) ────────────────────────────────────────────────
  app.post('/v1/auth/forgot-password', async (request, reply) => {
    try {
      const { email } = forgotPasswordSchema.parse(request.body ?? {});
      const normalizedEmail = email.trim().toLowerCase();

      if (!isForgotPasswordEmailConfigured()) {
        request.log.warn({ msg: 'Forgot password desabilitado: variáveis SMTP/APP_URL incompletas' });
        return { ok: true };
      }

      // Gera o link de recuperação via Supabase Admin API
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: normalizedEmail,
        options: {
          redirectTo: `${env.APP_URL}/nova-senha`,
        },
      });

      if (error) {
        request.log.error({ msg: 'Supabase generateLink falhou', error: error.message, status: error.status });
        return { ok: true };
      }

      const resetLink = data.properties.action_link;
      request.log.info({ msg: 'Link de recuperação gerado', to: normalizedEmail });

      const result = await sendResetPasswordEmail(normalizedEmail, resetLink);

      request.log.info({
        msg: 'E-mail enviado via SMTP',
        to: normalizedEmail,
        messageId: result.messageId,
        accepted: result.accepted,
        rejected: result.rejected,
      });

      return { ok: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.code(400).send({ message: 'E-mail inválido', issues: error.issues });
      }

      const err = error as Error;
      request.log.error({ msg: 'Erro em /v1/auth/forgot-password', error: err.message, stack: err.stack });
      return { ok: true };
    }
  });
}
