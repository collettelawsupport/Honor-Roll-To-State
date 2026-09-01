import { sendBigFormInvitation } from './email.mts';
import { getInvoice, updatePaidInvoiceMessage } from './quickbooks.mts';
import { getRegistrationByInvoice, saveRegistration } from './store.mts';
import type { RegistrationRecord } from './types.mts';
import { buildBigFormUrl } from './workflow.mts';

export type PaidInvoiceResult = 'already_sent' | 'missing_registration' | 'sent' | 'unpaid';

async function sendPaidInvitation(record: RegistrationRecord) {
  if (!record.paidAt) {
    record.paidAt = new Date().toISOString();
    record.status = 'paid';
    await saveRegistration(record);
  }
  if (record.bigFormInvitationSentAt) return;

  const baseUrl = process.env.BIG_FORM_URL?.trim();
  if (!baseUrl) throw new Error('BIG_FORM_URL is not configured.');
  const bigFormUrl = buildBigFormUrl(record, baseUrl);
  const emailProvider = await sendBigFormInvitation(record, bigFormUrl);
  if (emailProvider) {
    record.bigFormInvitationMethod = emailProvider;
  } else {
    const invoice = await updatePaidInvoiceMessage(record, bigFormUrl);
    record.qbo = { ...record.qbo, ...invoice };
    record.bigFormInvitationMethod = 'quickbooks';
  }
  record.bigFormInvitationSentAt = new Date().toISOString();
  await saveRegistration(record);
}

export async function reconcilePaidInvoice(invoiceId: string, source: 'scheduled' | 'webhook'): Promise<PaidInvoiceResult> {
  const record = await getRegistrationByInvoice(invoiceId);
  if (!record) return 'missing_registration';
  if (record.bigFormInvitationSentAt) return 'already_sent';

  const invoice = await getInvoice(invoiceId);
  const total = Number(invoice.TotalAmt || 0);
  const balance = Number(invoice.Balance || 0);
  console.info('QuickBooks invoice payment check completed.', {
    invoiceId,
    source,
    total,
    balance,
  });

  if (total < record.depositCents / 100 || balance > 0) return 'unpaid';

  await sendPaidInvitation(record);
  console.info('QuickBooks paid-registration invitation completed.', { invoiceId, source });
  return 'sent';
}
