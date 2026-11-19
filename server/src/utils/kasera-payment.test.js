import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { verifyKaseraWebhook } from './kasera-payment.js';

function signatureFor(body, secret, timestamp) {
  const digest = createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(body)
    .digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

test('verifies Kasera v1 signatures with the raw body and accepts rotated secrets', () => {
  const body = Buffer.from('{"id":"evt_1","type":"payment.paid"}');
  const timestamp = 1784512800;
  const now = timestamp * 1000;
  const currentSignature = signatureFor(body, 'current-secret', timestamp);
  const previousSignature = signatureFor(body, 'previous-secret', timestamp);

  assert.equal(verifyKaseraWebhook(body, currentSignature, 'current-secret', now), true);
  assert.equal(verifyKaseraWebhook(
    body,
    `${currentSignature},v1=${previousSignature.slice(previousSignature.indexOf('v1=') + 3)}`,
    'previous-secret',
    now
  ), true);
  assert.equal(verifyKaseraWebhook(Buffer.from(`${body} `), currentSignature, 'current-secret', now), false);
});

test('rejects invalid and stale Kasera v1 signatures', () => {
  const body = Buffer.from('{"id":"evt_1"}');
  const timestamp = 1784512800;
  const signature = signatureFor(body, 'secret', timestamp);

  assert.equal(verifyKaseraWebhook(body, signature, 'wrong-secret', timestamp * 1000), false);
  assert.equal(verifyKaseraWebhook(body, signature, 'secret', (timestamp + 301) * 1000), false);
  assert.equal(verifyKaseraWebhook(body, 't=bad,v1=not-a-signature', 'secret', timestamp * 1000), false);
});
