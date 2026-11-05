# Consumer account deletion

The mobile path is **Account → Settings → Security → Delete account**. The
consumer must type `DELETE` and approve the request with their primary passkey
or protected device signer. The API records an owner-signed `ACCOUNT_CLOSURE`
request for operations review.

The public instructions are available at `/account-deletion`, including a
support route for a user who cannot access the app.

## Operations procedure

1. Confirm the request is owner-approved and has not been cancelled.
2. Block new activity while the request is being reviewed.
3. Resolve pending transfers, orders, disputes, pools and regulated balances.
4. Explain how the user must independently move assets from any self-custodial
   on-chain address that Oynk cannot delete or recover.
5. Revoke sessions, passkeys, device signers, notification tokens and active
   delegations.
6. Delete or irreversibly anonymize profile, contact, preference, marketing,
   device and non-required operational data.
7. Retain only records required for KYC/AML, fraud, tax, accounting,
   transaction-reconciliation and legal obligations. Restrict retained records
   from normal product use and attach the applicable retention schedule.
8. Complete the request in the operations system and notify the user through a
   verified contact channel.

Do not describe a submitted request as completed deletion. Before launch,
legal/compliance must approve the retention categories, exact retention
periods, deletion SLA, recovery policy and notification copy. Operations must
be able to complete requests even if the user can no longer sign in.

