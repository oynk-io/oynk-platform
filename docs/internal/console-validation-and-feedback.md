# Console validation and feedback

## Field-error conventions

Console forms use `FormErrorState`, containing independent field errors, an optional form error, an error code, and an optional request ID. Client validation runs before API submission. Backend `fieldErrors` are normalized at the form boundary, including explicit snake-case aliases.

Each invalid input must use `aria-invalid`, reference its message with `aria-describedby`, preserve its value, and clear only its own error when edited. After a rejected submission, `focusFirstInvalidField` moves focus and scrolls the first invalid control into view while respecting reduced-motion preferences.

Validation copy lives in `src/forms/validationCopy.ts`. Raw schema, database, SMTP, and stack-trace text must never be rendered.

## Form-summary conventions

`FormErrorSummary` appears only after a failed submission. It is an alert region with a concise explanation and human-readable links to invalid fields. Request IDs may be displayed as support references. The summary supplements field messages; it does not replace them.

## Toast conventions

`ToastProvider` exposes success, error, warning, information, and generic show methods. The visible stack is limited to four and exact duplicate kind/message pairs are suppressed.

- Success: four seconds.
- Information: five seconds.
- Warning: six seconds.
- Error: eight seconds.
- Critical errors may be persistent.

Toasts use polite live regions except errors, which use alert semantics. They have explicit dismiss buttons and restrained top-right placement that becomes edge-safe on mobile.

Use field errors for correctable input. Use a form error and toast for account conflicts, authentication rejection, rate limits, server errors, and network errors. Use success toasts for OTP issuance, account creation, verification, login, resend, and password reset.

## Modal conventions

No ordinary form-validation modal is implemented. Modals are reserved for destructive confirmation, suspended access, expired critical sessions, or consequential workflow transitions. Account conflicts currently provide an inline “Sign in instead” action plus field and toast feedback.

## Country selectors

`CountrySelect` stores an ISO 3166-1 alpha-2 code and displays a searchable English country name. Search supports names, codes, and limited aliases such as UK/GB and USA/US. The list is bundled and requires no network request.

`CountryMultiSelect` uses the same canonical data, prevents duplicate choices, and displays removable chips. It is ready for partner operating-country and corridor forms once those API contracts exist. Do not submit labels in place of codes.

## API error mapping

`ApiError` preserves HTTP status, safe code, normalized field errors, structured details, and request ID. Network failures use status `0` and `NETWORK_ERROR`. The client applies safe fallbacks for validation, authentication, permission, conflict, rate-limit, server, and transport failures. Form-specific mappings remain in forms, not the generic client.

The current API reports a combined `OTP_INVALID` response for incorrect, expired, and exhausted challenges. The console therefore uses safe combined guidance until the backend exposes non-enumerating subcodes.

## Accessibility

- Fields and summaries are programmatically associated.
- The first invalid field receives focus.
- Toasts and inline confirmations use live regions.
- Country selection supports text search, arrow keys, Enter, Escape, outside-click dismissal, and mobile placement.
- OTP uses numeric input mode, one-time-code autocomplete, paste-compatible controlled input, and an explicit label.
- Reduced-motion preferences disable transitions and smooth scrolling.

## Adding validation to a form

1. Define controlled values and a pure validator.
2. Use centralized copy.
3. Render inputs through `FormField` or apply equivalent ARIA attributes.
4. Clear only the edited field error.
5. Validate, set the summary, and focus the first field before calling the API.
6. Convert API failures with `apiErrorToFormState`, then apply form-specific field aliases or codes.
7. Use a toast for the operation outcome and durable inline confirmation when users need to reference it.
8. Add pure tests and browser coverage when the browser-test infrastructure is available.
