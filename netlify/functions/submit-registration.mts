import { randomBytes, randomUUID } from 'node:crypto';
import type { Config } from '@netlify/functions';
import { HttpError, errorResponse, json, readJsonBody } from '../lib/http.mts';
import {
  createCustomer,
  createDepositInvoice,
  registrationFallbackUrl,
  sendInvoice,
} from '../lib/quickbooks.mts';
import {
  createRegistration,
  getRegistrationByRequest,
  mapInvoice,
  saveRegistration,
} from '../lib/store.mts';
import type { RegistrationRecord } from '../lib/types.mts';
import { normalizeRegistrationValues, normalizeSubmissionKey } from '../lib/workflow.mts';

async function ensureInvoice(record: RegistrationRecord) {
  record.qbo ||= {};
  if (!record.qbo.customerId) {
    record.qbo.customerId = await createCustomer(record);
    await saveRegistration(record);
  }
  if (!record.qbo.invoiceId) {
    const invoice = await createDepositInvoice(record);
    record.qbo = { ...record.qbo, ...invoice };
    record.status = 'invoice_created';
    await saveRegistration(record);
    await mapInvoice(invoice.invoiceId, record.id);
  }
  if (!record.qbo.invoiceId) throw new Error('The QuickBooks invoice ID is missing.');
  const sent = await sendInvoice(record.qbo.invoiceId, record.values.email);
  record.qbo.invoiceNumber = sent.invoiceNumber || record.qbo.invoiceNumber;
  record.qbo.invoiceUrl = sent.invoiceUrl || record.qbo.invoiceUrl;
  record.status = record.paidAt ? 'paid' : 'invoice_created';
  delete record.lastError;
  await saveRegistration(record);
  return record.qbo.invoiceUrl || registrationFallbackUrl(record);
}

export default async function submitRegistration(request: Request) {
  if (request.method !== 'POST') return json('Method not allowed.', 405);

  let record: RegistrationRecord | null = null;
  try {
    const parsed = await readJsonBody(request);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new HttpError('The registration information is missing.');
    if ('botField' in parsed && String(parsed.botField).trim()) {
      return json('Registration received.', 200, { checkoutUrl: '/' });
    }
    const submissionKey = normalizeSubmissionKey('submissionKey' in parsed ? parsed.submissionKey : null);
    const normalized = normalizeRegistrationValues('values' in parsed ? parsed.values : null);
    record = await getRegistrationByRequest(submissionKey);
    if (!record) {
      const now = new Date().toISOString();
      record = await createRegistration({
        id: randomUUID(),
        submissionKey,
        statusToken: randomBytes(32).toString('base64url'),
        workflowToken: randomBytes(32).toString('base64url'),
        createdAt: now,
        updatedAt: now,
        status: 'submitted',
        values: normalized.values,
        entryFeeCents: normalized.entryFeeCents,
        depositCents: normalized.depositCents,
      });
    }

    const checkoutUrl = await ensureInvoice(record);
    return json('Your QuickBooks invoice is ready.', 201, { registrationId: record.id, checkoutUrl });
  } catch (error) {
    if (record) {
      record.status = 'invoice_error';
      record.lastError = error instanceof Error ? error.message.slice(0, 1_000) : 'Unknown QuickBooks error';
      await saveRegistration(record).catch(() => undefined);
      console.error('QuickBooks invoice creation failed.', error);
      if (error instanceof HttpError) return errorResponse(error, 'The QuickBooks invoice could not be created.');
      return json('Your registration was saved, but the QuickBooks invoice could not be created. Please try again in a moment.', 502);
    }
    return errorResponse(error, 'The registration could not be saved. Please try again.');
  }
}

export const config: Config = { path: '/api/submit-registration' };
