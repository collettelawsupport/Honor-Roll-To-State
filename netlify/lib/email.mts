import type { RegistrationRecord } from './types.mts';

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
      'After the Big Form is submitted, QuickBooks will email the updated invoice with the remaining entry fee, 50%-off eligible Honor Roll optionals, and any full-price tickets or advertising.',
    ].join('\n'),
    html: `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#321b28;max-width:640px"><h2 style="margin-bottom:12px">Deposit received</h2><p>Thank you! We received the ${deposit} state registration deposit for <strong>${safeContestant}</strong>.</p><p>The next step is to complete the contestant Big Form:</p><p style="margin:28px 0"><a href="${safeBigFormUrl}" style="display:inline-block;background:#70264f;color:#ffffff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:8px">Complete the Big Form</a></p><p style="font-size:14px;color:#654b5b">If the button does not open, use this link:<br><a href="${safeBigFormUrl}">${safeBigFormUrl}</a></p><p>After the Big Form is submitted, QuickBooks will email the updated invoice with the remaining entry fee, 50%-off eligible Honor Roll optionals, and any full-price tickets or advertising.</p></div>`,
  };
}

export async function sendBigFormInvitation(record: RegistrationRecord, bigFormUrl: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return false;

  const message = buildBigFormInvitationEmail(record, bigFormUrl);
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
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Big Form invitation email failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  return true;
}
