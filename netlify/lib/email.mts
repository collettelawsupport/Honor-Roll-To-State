import type { RegistrationRecord } from './types.mts';

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] || character);
}

export async function sendBigFormInvitation(record: RegistrationRecord, bigFormUrl: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) return false;

  const contestant = `${record.values.contestant_first_name} ${record.values.contestant_last_name}`.trim();
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [record.values.email],
      subject: `Deposit received — complete ${contestant}'s Big Form`,
      html: `<p>Thank you! We received the $${record.depositCents / 100} Honor Roll state registration deposit for <strong>${escapeHtml(contestant)}</strong>.</p><p>The next step is to complete the contestant Big Form:</p><p><a href="${escapeHtml(bigFormUrl)}">Complete the Big Form</a></p><p>After the Big Form is submitted, QuickBooks will email the updated invoice with the remaining entry fee, 50%-off eligible Honor Roll optionals, and any full-price tickets or advertising.</p>`,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Big Form invitation email failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  return true;
}
