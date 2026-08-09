# Console validation audit

Date: 2026-08-06

Scope: `apps/console` authentication and account-creation forms.

## Forms audited

- `/login`: work email and password.
- `/signup/business`: contact, organization, country, password, and terms fields.
- `/signup/partner`: currently shares the business signup fields; partner capabilities and multi-country onboarding are not connected in this phase.
- `/verify-otp`: one six-digit code and resend action.
- `/forgot-password`: account email.
- `/reset-password`: reset code and new password.
- `/invitation`: informational placeholder with no active form.
- Role home shells: no data-entry forms yet.

## Existing behavior

- Forms relied mainly on native browser `required`, `type=email`, `pattern`, and `maxLength` constraints.
- API validation errors could carry `fieldErrors`, but form components discarded them and displayed only the top-level message.
- `ApiError` preserved a code and optional fields, but not HTTP status, request ID, structured details, or a distinct network-failure state.
- Signup and authentication success immediately navigated without durable local confirmation or a toast.
- Errors did not consistently set `aria-invalid`, connect messages with `aria-describedby`, or focus the first invalid field.
- There was no error summary, toast provider, modal policy, or reusable form state.
- Registration and operating countries were free-text two-character inputs that required users to know ISO codes.
- OTP resend had no visible countdown and feedback was an inline sentence only.
- Password reset did not ask users to confirm the new password.

## Backend error shape

Current authentication errors generally use:

```ts
{
  error: string;
  code: string;
  fieldErrors?: Record<string, string>;
  requestId?: string;
}
```

Known codes include `VALIDATION_ERROR`, `ACCOUNT_EXISTS`, `INVALID_CREDENTIALS`, `OTP_INVALID`, `OTP_RESEND_UNAVAILABLE`, `RATE_LIMITED`, `UNAUTHENTICATED`, `CSRF_INVALID`, and `ORGANIZATION_DENIED`. The API does not currently distinguish incorrect, expired, and attempt-exhausted OTPs, so the console can provide safe code-aware guidance but cannot always identify the exact OTP condition.

## Field-name consistency

Signup frontend and backend names align for `firstName`, `lastName`, `email`, `phone`, `legalName`, `tradingName`, `registrationCountry`, `operatingCountry`, `password`, `confirmPassword`, and `acceptedTerms`. Future APIs may use snake_case, so normalization must support an explicit alias map rather than embedding form-specific rules in the API client.

## Accessibility gaps

- Error text was not programmatically associated with its input.
- Invalid controls were not announced consistently.
- The first invalid control was not focused or scrolled into view.
- Error lists were not available as a live region.
- Country fields had no searchable, keyboard-operable chooser.
- Success and error feedback could disappear through navigation without being announced.

## Proposed approach

1. Add a typed, reusable `FormErrorState` and pure validation functions.
2. Normalize API failures into a status-aware `ApiError` without form-specific mappings.
3. Map API errors to form fields at each form boundary.
4. Add accessible field wrappers and a clickable error summary.
5. Add a bounded toast provider with duplicate suppression and live regions.
6. Bundle a static ISO alpha-2 list and render names with English `Intl.DisplayNames`.
7. Add searchable single- and multi-country comboboxes storing canonical codes.
8. Test pure validation, country search, API normalization, and toast state behavior without adding a new dependency.

## Explicit limitations

- Partner capability and operating-country multi-select fields are not part of the current backend signup contract. The reusable multi-select will be implemented and tested, but not submitted as fabricated partner data.
- Compliance forms do not yet exist.
- Browser component and Playwright infrastructure is not installed; this phase can add testable pure state/validation coverage and document the remaining browser coverage gap.
