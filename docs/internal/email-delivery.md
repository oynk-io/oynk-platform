# Email delivery

## Providers

`EMAIL_PROVIDER=development` records a preview delivery and emits only a masked destination plus subject. Development API responses may return a preview OTP. This adapter is rejected when `APP_ENV=production`.

`EMAIL_PROVIDER=zoho-smtp` uses an implicit-TLS SMTP connection and Zoho application-specific credentials. The host is configurable for Zoho regional infrastructure. Normal mailbox passwords must not be used.

Required Zoho settings:

```text
EMAIL_PROVIDER=zoho-smtp
ZOHO_SMTP_HOST=smtp.zoho.com
ZOHO_SMTP_PORT=465
ZOHO_SMTP_SECURE=true
ZOHO_SMTP_USERNAME=<verified Zoho mailbox>
ZOHO_SMTP_APP_PASSWORD=<application-specific password>
EMAIL_FROM_NAME=Oynk
EMAIL_FROM_ADDRESS=no-reply@oynk.io
EMAIL_REPLY_TO=support@oynk.io
```

The current transport requires implicit TLS. Port 587/STARTTLS should not be configured until that transport mode is implemented and tested.

## Delivery behavior

- HTML and plain-text alternatives are generated.
- Header line breaks are removed before SMTP construction.
- Credentials and OTP values are not logged.
- Transient delivery attempts are bounded to three with short backoff.
- Delivery outcomes are recorded in `email_deliveries` without SMTP credentials or message bodies.
- Password-reset mail contains a challenge identifier in the console URL and the OTP separately in the message.

## Test procedure

1. Configure a verified Zoho sender and application password in an uncommitted environment file.
2. Apply migrations.
3. Run `pnpm email:test -- --to <verified-address>`.
4. Confirm receipt, From/Reply-To behavior, and the `email_deliveries` record.
5. Before production, configure and verify SPF, DKIM, and DMARC for the sending domain.

The command masks its destination in logs and never prints SMTP credentials.
