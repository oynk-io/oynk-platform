import { config } from '../config.js';

type Recipient = {
  number?: string;
  status?: string;
  statusCode?: number | string;
  messageId?: string;
};

type MessagingResponse = {
  SMSMessageData?: {
    Message?: string;
    Recipients?: Recipient[];
  };
};

export class PhoneOtpDeliveryError extends Error {
  constructor(readonly reason: 'CONFIGURATION' | 'REJECTED' | 'UNAVAILABLE') {
    super(reason);
  }
}

export type PhoneOtpDelivery = {
  provider: 'development' | 'africastalking';
  accepted: boolean;
  providerMessageId?: string;
  providerStatusCode?: number;
};

/**
 * Sends one OTP without exposing credentials, recipient data or provider
 * payloads to callers. Africa's Talking 100/101/102 statuses mean the SMS was
 * accepted for processing; final handset delivery remains asynchronous.
 */
export async function deliverPhoneOtp(
  phone: string,
  code: string,
  request: typeof fetch = fetch,
): Promise<PhoneOtpDelivery> {
  if (config.PHONE_OTP_PROVIDER === 'development') {
    return { provider: 'development', accepted: true };
  }
  if (!config.AFRICASTALKING_API_KEY || !config.AFRICASTALKING_USERNAME) {
    throw new PhoneOtpDeliveryError('CONFIGURATION');
  }

  const body = new URLSearchParams({
    username: config.AFRICASTALKING_USERNAME,
    to: phone,
    message: `Your Oynk verification code is ${code}. It expires in 5 minutes. Do not share it.`,
  });
  if (config.AFRICASTALKING_SENDER_ID) body.set('from', config.AFRICASTALKING_SENDER_ID);

  let response: Response;
  try {
    response = await request(config.AFRICASTALKING_API_URL, {
      method: 'POST',
      headers: {
        apiKey: config.AFRICASTALKING_API_KEY,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new PhoneOtpDeliveryError('UNAVAILABLE');
  }

  const result = await response.json().catch(() => null) as MessagingResponse | null;
  const recipient = result?.SMSMessageData?.Recipients?.find(item => item.number === phone)
    ?? result?.SMSMessageData?.Recipients?.[0];
  const statusCode = Number(recipient?.statusCode);
  if (!response.ok || ![100, 101, 102].includes(statusCode)) {
    throw new PhoneOtpDeliveryError(response.status >= 500 ? 'UNAVAILABLE' : 'REJECTED');
  }
  return {
    provider: 'africastalking',
    accepted: true,
    providerStatusCode: statusCode,
    ...(recipient?.messageId ? { providerMessageId: recipient.messageId } : {}),
  };
}
