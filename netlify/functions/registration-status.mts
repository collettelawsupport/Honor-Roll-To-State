import type { Config } from '@netlify/functions';
import { json } from '../lib/http.mts';
import { getRegistration } from '../lib/store.mts';
import { publicStatus, secureEqual } from '../lib/workflow.mts';

export default async function registrationStatus(request: Request) {
  if (request.method !== 'GET') return json('Method not allowed.', 405);
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  const token = url.searchParams.get('token') || '';
  if (!/^[a-f0-9-]{36}$/i.test(id) || !token) return json('Registration not found.', 404);
  const record = await getRegistration(id);
  if (!record || !secureEqual(token, record.statusToken)) return json('Registration not found.', 404);
  return json('Registration status found.', 200, publicStatus(record));
}

export const config: Config = { path: '/api/registration-status' };
