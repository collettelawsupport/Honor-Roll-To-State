import { getStore } from '@netlify/blobs';
import type { RegistrationRecord } from './types.mts';

const STORE_NAME = 'olm-prelim-to-state';

function store() {
  return getStore({ name: STORE_NAME, consistency: 'strong' });
}

export async function createRegistration(record: RegistrationRecord) {
  const result = await store().setJSON(`registrations/${record.id}.json`, record, { onlyIfNew: true });
  if (!result.modified) throw new Error('Registration ID collision.');
  await store().setJSON(`requests/${record.submissionKey}.json`, { registrationId: record.id }, { onlyIfNew: true });
  return record;
}

export async function saveRegistration(record: RegistrationRecord) {
  record.updatedAt = new Date().toISOString();
  await store().setJSON(`registrations/${record.id}.json`, record);
  return record;
}

export async function getRegistration(id: string) {
  return store().get(`registrations/${id}.json`, { type: 'json' }) as Promise<RegistrationRecord | null>;
}

export async function getRegistrationByRequest(submissionKey: string) {
  const mapping = await store().get(`requests/${submissionKey}.json`, { type: 'json' }) as { registrationId?: string } | null;
  return mapping?.registrationId ? getRegistration(mapping.registrationId) : null;
}

export async function mapInvoice(invoiceId: string, registrationId: string) {
  await store().setJSON(`invoices/${invoiceId}.json`, { registrationId });
}

export async function getRegistrationByInvoice(invoiceId: string) {
  const mapping = await store().get(`invoices/${invoiceId}.json`, { type: 'json' }) as { registrationId?: string } | null;
  return mapping?.registrationId ? getRegistration(mapping.registrationId) : null;
}

export async function saveOauthState(state: string) {
  await store().setJSON(`oauth-states/${state}.json`, { createdAt: new Date().toISOString() }, { onlyIfNew: true });
}

export async function consumeOauthState(state: string) {
  const key = `oauth-states/${state}.json`;
  const saved = await store().get(key, { type: 'json' }) as { createdAt?: string } | null;
  if (!saved?.createdAt) return false;
  const age = Date.now() - new Date(saved.createdAt).getTime();
  if (!Number.isFinite(age) || age < 0 || age > 10 * 60 * 1000) return false;
  await store().delete(key);
  return true;
}

export type QuickBooksTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  refreshTokenExpiresAt?: number;
  realmId: string;
};

export async function getQuickBooksTokens() {
  return store().get('quickbooks/oauth.json', { type: 'json' }) as Promise<QuickBooksTokens | null>;
}

export async function saveQuickBooksTokens(tokens: QuickBooksTokens) {
  await store().setJSON('quickbooks/oauth.json', tokens);
  return tokens;
}
