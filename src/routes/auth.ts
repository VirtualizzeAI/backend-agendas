import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabase.js';
import { sendResetPasswordEmail } from '../lib/email.js';
import { env, isForgotPasswordEmailConfigured } from '../config/env.js';

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/v1/auth/forgot-password', async (request, reply) => {
    try {
      const { email } = forgotPasswordSchema.parse(request.body ?? {});
      const normalizedEmail = email.trim().toLowerCase();

      if (!isForgotPasswordEmailConfigured()) {
        request.log.warn({
          msg: 'Forgot password desabilitado: variáveis SMTP/APP_URL incompletas',
        });
        return { ok: true };
      }

      // Gera o link de recuperação usando a Admin API do Supabase
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: normalizedEmail,
        options: {
          redirectTo: `${env.APP_URL}/nova-senha`,
        },
      });

      if (error) {
        request.log.error({ msg: 'Erro ao gerar link de recuperação', error });
        // Retorna sucesso genérico mesmo em erro para não vazar informação de existência do email
        return { ok: true };
      }

      const resetLink = data.properties.action_link;
      const result = await sendResetPasswordEmail(normalizedEmail, resetLink);

      request.log.info({
        msg: 'E-mail de recuperação enviado via SMTP',
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

      request.log.error({ msg: 'Erro em /v1/auth/forgot-password', error });
      // Retorna sucesso genérico para não vazar info sobre usuários existentes
      return { ok: true };
    }
  });
}
