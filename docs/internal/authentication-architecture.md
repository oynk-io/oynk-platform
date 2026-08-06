# Authentication architecture

## Implemented foundation

Oynk Console uses email/password authentication followed by a six-digit email OTP. The password step never creates an authenticated session. A full session is created only after a valid `SIGN_IN` challenge is consumed.

Passwords use Node's built-in scrypt with a random 128-bit salt and a 512-bit derived key. The encoded record contains the algorithm, salt, and derived key; plaintext passwords are never retained.

OTP and session tokens are generated with the Node cryptographic random source. OTP codes, session tokens, and CSRF tokens are stored only as HMAC-SHA-256 values keyed with `AUTH_TOKEN_PEPPER`.

## Session and CSRF model

- The session identifier is an opaque 256-bit token in an HttpOnly cookie.
- Production cookies are `Secure`, `SameSite=Lax`, host-only, and have an explicit lifetime.
- The session database record contains the token hash, active organization, expiry, revocation state, and limited creation metadata.
- Authenticated session responses rotate a separate session-bound CSRF token.
- Oynk Console holds the CSRF token in memory and sends it in `x-csrf-token` for state-changing requests.
- The API compares its keyed hash against the active session record.
- Logout revokes the database session and expires the browser cookie.

This design avoids a parent-domain session cookie and permits `console.oynk.io` to call `api.oynk.io` with credentialed CORS.

## Account flows

Business and partner signup creates a pending user, organization, owner membership, and email-verification challenge in the database. After email verification, the user becomes active and the organization enters `COMPLIANCE_INCOMPLETE`. Business and partner accounts begin in the configured non-live platform mode.

Password reset sends a purpose-bound code and a console link containing only the challenge identifier. A successful reset revokes every active session for that user.

Internal owners are created only through the guarded CLI. No default internal credentials exist.

## Authorization boundary

Organizations, memberships, roles, and explicit permissions are database-backed. The session response supplies the active organization and its permission list for navigation. Future protected APIs must independently load the active membership and enforce their required permission; hiding a UI control is never authorization.

Current indexing routes retain their existing compatibility behavior. They must move behind `indexing:read` and `indexing:run` when the internal indexing surface is migrated.

## Known limitations

- Authentication rate limiting is process-local in this phase. Production horizontal scaling requires a shared limiter or gateway policy.
- Invitation acceptance and trusted-device sessions are not connected.
- Compliance onboarding APIs begin in Phase 4.
- Password breach screening and step-up authentication for sensitive actions remain follow-up security work.
