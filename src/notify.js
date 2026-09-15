// Envío del código de turno por email (SMTP) y/o SMS (Twilio).
// Si no hay credenciales configuradas, se registra en consola para poder
// probar la aplicación sin proveedores externos.

import nodemailer from 'nodemailer';

const DATE_FORMAT = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

function formatLongDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return DATE_FORMAT.format(new Date(y, m - 1, d));
}

export function buildMessage(appointment, schoolName) {
  const when = `${formatLongDate(appointment.date)} a las ${appointment.time}`;
  return {
    subject: `Tu turno de recogida de libros: ${appointment.code}`,
    text:
      `Hola ${appointment.name},\n\n` +
      `Tu cita para recoger los libros en ${schoolName} es el ${when}.\n` +
      `Tu código de turno es: ${appointment.code}\n\n` +
      `Cuando llegues, espera en el pasillo a que tu código aparezca en la pantalla ` +
      `junto al número de puesto donde te atenderán.\n`,
    sms: `${schoolName}: tu turno de recogida de libros es el ${when}. Código: ${appointment.code}`,
  };
}

const SMS_TIMEOUT_MS = 10_000;
const SMTP_TIMEOUT_MS = 10_000;

/** Oculta la mayor parte del email/teléfono para los logs. */
export function mask(value) {
  if (!value) return '';
  const str = String(value);
  if (str.includes('@')) {
    const [user, domain] = str.split('@');
    return `${user.slice(0, 2)}***@${domain}`;
  }
  return `${'*'.repeat(Math.max(0, str.length - 3))}${str.slice(-3)}`;
}

function smtpTransport(env) {
  if (!env.SMTP_HOST || !env.SMTP_USER) return null;
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT) || 587,
    secure: Number(env.SMTP_PORT) === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });
}

async function sendSms(env, to, body) {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_FROM: from } = env;
  if (!sid || !token || !from) return false;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
    signal: AbortSignal.timeout(SMS_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Twilio respondió ${res.status}`);
  return true;
}

export function createNotifier({ env = process.env, schoolName, logger = console } = {}) {
  const transport = smtpTransport(env);

  return {
    async send(appointment) {
      const msg = buildMessage(appointment, schoolName);
      const results = { email: 'skipped', sms: 'skipped' };

      if (appointment.email) {
        try {
          if (transport) {
            await transport.sendMail({
              from: env.SMTP_FROM || env.SMTP_USER,
              to: appointment.email,
              subject: msg.subject,
              text: msg.text,
            });
            results.email = 'sent';
          } else {
            logger.log(`[notify] EMAIL (simulado) → ${mask(appointment.email)}: código ${appointment.code}`);
            results.email = 'simulated';
          }
        } catch (err) {
          logger.error('[notify] Error enviando email:', err.message);
          results.email = 'error';
        }
      }

      if (appointment.phone) {
        try {
          const sent = await sendSms(env, appointment.phone, msg.sms);
          if (sent) {
            results.sms = 'sent';
          } else {
            logger.log(`[notify] SMS (simulado) → ${mask(appointment.phone)}: código ${appointment.code}`);
            results.sms = 'simulated';
          }
        } catch (err) {
          logger.error('[notify] Error enviando SMS:', err.message);
          results.sms = 'error';
        }
      }

      return results;
    },
  };
}
