export const businessStates: Record<string, string> = {
  DRAFT: 'Draft', EMAIL_VERIFICATION_REQUIRED: 'Verify email', COMPLIANCE_INCOMPLETE: 'Setup in progress',
  COMPLIANCE_SUBMITTED: 'Awaiting review', UNDER_REVIEW: 'Under review', ADDITIONAL_INFORMATION_REQUIRED: 'More information needed',
  APPROVED: 'Approved', ACTIVE: 'Active', REJECTED: 'Rejected', SUSPENDED: 'Suspended', CLOSED: 'Closed',
};

export const businessSetupStates: Record<string, string> = {
  PENDING: 'Not started', PROVISIONING: 'Setting up accounts', AWAITING_OWNER_SMART_ACCOUNT: 'Waiting for USDC account',
  RECONCILIATION_REQUIRED: 'Checking bank account', READY: 'Accounts ready', SUSPENDED: 'Account setup suspended',
};

export function businessDate(value: string | null | undefined) {
  if (!value) return 'Not yet';
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(date.getTime()) ? 'Not provided' : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
