import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  buildDepositInvoice,
  buildBigFormUrl,
  buildFinalInvoiceLines,
  normalizeBigFormFees,
  normalizeRegistrationValues,
  verifyWebhookSignature,
} from '../netlify/lib/workflow.mts';
import type { RegistrationRecord } from '../netlify/lib/types.mts';

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

test('verifies Intuit webhook signatures over the raw body', () => {
  const body = '{"eventNotifications":[]}';
  const token = 'webhook-verifier';
  const signature = createHmac('sha256', token).update(body).digest('base64');
  assert.equal(verifyWebhookSignature(body, signature, token), true);
  assert.equal(verifyWebhookSignature(`${body} `, signature, token), false);
});
