import type { Config, Context } from '@netlify/functions';
import { sendBigFormInvitation } from '../lib/email.mts';
import { json } from '../lib/http.mts';
import {
  connectedRealmId,
  getInvoice,
  getPayment,
  updatePaidInvoiceMessage,
} from '../lib/quickbooks.mts';
import { getRegistrationByInvoice, saveRegistration } from '../lib/store.mts';
import { buildBigFormUrl, verifyWebhookSignature } from '../lib/workflow.mts';

type WebhookEntity = { id?: string; name?: string; operation?: string };

const PAYMENT_RETRY_DELAYS_MS = [0, 2_000, 5_000, 10_000];

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function paymentInvoiceIds(payment: Record<string, unknown>) {
  const result = new Map<string, number>();
  const lines = Array.isArray(payment.Line) ? payment.Line : [];
  for (const rawLine of lines) {
    if (!rawLine || typeof rawLine !== 'object') continue;
    const line = rawLine as Record<string, unknown>;
    const amount = Number(line.Amount || 0);
    const linked = Array.isArray(line.LinkedTxn) ? line.LinkedTxn : [];
    for (const rawLink of linked) {
      if (!rawLink || typeof rawLink !== 'object') continue;
      const link = rawLink as Record<string, unknown>;
      if (link.TxnType === 'Invoice' && typeof link.TxnId === 'string') result.set(link.TxnId, amount);
    }
  }
  return result;
}

async function sendPaidInvitation(invoiceId: string) {
  const record = await getRegistrationByInvoice(invoiceId);
  if (!record) return;
  if (!record.paidAt) {
    record.paidAt = new Date().toISOString();
    record.status = 'paid';
    await saveRegistration(record);
  }
  if (record.bigFormInvitationSentAt) return;

  const baseUrl = process.env.BIG_FORM_URL?.trim();
  if (!baseUrl) throw new Error('BIG_FORM_URL is not configured.');
  const bigFormUrl = buildBigFormUrl(record, baseUrl);
  const sentByResend = await sendBigFormInvitation(record, bigFormUrl);
  if (sentByResend) {
    record.bigFormInvitationMethod = 'resend';
  } else {
    const invoice = await updatePaidInvoiceMessage(record, bigFormUrl);
    record.qbo = { ...record.qbo, ...invoice };
    record.bigFormInvitationMethod = 'quickbooks';
  }
  record.bigFormInvitationSentAt = new Date().toISOString();
  await saveRegistration(record);
}

async function processInvoice(invoiceId: string) {
  const record = await getRegistrationByInvoice(invoiceId);
  if (!record) return;

  for (let attempt = 0; attempt < PAYMENT_RETRY_DELAYS_MS.length; attempt += 1) {
    const delay = PAYMENT_RETRY_DELAYS_MS[attempt];
    if (delay) await wait(delay);

    const invoice = await getInvoice(invoiceId);
    const total = Number(invoice.TotalAmt || 0);
    const balance = Number(invoice.Balance || 0);
    console.info('QuickBooks invoice payment check completed.', {
      invoiceId,
      attempt: attempt + 1,
      total,
      balance,
    });

    if (total >= record.depositCents / 100 && balance <= 0) {
      await sendPaidInvitation(invoiceId);
      console.info('QuickBooks paid-registration invitation completed.', { invoiceId });
      return;
    }
  }

  console.warn('QuickBooks payment remained unsettled after webhook retries.', { invoiceId });
}

async function processEntity(entity: WebhookEntity) {
  if (!entity.id || entity.operation === 'Delete') return;
  if (entity.name === 'Payment' && (entity.operation === 'Create' || entity.operation === 'Update')) {
    const payment = await getPayment(entity.id);
    for (const invoiceId of paymentInvoiceIds(payment).keys()) await processInvoice(invoiceId);
  }
}

async function processWebhookPayload(payload: { eventNotifications?: Array<{ realmId?: string; dataChangeEvent?: { entities?: WebhookEntity[] } }> }) {
  const connectedRealm = await connectedRealmId();
  const entities = (payload.eventNotifications || [])
    .filter((notification) => notification.realmId === connectedRealm)
    .flatMap((notification) => notification.dataChangeEvent?.entities || []);
  for (const entity of entities) await processEntity(entity);
}

export default async function quickBooksWebhook(request: Request, context: Context) {
  if (request.method !== 'POST') return json('Method not allowed.', 405);
  const rawBody = await request.text();
  const signature = request.headers.get('intuit-signature') || '';
  const verifier = process.env.QBO_WEBHOOK_VERIFIER_TOKEN?.trim() || '';
  if (!verifyWebhookSignature(rawBody, signature, verifier)) return json('Invalid signature.', 401);

  let payload: { eventNotifications?: Array<{ realmId?: string; dataChangeEvent?: { entities?: WebhookEntity[] } }> };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch (error) {
    console.error('QuickBooks webhook payload was invalid.', error);
    return json('Invalid webhook payload.', 400);
  }

  context.waitUntil(processWebhookPayload(payload).catch((error) => {
    console.error('QuickBooks webhook processing failed.', error);
  }));
  return json('Webhook accepted.', 200);
}

export const config: Config = { path: '/api/quickbooks/webhook' };
