import { createHmac, timingSafeEqual } from 'node:crypto';

const kaseraApiUrl = 'https://pay.kasera.id/v1';

export async function createKaseraPayment({ invoiceId, amount, description, customer, deliveryDate }) {
  const { readPlatformKaseraCredentials } = await import('./platform-kasera.js');
  const { apiKey } = await readPlatformKaseraCredentials();
  if (!apiKey) throw new Error('Kasera API key belum dikonfigurasi di server.');

  const returnUrl = process.env.CLIENT_ORIGIN;
  if (!returnUrl) throw new Error('CLIENT_ORIGIN harus diatur untuk alur checkout Kasera.');

  const paymentRequest = {
    amount,
    description,
    external_id: `school-invoice-${invoiceId}`,
    merchant_ref: `INV-${invoiceId}`,
    payment_methods: ['qris'],
    checkout: { steps: ['payment'] },
    expires_in_minutes: 60,
    return_url: returnUrl
  };
  if (customer) paymentRequest.customer = customer;
  if (deliveryDate) {
    paymentRequest.delivery_date = deliveryDate;
    paymentRequest.delivery_terms_shown = true;
  }

  let response;
  try {
    response = await fetch(`${kaseraApiUrl}/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `school-invoice-${invoiceId}`
      },
      body: JSON.stringify(paymentRequest),
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    throw new Error(`Kasera tidak dapat dihubungi: ${error.message}`);
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error?.message || `Kasera menolak permintaan pembayaran (HTTP ${response.status}).`);
  }
  if (typeof body.id !== 'string' || typeof body.checkout_url !== 'string'
      || Number(body.amount) !== amount) {
    throw new Error('Respons pembayaran Kasera tidak valid.');
  }
  const checkoutUrl = new URL(body.checkout_url);
  if (checkoutUrl.protocol !== 'https:' || checkoutUrl.hostname !== 'pay.kasera.id') {
    throw new Error('Kasera mengembalikan alamat checkout yang tidak valid.');
  }
  return {
    paymentId: body.id,
    checkoutUrl: checkoutUrl.toString(),
    expiresAt: body.expires_at || null
  };
}

export function verifyKaseraWebhook(rawBody, signatureHeader, secret, now = Date.now()) {
  if (!Buffer.isBuffer(rawBody) || typeof signatureHeader !== 'string' || !secret) return false;
  const parts = signatureHeader.split(',').map((part) => part.trim());
  const timestampPart = parts.find((part) => part.startsWith('t='));
  const timestamp = Number(timestampPart?.slice(2));
  if (!Number.isInteger(timestamp) || Math.abs(now / 1000 - timestamp) > 300) return false;

  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest();
  return parts.filter((part) => part.startsWith('v1=')).some((part) => {
    const supplied = Buffer.from(part.slice(3), 'hex');
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  });
}
