# Phone OTP delivery

Oynk supports two explicit phone-verification modes. The selected mode is a
deployment decision; production never falls back to a development code.

## Development

```dotenv
APP_ENV=development
PHONE_OTP_PROVIDER=development
PHONE_OTP_DEVELOPMENT_CODE_VISIBLE=true
```

The API accepts the documented development fixture. Debug mobile builds may
offer to fill that code. Do not use this mode on a public deployment.

## Africa's Talking test in development

```dotenv
APP_ENV=development
PHONE_OTP_PROVIDER=africastalking
PHONE_OTP_DEVELOPMENT_CODE_VISIBLE=true
AFRICASTALKING_USERNAME=<live-application-username>
AFRICASTALKING_API_KEY=<secret>
AFRICASTALKING_SENDER_ID=<approved-sender-id>
AFRICASTALKING_API_URL=https://api.africastalking.com/version1/messaging
```

Enter the real phone number in the app. The input remains empty while the SMS
is delivered. A debug build may still expose the development-code shortcut so
the rest of onboarding can be tested if delivery is unavailable.

Africa's Talking response codes 100, 101 and 102 only confirm acceptance into
the provider/telco path. They are not proof that the handset received the SMS.
Use delivery reports and the provider dashboard when diagnosing delivery.

## Production

```dotenv
APP_ENV=production
PHONE_OTP_PROVIDER=africastalking
PHONE_OTP_DEVELOPMENT_CODE_VISIBLE=false
AFRICASTALKING_USERNAME=<live-application-username>
AFRICASTALKING_API_KEY=<secret>
AFRICASTALKING_SENDER_ID=<approved-sender-id>
AFRICASTALKING_API_URL=https://api.africastalking.com/version1/messaging
```

The API refuses to start in production if the provider is not Africa's
Talking, if development-code visibility is enabled, if credentials are
missing, or if the sandbox username is configured. Store the API key only in
the backend secret manager. Never add it to an Expo environment variable.

Before launch, verify the sender ID is approved for Nigerian transactional
traffic, test DND delivery as applicable, and monitor provider delivery
callbacks, request failure rates, resend rates and verification success rates.

