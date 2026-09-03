import nodemailer from 'nodemailer';
import { loadBigFormHandbookAttachment } from './handbook.mts';
import type { RegistrationRecord } from './types.mts';

export type InvitationEmailProvider = 'gmail' | 'resend';

export function configuredInvitationEmailProvider(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): InvitationEmailProvider | null {
  if (environment.GMAIL_USER?.trim() && environment.GMAIL_APP_PASSWORD?.trim()) return 'gmail';
  if (environment.RESEND_API_KEY?.trim() && environment.EMAIL_FROM?.trim()) return 'resend';
  return null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] || character);
}

export function buildBigFormInvitationEmail(record: RegistrationRecord, bigFormUrl: string) {
  const contestant = `${record.values.contestant_first_name} ${record.values.contestant_last_name}`.trim();
  const deposit = (record.depositCents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
  const safeContestant = escapeHtml(contestant);
  const safeBigFormUrl = escapeHtml(bigFormUrl);

  return {
    subject: `Deposit received - complete ${contestant}'s Big Form`,
    text: [
      `Thank you! We received the ${deposit} state registration deposit for ${contestant}.`,
      '',
      'Complete the contestant Big Form here:',
      bigFormUrl,
      '',
      'The 2026 Texas State Handbook is attached to this email.',
      '',
      'After the Big Form is submitted, QuickBooks will email the updated invoice with the remaining entry fee, 50%-off eligible Honor Roll optionals, and any full-price tickets or advertising.',
    ].join('\n'),
    html: `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#321b28;max-width:640px"><h2 style="margin-bottom:12px">Deposit received</h2><p>Thank you! We received the ${deposit} state registration deposit for <strong>${safeContestant}</strong>.</p><p>The next step is to complete the contestant Big Form:</p><p style="margin:28px 0"><a href="${safeBigFormUrl}" style="display:inline-block;background:#70264f;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:8px">Complete the Big Form</a></p><p style="font-size:14px;color:#654b5b">If the button does not open, use this link:<br><a href="${safeBigFormUrl}">${safeBigFormUrl}</a></p><p>The <strong>2026 Texas State Handbook</strong> is attached to this email.</p><p>After the Big Form is submitted, QuickBooks will email the updated invoice with the remaining entry fee, 50%-off eligible Honor Roll optionals, and any full-price tickets or advertising.</p></div>`,
  };
}

export async function sendBigFormInvitation(
  record: RegistrationRecord,
  bigFormUrl: string,
): Promise<InvitationEmailProvider | null> {
  const provider = configuredInvitationEmailProvider();
  if (!provider) return null;

  const message = buildBigFormInvitationEmail(record, bigFormUrl);
  const handbook = await loadBigFormHandbookAttachment();
  if (provider === 'gmail') {
    const user = process.env.GMAIL_USER!.trim();
    const appPassword = process.env.GMAIL_APP_PASSWORD!.replace(/\s/g, '');
    const from = process.env.EMAIL_FROM?.trim() || `Texas Our Little Miss <${user}>`;
    const transport = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass: appPassword },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
    await transport.sendMail({
      from,
      to: record.values.email,
      replyTo: user,
      ...message,
      attachments: [handbook],
    });
    return 'gmail';
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return null;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'idempotency-key': `big-form-invitation-${record.id}`,
    },
    body: JSON.stringify({
      from,
      to: [record.values.email],
      ...message,
      attachments: [{
        filename: handbook.filename,
        content: handbook.content.toString('base64'),
      }],
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Big Form invitation email failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  return 'resend';
}
