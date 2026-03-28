import nodemailer, { SentMessageInfo } from 'nodemailer';
import { env, isForgotPasswordEmailConfigured } from '../config/env.js';

function getTransporter() {
  if (!isForgotPasswordEmailConfigured()) {
    throw new Error('forgot_password_email_not_configured');
  }

  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT),
    secure: env.SMTP_SECURE === 'true',
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });
}

export async function testSmtpConnection(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const transporter = getTransporter();
    await transporter.verify();
    return { ok: true };
  } catch (error) {
    const err = error as Error;
    return {
      ok: false,
      error: err.message,
    };
  }
}

export async function sendResetPasswordEmail(to: string, resetLink: string): Promise<SentMessageInfo> {
  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Redefinir senha — Markei</title>
</head>
<body style="margin:0;padding:0;background:#f4f7f9;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f7f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:18px;border:1px solid #e2e8ef;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#23c3ae 0%,#129689 100%);padding:32px 40px;text-align:center;">
              <p style="margin:0;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">📅 Markei</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 24px;">
              <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0a1420;">Redefinir sua senha</h2>
              <p style="margin:0 0 24px;font-size:15px;color:#4c5f74;line-height:1.6;">
                Recebemos uma solicitação para redefinir a senha da sua conta no <strong>Markei</strong>.
                Clique no botão abaixo para criar uma nova senha.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding-bottom:24px;">
                    <a href="${resetLink}"
                       style="display:inline-block;background:#23c3ae;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:999px;">
                      Redefinir senha
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;font-size:13px;color:#657990;line-height:1.6;">
                Se o botão não funcionar, copie e cole o link abaixo no seu navegador:
              </p>
              <p style="margin:0 0 24px;font-size:12px;word-break:break-all;">
                <a href="${resetLink}" style="color:#23c3ae;text-decoration:none;">${resetLink}</a>
              </p>

              <p style="margin:0;font-size:13px;color:#9aaabc;line-height:1.6;">
                Este link é válido por <strong>1 hora</strong>. Se você não solicitou a redefinição de senha,
                pode ignorar este e-mail com segurança — sua senha permanece a mesma.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 40px 32px;border-top:1px solid #eef4f8;">
              <p style="margin:0;font-size:12px;color:#b9c4d0;text-align:center;">
                © ${new Date().getFullYear()} Markei · Enviado automaticamente, não responda este e-mail.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const transporter = getTransporter();

  return transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: 'Redefinir sua senha — Markei',
    html,
  });
}
