import * as nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'localhost',
      port: Number(process.env.SMTP_PORT || 1025),
      secure: false,
      connectionTimeout: 3000,
      greetingTimeout: 3000,
      socketTimeout: 5000,
    });
  }
  return transporter;
}

/**
 * Envia um e-mail transacional. Retorna false (sem lançar) quando o SMTP está
 * indisponível ou desativado, para que a operação principal não seja derrubada.
 */
export async function sendMail(message: {
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  if (process.env.SMTP_DISABLED === 'true') return false;
  try {
    await getTransporter().sendMail({
      from:
        process.env.SMTP_FROM ||
        '"Cidade em Foco" <nao-responda@cidadeemfoco.gov.br>',
      ...message,
    });
    return true;
  } catch (err) {
    console.warn(
      `[Mailer] Falha ao enviar e-mail "${message.subject}":`,
      (err as Error).message,
    );
    return false;
  }
}
