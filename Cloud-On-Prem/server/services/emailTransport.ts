import nodemailer from 'nodemailer';
import axios from 'axios';
import { IntegrationConfigService } from './integrationConfigService';
import { IntegrationAuditService } from './integrationAuditService';

export interface RawEmailPayload {
  from: { email: string; name: string };
  to: { email: string; name?: string }[];
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; content: Buffer | string; contentType?: string }[];
  replyTo?: { email: string; name?: string };
}

export interface EmailTransportResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

async function getTransportType(): Promise<'smtp' | 'mailersend' | 'none'> {
  const preferred = await IntegrationConfigService.getActiveEmailProvider();
  if (preferred === 'smtp') {
    const host = await IntegrationConfigService.getSetting<string>('smtp', 'host');
    if (String(host || '').trim()) return 'smtp';
  }
  if (preferred === 'mailersend') {
    const mailerSendApiKey = await IntegrationConfigService.getSecret('mailersend', 'apiKey');
    if (mailerSendApiKey) return 'mailersend';
  }
  // fallback if preferred provider is not configured
  const smtpHost = await IntegrationConfigService.getSetting<string>('smtp', 'host');
  if (String(smtpHost || '').trim()) return 'smtp';
  const mailerSendApiKey = await IntegrationConfigService.getSecret('mailersend', 'apiKey');
  if (mailerSendApiKey) return 'mailersend';
  return 'none';
}

let smtpTransporter: nodemailer.Transporter | null = null;
let smtpVerified = false;

function getSmtpTransporter(): nodemailer.Transporter {
  throw new Error('Use getSmtpTransporterAsync');
}

async function getSmtpTransporterAsync(): Promise<nodemailer.Transporter> {
  if (!smtpTransporter) {
    const host = String(await IntegrationConfigService.getSetting<string>('smtp', 'host') || '').trim();
    const port = Number(await IntegrationConfigService.getSetting<number>('smtp', 'port') ?? 587);
    let secure = Boolean(await IntegrationConfigService.getSetting<boolean>('smtp', 'secure') ?? false);
    const smtpUser = String(await IntegrationConfigService.getSetting<string>('smtp', 'username') || '').trim();
    const smtpPass = String(await IntegrationConfigService.getSecret('smtp', 'password') || '').trim();

    if (port === 465 && !secure) {
      console.warn('[EmailTransport] Port 465 requires implicit TLS — auto-enabling secure mode');
      secure = true;
    }

    smtpTransporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: smtpUser ? {
        user: smtpUser,
        pass: smtpPass || '',
      } : undefined,
    });

    if (!smtpVerified) {
      smtpVerified = true;
      smtpTransporter.verify().then(() => {
        console.log(`[EmailTransport] SMTP connection verified (${host}:${port})`);
      }).catch((err: Error) => {
        console.warn(`[EmailTransport] SMTP verification failed: ${err.message} — emails may not work`);
      });
    }
  }
  return smtpTransporter;
}

export async function sendRawEmail(payload: RawEmailPayload): Promise<EmailTransportResult> {
  const startedAt = Date.now();
  const transportType = await getTransportType();

  if (transportType === 'none') {
    console.warn('[EmailTransport] No email transport configured (configure SMTP or MailerSend in Integration Settings)');
    await IntegrationAuditService.logIntegrationEvent({
      provider: 'email',
      operation: 'send_email',
      status: 'failure',
      severity: 'error',
      message: 'No email transport configured',
      durationMs: Date.now() - startedAt,
      requestSummary: { toCount: payload.to?.length || 0, subject: payload.subject?.slice(0, 120) },
    });
    return { success: false, error: 'No email transport configured' };
  }

  if (transportType === 'smtp') {
    const result = await sendViaSMTP(payload);
    await IntegrationAuditService.logIntegrationEvent({
      provider: 'smtp',
      operation: 'send_email',
      status: result.success ? 'success' : 'failure',
      severity: result.success ? 'info' : 'error',
      message: result.success ? 'SMTP email sent' : result.error || 'SMTP send failed',
      durationMs: Date.now() - startedAt,
      requestSummary: { toCount: payload.to?.length || 0, subject: payload.subject?.slice(0, 120) },
      responseSummary: { messageId: result.messageId || null },
    });
    return result;
  }

  const result = await sendViaMailerSend(payload);
  await IntegrationAuditService.logIntegrationEvent({
    provider: 'mailersend',
    operation: 'send_email',
    status: result.success ? 'success' : 'failure',
    severity: result.success ? 'info' : 'error',
    message: result.success ? 'MailerSend email sent' : result.error || 'MailerSend send failed',
    durationMs: Date.now() - startedAt,
    requestSummary: { toCount: payload.to?.length || 0, subject: payload.subject?.slice(0, 120) },
    responseSummary: { messageId: result.messageId || null },
  });
  return result;
}

async function sendViaSMTP(payload: RawEmailPayload): Promise<EmailTransportResult> {
  try {
    const transporter = await getSmtpTransporterAsync();
    const fromEmail = (await IntegrationConfigService.getSetting<string>('smtp', 'fromEmail')) || payload.from.email;
    const fromName = (await IntegrationConfigService.getSetting<string>('smtp', 'fromName')) || payload.from.name;
    const result = await transporter.sendMail({
      from: { name: fromName, address: fromEmail },
      to: payload.to.map(t => ({ name: t.name || '', address: t.email })),
      subject: payload.subject,
      html: payload.html,
      text: payload.text || payload.html.replace(/<[^>]*>/g, ''),
      replyTo: payload.replyTo ? { name: payload.replyTo.name || '', address: payload.replyTo.email } : undefined,
      attachments: payload.attachments?.map(a => ({
        filename: a.filename,
        content: Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content, 'base64'),
        contentType: a.contentType,
      })),
    });
    return { success: true, messageId: result.messageId };
  } catch (error: any) {
    console.error('[EmailTransport] SMTP send error:', error.message);
    return { success: false, error: error.message };
  }
}

async function sendViaMailerSend(payload: RawEmailPayload): Promise<EmailTransportResult> {
  try {
    const apiKey = await IntegrationConfigService.getSecret('mailersend', 'apiKey');
    if (!apiKey) {
      return { success: false, error: 'MAILERSEND API key is not configured in Integration Settings' };
    }
    const msPayload: any = {
      from: { email: payload.from.email, name: payload.from.name },
      to: payload.to.map(t => ({ email: t.email, name: t.name })),
      subject: payload.subject,
      html: payload.html,
      text: payload.text || payload.html.replace(/<[^>]*>/g, ''),
    };

    if (payload.replyTo) {
      msPayload.reply_to = { email: payload.replyTo.email, name: payload.replyTo.name };
    }

    if (payload.attachments && payload.attachments.length > 0) {
      msPayload.attachments = payload.attachments.map(a => ({
        filename: a.filename,
        content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : a.content,
        disposition: 'attachment',
      }));
    }

    const response = await axios.post('https://api.mailersend.com/v1/email', msPayload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 30000,
    });

    const messageId = response.headers['x-message-id'] || '';
    return { success: true, messageId };
  } catch (error: any) {
    const errorMsg = error.response?.data?.message || error.message || 'Unknown MailerSend error';
    console.error('[EmailTransport] MailerSend send error:', errorMsg);
    return { success: false, error: errorMsg };
  }
}

export function getActiveTransportName(): string {
  return 'managed';
}
