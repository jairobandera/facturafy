// Envio de correo por SMTP (nodemailer). Se usa para mandar a los clientes el estado
// de cuenta de la quincena. Cada sucursal puede tener su propia casilla (correo +
// contrasena de aplicacion); si no, se usa la config global del .env. Si no hay
// ninguna de las dos, el envio esta deshabilitado y se avisa con un error claro.
import nodemailer from 'nodemailer';
import { config } from '../config/env.js';

/** Config SMTP global del .env (o null si no esta configurada). */
export function smtpEnv() {
  if (!config.smtp.host) return null;
  return {
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    user: config.smtp.user,
    pass: config.smtp.pass,
    from: config.smtp.from,
  };
}

/**
 * Resuelve la config SMTP a usar para una sucursal: primero la propia de la sucursal
 * (si tiene correo + contrasena), si no la global del .env. Devuelve null si no hay
 * ninguna configurada.
 * @param {object} [suc] fila de sucursal con smtpUser/smtpPass/smtpHost/smtpPort/smtpSecure/smtpFrom/nombre
 */
export function resolverSmtp(suc) {
  if (suc && suc.smtpUser && suc.smtpPass) {
    return {
      host: suc.smtpHost || 'smtp.gmail.com',
      port: Number(suc.smtpPort || 465),
      secure: suc.smtpSecure == null ? true : !!suc.smtpSecure,
      user: suc.smtpUser,
      pass: suc.smtpPass,
      from: suc.smtpFrom || `${suc.nombre || 'Facturafy'} <${suc.smtpUser}>`,
    };
  }
  return smtpEnv();
}

/** ¿Hay forma de enviar correo para esta sucursal (propia o global)? */
export function smtpConfigurado(suc) {
  return !!resolverSmtp(suc);
}

/** Crea un transporter a partir de una config SMTP resuelta. */
export function construirTransporter(cfg) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });
}

/** Envia un correo con un transporter ya creado. Devuelve el messageId. */
export async function enviarCon(transporter, { from, to, subject, html }) {
  const info = await transporter.sendMail({ from, to, subject, html });
  return info.messageId;
}
