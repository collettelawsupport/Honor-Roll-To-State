import type { Config } from '@netlify/functions';
import { HttpError, errorResponse, json, readJsonBody } from '../lib/http.mts';
import { quickBooksAuthorizationUrl } from '../lib/quickbooks.mts';
import { secureEqual } from '../lib/workflow.mts';

export default async function quickBooksConnect(request: Request) {
  if (request.method !== 'POST') return json('Method not allowed.', 405);
  try {
    const configuredKey = process.env.QBO_SETUP_KEY?.trim();
    if (!configuredKey) throw new HttpError('QuickBooks setup is not configured.', 503);
    const parsed = await readJsonBody(request, 20_000);
    const suppliedKey = parsed && typeof parsed === 'object' && 'setupKey' in parsed ? String(parsed.setupKey) : '';
    if (!secureEqual(suppliedKey, configuredKey)) throw new HttpError('The setup key is not valid.', 401);
    return json('QuickBooks authorization is ready.', 200, { authorizationUrl: await quickBooksAuthorizationUrl() });
  } catch (error) {
    return errorResponse(error, 'QuickBooks connection could not be started.');
  }
}

export const config: Config = { path: '/api/quickbooks/connect' };
