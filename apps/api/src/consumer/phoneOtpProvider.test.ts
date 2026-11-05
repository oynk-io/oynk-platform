import assert from 'node:assert/strict';
import test from 'node:test';

process.env.PHONE_OTP_PROVIDER = 'africastalking';
process.env.PHONE_OTP_DEVELOPMENT_CODE_VISIBLE = 'true';
process.env.AFRICASTALKING_USERNAME = 'oynk-test';
process.env.AFRICASTALKING_API_KEY = 'test-key';
process.env.AFRICASTALKING_SENDER_ID = 'Oynk';
process.env.ADMIN_API_KEY ||= '01234567890123456789012345678901';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
process.env.BSC_RPC_URL ||= 'https://example.invalid';
process.env.SOLANA_RPC_URL ||= 'https://example.invalid';

test('Africa\'s Talking OTP sends a normalized form request and accepts queued delivery', async () => {
  const { deliverPhoneOtp } = await import('./phoneOtpProvider.js');
  let captured: RequestInit | undefined;
  const delivery = await deliverPhoneOtp('+2348012345678', '314159', async (_url, init) => {
    captured = init;
    return Response.json({ SMSMessageData: { Recipients: [{ number: '+2348012345678', statusCode: 102, messageId: 'AT-test' }] } });
  });
  const form = new URLSearchParams(String(captured?.body));
  assert.equal(captured?.headers && (captured.headers as Record<string,string>).apiKey, 'test-key');
  assert.equal(form.get('username'), 'oynk-test');
  assert.equal(form.get('to'), '+2348012345678');
  assert.equal(form.get('from'), 'Oynk');
  assert.match(form.get('message') ?? '', /314159/);
  assert.deepEqual(delivery, { provider: 'africastalking', accepted: true, providerStatusCode: 102, providerMessageId: 'AT-test' });
});

test('Africa\'s Talking OTP rejects a provider-level failure without leaking its payload', async () => {
  const { deliverPhoneOtp, PhoneOtpDeliveryError } = await import('./phoneOtpProvider.js');
  await assert.rejects(
    () => deliverPhoneOtp('+2348012345678', '314159', async () => Response.json({ SMSMessageData: { Recipients: [{ number: '+2348012345678', statusCode: 405 }] } })),
    (error: unknown) => error instanceof PhoneOtpDeliveryError && error.reason === 'REJECTED',
  );
});
