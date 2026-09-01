import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { publicQuickBooksInvoiceUrl } from '../netlify/lib/invoice-url.mts';
import { buildBigFormInvitationEmail } from '../netlify/lib/email.mts';
import {
  assertRegistrationWorkflowReady,
  completeQuickBooksAuthorization,
  executeQuickBooksRequest,
  missingRegistrationWorkflowSettings,
  QuickBooksApiError,
  QuickBooksOAuthError,
  QuickBooksReconnectRequiredError,
  refreshQuickBooksTokens,
} from '../netlify/lib/quickbooks.mts';
import {
  buildDepositInvoice,
  buildBigFormUrl,
  buildFinalInvoiceLines,
  normalizeBigFormFees,
  normalizeRegistrationValues,
  verifyWebhookSignature,
} from '../netlify/lib/workflow.mts';
import type { RegistrationRecord } from '../netlify/lib/types.mts';
import { registrationStoreName, type QuickBooksTokens } from '../netlify/lib/store.mts';

const quietLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

const quickBooksTokens: QuickBooksTokens = {
  accessToken: 'expired-access-token',
  refreshToken: 'valid-refresh-token',
  expiresAt: 0,
  refreshTokenExpiresAt: Date.now() + 60_000,
  realmId: '123456789',
};

const values = {
  contestant_first_name: 'Taylor',
  contestant_last_name: 'Sample',
  chaperone_first_name: 'Jordan',
  chaperone_last_name: 'Sample',
  contestant_date_of_birth: '2018-04-12',
  contestant_age: '8',
  age_unit: 'years',
  address_line_1: '100 Main Street',
  city: 'College Station',
  state: 'Texas',
  zip_code: '77840',
  phone: '979-555-0100',
  email: 'parent@example.com',
  age_division: '7 - 9 years',
  entry_level: 'honor_roll',
  signature_kind: 'typed',
  signature_name: 'Jordan Sample',
  release_accepted: 'yes',
};

const record: RegistrationRecord = {
  id: '11111111-1111-4111-8111-111111111111',
  submissionKey: '22222222-2222-4222-8222-222222222222',
  statusToken: 'status-token',
  workflowToken: 'workflow-token',
  createdAt: '2026-08-30T12:00:00.000Z',
  updatedAt: '2026-08-30T12:00:00.000Z',
  status: 'invoice_created',
  values,
  entryFeeCents: 33_000,
  depositCents: 10_000,
  qbo: { customerId: '42', invoiceId: '99' },
};

test('validates the published registration choices and entry fee', () => {
  const normalized = normalizeRegistrationValues(values);
  assert.equal(normalized.entryFeeCents, 33_000);
  assert.equal(normalized.depositCents, 10_000);
  assert.equal(normalized.values.email, 'parent@example.com');
});

test('keeps production registrations and OAuth tokens isolated from sandbox data', () => {
  assert.equal(registrationStoreName('sandbox'), 'olm-honor-roll-to-state');
  assert.equal(registrationStoreName('production'), 'olm-honor-roll-to-state-production');
  assert.notEqual(registrationStoreName('sandbox'), registrationStoreName('production'));
});

test('requires an actual signature for the selected signature method', () => {
  assert.throws(
    () => normalizeRegistrationValues({ ...values, signature_kind: 'drawn', signature_name: '', signature_data: '' }),
    /draw the parent or guardian signature/i,
  );
});

test('uses the published $75 deposit for both Winner\'s Circle choices', () => {
  const lowerFee = normalizeRegistrationValues({ ...values, entry_level: 'winners_circle_125' });
  const partyFee = normalizeRegistrationValues({ ...values, entry_level: 'winners_circle_175' });
  assert.deepEqual(
    [lowerFee.entryFeeCents, lowerFee.depositCents, partyFee.entryFeeCents, partyFee.depositCents],
    [12_500, 7_500, 17_500, 7_500],
  );
});

test('builds a $100 deposit-only QuickBooks invoice', () => {
  const invoice = buildDepositInvoice(record, '7');
  assert.equal(invoice.Line.length, 1);
  assert.equal(invoice.Line[0].Amount, 100);
  assert.equal(invoice.CustomerRef.value, '42');
  assert.equal(invoice.AllowOnlineCreditCardPayment, true);
  assert.match(invoice.Line[0].Description, /deposit due now/i);
  assert.match(invoice.CustomerMemo.value, /Deposit due now: \$100\.00/);
  assert.match(invoice.CustomerMemo.value, /Remaining entry fee balance after deposit: \$230\.00/);
  assert.match(invoice.CustomerMemo.value, /due on or before October 9, 2026/);
});

test('replaces the deposit line with the full entry fee and discounts only eligible optionals', () => {
  const fees = normalizeBigFormFees({
    lines: [
      { category: 'Optional Categories', sourceField: 'miss_photogenic', item: 'Miss Photogenic', quantity: 1, rate: 50, amount: 50, status: 'known' },
      { category: 'Advertising', sourceField: 'full_page_ads', item: 'Full Page Program Ad', quantity: 1, rate: 100, amount: 100, status: 'known' },
      { item: 'Quarter Page Ad', quantity: 1, rate: null, amount: null, status: 'pending' },
      { item: 'Free optional', quantity: 1, rate: 0, amount: 0, status: 'free' },
    ],
  });
  const lines = buildFinalInvoiceLines(record, fees, '7', '8');
  assert.deepEqual(lines.map((line) => line.Amount), [330, 25, 100]);
  assert.equal(lines[1].SalesItemLineDetail.UnitPrice, 25);
  assert.match(lines[1].Description, /Honor Roll 50% optional price/);
  assert.equal(fees.pendingCount, 1);
  assert.equal(fees.knownTotal, 150);
});

test('routes the paid Big Form invitation back to the Honor Roll workflow', () => {
  const url = new URL(buildBigFormUrl(record, 'https://big-form.example/'));
  assert.equal(url.searchParams.get('registration'), record.id);
  assert.equal(url.searchParams.get('workflow_token'), record.workflowToken);
  assert.equal(url.searchParams.get('workflow'), 'honor_roll');
});

test('puts a prominent Big Form link in both versions of the invitation email', () => {
  const bigFormUrl = buildBigFormUrl(record, 'https://bigforms.texasourlittlemiss.net');
  const message = buildBigFormInvitationEmail(record, bigFormUrl);
  assert.match(message.subject, /complete Taylor Sample's Big Form/i);
  assert.match(message.html, />Complete the Big Form<\/a>/);
  assert.match(message.html, /registration=11111111-1111-4111-8111-111111111111/);
  assert.match(message.html, /&amp;workflow_token=workflow-token/);
  assert.match(message.text, /Complete the contestant Big Form here:/);
  assert.match(message.text, new RegExp(bigFormUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('accepts a Big Form host without an explicit protocol', () => {
  const url = new URL(buildBigFormUrl(record, 'bigforms.texasourlittlemiss.net'));
  assert.equal(url.origin, 'https://bigforms.texasourlittlemiss.net');
  assert.equal(url.searchParams.get('registration'), record.id);
  assert.equal(url.searchParams.get('workflow_token'), record.workflowToken);
});

test('rejects a non-web Big Form URL', () => {
  assert.throws(
    () => buildBigFormUrl(record, 'javascript:alert(1)'),
    /must use HTTP or HTTPS/i,
  );
});

test('does not expose unusable QuickBooks sandbox invoice links', () => {
  assert.equal(
    publicQuickBooksInvoiceUrl('https://developer.intuit.com/app/developer/sandbox', 'sandbox'),
    '',
  );
  assert.equal(
    publicQuickBooksInvoiceUrl('https://app.qbo.intuit.com/app/invoice?txnId=99', 'production'),
    'https://app.qbo.intuit.com/app/invoice?txnId=99',
  );
  assert.equal(publicQuickBooksInvoiceUrl('javascript:alert(1)', 'production'), '');
});

test('treats a duplicate OAuth callback as success when the same company is already connected', async () => {
  const connected = { ...quickBooksTokens, realmId: '9341457826769811' };
  let exchanged = false;

  const result = await completeQuickBooksAuthorization(
    'one-time-code',
    connected.realmId,
    'already-consumed-state',
    async () => false,
    async () => connected,
    async () => {
      exchanged = true;
      return connected;
    },
  );

  assert.equal(result, connected);
  assert.equal(exchanged, false);
});

test('rejects an invalid OAuth callback when no matching company is connected', async () => {
  await assert.rejects(
    () => completeQuickBooksAuthorization(
      'one-time-code',
      '9341457826769811',
      'invalid-state',
      async () => false,
      async () => null,
      async () => assert.fail('An invalid callback must not exchange an authorization code.'),
    ),
    /missing or expired/i,
  );
});

test('verifies Intuit webhook signatures over the raw body', () => {
  const body = '{"eventNotifications":[]}';
  const token = 'webhook-verifier';
  const signature = createHmac('sha256', token).update(body).digest('base64');
  assert.equal(verifyWebhookSignature(body, signature, token), true);
  assert.equal(verifyWebhookSignature(`${body} `, signature, token), false);
});

test('preserves QuickBooks validation faults and the intuit_tid for troubleshooting', async () => {
  const response = new Response(JSON.stringify({
    Fault: {
      Error: [{
        Message: 'Validation Fault',
        Detail: 'Invalid Reference Id',
        code: '2500',
        element: 'CustomerRef',
      }],
    },
  }), {
    status: 400,
    headers: { 'content-type': 'application/json', intuit_tid: 'validation-tid-123' },
  });

  await assert.rejects(
    () => executeQuickBooksRequest(
      quickBooksTokens,
      '/invoice?minorversion=75',
      { method: 'POST' },
      async () => response,
      async () => quickBooksTokens,
      async () => undefined,
      quietLogger,
    ),
    (error: unknown) => {
      assert.ok(error instanceof QuickBooksApiError);
      assert.equal(error.status, 400);
      assert.equal(error.intuitTid, 'validation-tid-123');
      assert.equal(error.faults[0]?.code, '2500');
      assert.match(error.message, /Invalid Reference Id/);
      return true;
    },
  );
});

test('refreshes once after a QuickBooks 401 and retries with the rotated access token', async () => {
  const refreshed = { ...quickBooksTokens, accessToken: 'fresh-access-token', expiresAt: Date.now() + 3_600_000 };
  const requestedTokens: string[] = [];
  let refreshCount = 0;

  const result = await executeQuickBooksRequest<{ Invoice: { Id: string } }>(
    quickBooksTokens,
    '/invoice/99?minorversion=75',
    {},
    async (tokens) => {
      requestedTokens.push(tokens.accessToken);
      return tokens.accessToken === 'fresh-access-token'
        ? new Response(JSON.stringify({ Invoice: { Id: '99' } }), { status: 200, headers: { intuit_tid: 'success-tid-456' } })
        : new Response('{}', { status: 401, headers: { intuit_tid: 'expired-tid-123' } });
    },
    async () => {
      refreshCount += 1;
      return refreshed;
    },
    async () => assert.fail('Valid refreshed credentials must not be cleared.'),
    quietLogger,
  );

  assert.equal(result.Invoice.Id, '99');
  assert.deepEqual(requestedTokens, ['expired-access-token', 'fresh-access-token']);
  assert.equal(refreshCount, 1);
});

test('requires reconnection after QuickBooks rejects the refreshed access token', async () => {
  const refreshed = { ...quickBooksTokens, accessToken: 'still-rejected', expiresAt: Date.now() + 3_600_000 };
  let cleared = false;

  await assert.rejects(
    () => executeQuickBooksRequest(
      quickBooksTokens,
      '/customer?minorversion=75',
      { method: 'POST' },
      async () => new Response('{}', { status: 401, headers: { intuit_tid: 'reconnect-tid-789' } }),
      async () => refreshed,
      async () => { cleared = true; },
      quietLogger,
    ),
    (error: unknown) => {
      assert.ok(error instanceof QuickBooksReconnectRequiredError);
      assert.equal(error.intuitTid, 'reconnect-tid-789');
      assert.equal(error.details.reconnectRequired, true);
      return true;
    },
  );
  assert.equal(cleared, true);
});

test('clears an invalid refresh token and returns a reconnect-required error', async () => {
  let cleared = false;

  await assert.rejects(
    () => refreshQuickBooksTokens(
      quickBooksTokens,
      async () => {
        throw new QuickBooksOAuthError(
          'QuickBooks authorization failed: refresh token is invalid',
          400,
          'invalid_grant',
          'oauth-tid-321',
        );
      },
      async () => { cleared = true; },
      quietLogger,
    ),
    (error: unknown) => {
      assert.ok(error instanceof QuickBooksReconnectRequiredError);
      assert.equal(error.intuitTid, 'oauth-tid-321');
      assert.equal(error.details.reconnectUrl, '/connect/');
      assert.equal(error.details.supportUrl, '/support/');
      return true;
    },
  );
  assert.equal(cleared, true);
});

test('does not discard credentials for a transient OAuth service error', async () => {
  let cleared = false;
  const transient = new QuickBooksOAuthError('QuickBooks authorization failed: unavailable', 503, 'temporarily_unavailable', 'oauth-tid-503');

  await assert.rejects(
    () => refreshQuickBooksTokens(
      quickBooksTokens,
      async () => { throw transient; },
      async () => { cleared = true; },
      quietLogger,
    ),
    (error: unknown) => error === transient,
  );
  assert.equal(cleared, false);
});

test('logs the intuit_tid without logging a QuickBooks invoice recipient email address', async () => {
  const logged: Array<Record<string, unknown>> = [];
  const logger = {
    info: (_message: unknown, context: Record<string, unknown>) => { logged.push(context); },
    warn: () => undefined,
    error: () => undefined,
  };

  await executeQuickBooksRequest(
    quickBooksTokens,
    '/invoice/99/send?sendTo=parent@example.com&minorversion=75',
    { method: 'POST' },
    async () => new Response('{}', { status: 200, headers: { intuit_tid: 'send-tid-654' } }),
    async () => quickBooksTokens,
    async () => undefined,
    logger,
  );

  assert.equal(logged[0]?.intuitTid, 'send-tid-654');
  assert.equal(logged[0]?.endpoint, '/invoice/:id/send');
  assert.doesNotMatch(JSON.stringify(logged), /parent@example\.com/);
});

test('blocks registration before storing contestant data when workflow settings are incomplete', async () => {
  const missing = missingRegistrationWorkflowSettings({ QBO_ENVIRONMENT: 'staging' });
  assert.ok(missing.includes('QBO_CLIENT_ID'));
  assert.ok(missing.includes('QBO_ENVIRONMENT'));

  await assert.rejects(
    () => assertRegistrationWorkflowReady(
      { QBO_ENVIRONMENT: 'staging' },
      async () => quickBooksTokens,
      quietLogger,
    ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /temporarily unavailable/i);
      return true;
    },
  );
});

test('requires QuickBooks authorization after all workflow settings are configured', async () => {
  const environment = Object.fromEntries([
    'QBO_CLIENT_ID',
    'QBO_CLIENT_SECRET',
    'QBO_SETUP_KEY',
    'QBO_WEBHOOK_VERIFIER_TOKEN',
    'QBO_REGISTRATION_ITEM_ID',
    'QBO_OPTIONAL_ITEM_ID',
    'BIG_FORM_URL',
    'BIG_FORM_CALLBACK_SECRET',
    'REGISTRATION_ENABLED',
  ].map((name) => [name, 'configured'])) as Record<string, string>;
  environment.QBO_ENVIRONMENT = 'sandbox';
  environment.REGISTRATION_ENABLED = 'true';

  await assert.rejects(
    () => assertRegistrationWorkflowReady(environment, async () => null, quietLogger),
    (error: unknown) => {
      assert.ok(error instanceof QuickBooksReconnectRequiredError);
      assert.equal(error.details.reconnectRequired, true);
      return true;
    },
  );
  await assert.doesNotReject(
    () => assertRegistrationWorkflowReady(environment, async () => quickBooksTokens, quietLogger),
  );
});
