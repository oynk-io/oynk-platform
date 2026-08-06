CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  status TEXT NOT NULL CHECK (status IN ('PENDING_VERIFICATION','ACTIVE','SUSPENDED','DISABLED')),
  email_verified_at TIMESTAMPTZ,
  password_changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX users_normalized_email_uidx ON users (LOWER(email));

CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('BUSINESS','SETTLEMENT_PARTNER','INTERNAL')),
  status TEXT NOT NULL CHECK (status IN ('DRAFT','EMAIL_VERIFICATION_REQUIRED','COMPLIANCE_INCOMPLETE','COMPLIANCE_SUBMITTED','UNDER_REVIEW','ADDITIONAL_INFORMATION_REQUIRED','APPROVED','ACTIVE','REJECTED','SUSPENDED','CLOSED')),
  platform_mode TEXT NOT NULL DEFAULT 'SANDBOX' CHECK (platform_mode IN ('SANDBOX','TEST','LIVE')),
  legal_name TEXT NOT NULL,
  trading_name TEXT,
  registration_country TEXT,
  primary_operating_country TEXT,
  default_timezone TEXT NOT NULL DEFAULT 'UTC',
  default_currency TEXT NOT NULL DEFAULT 'USD',
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE roles (
  name TEXT PRIMARY KEY,
  organization_type TEXT NOT NULL CHECK (organization_type IN ('BUSINESS','SETTLEMENT_PARTNER','INTERNAL')),
  description TEXT NOT NULL
);

CREATE TABLE permissions (
  name TEXT PRIMARY KEY,
  description TEXT NOT NULL
);

CREATE TABLE role_permissions (
  role_name TEXT NOT NULL REFERENCES roles(name) ON DELETE CASCADE,
  permission_name TEXT NOT NULL REFERENCES permissions(name) ON DELETE CASCADE,
  PRIMARY KEY (role_name, permission_name)
);

CREATE TABLE organization_memberships (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role_name TEXT NOT NULL REFERENCES roles(name),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('INVITED','ACTIVE','SUSPENDED','REMOVED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, organization_id)
);
CREATE INDEX organization_memberships_org_idx ON organization_memberships (organization_id, status);

CREATE TABLE otp_challenges (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  destination TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('SIGN_IN','EMAIL_VERIFICATION','PASSWORD_RESET','SENSITIVE_ACTION','PARTNER_ACTIVATION','BUSINESS_ACTIVATION')),
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  resend_available_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  invalidated_at TIMESTAMPTZ,
  request_ip TEXT
);
CREATE INDEX otp_challenges_active_idx ON otp_challenges (destination, purpose, expires_at DESC);

CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active_organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  created_ip TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX sessions_user_active_idx ON sessions (user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  result TEXT NOT NULL CHECK (result IN ('SUCCESS','FAILURE','DENIED')),
  request_id TEXT,
  ip_address TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX audit_logs_org_time_idx ON audit_logs (organization_id, created_at DESC);
CREATE INDEX audit_logs_actor_time_idx ON audit_logs (actor_user_id, created_at DESC);

INSERT INTO permissions(name, description) VALUES
 ('payments:read','Read payments'),('payments:create','Create payments'),('payments:refund','Refund payments'),
 ('payouts:read','Read payouts'),('payouts:create','Create payouts'),('payouts:approve','Approve payouts'),
 ('terminals:read','Read terminals'),('terminals:manage','Manage terminals'),
 ('settlements:read','Read settlements'),('settlements:execute','Execute assigned settlements'),
 ('liquidity:read','Read liquidity'),('liquidity:quote','Quote liquidity'),('liquidity:commit','Commit liquidity'),
 ('compliance:read','Read compliance records'),('compliance:submit','Submit compliance records'),('compliance:review','Review compliance records'),
 ('organizations:manage','Manage organization settings'),('members:manage','Manage members'),
 ('api_keys:manage','Manage API keys'),('webhooks:manage','Manage webhooks'),('audit_logs:read','Read audit logs'),
 ('indexing:read','Read indexing operations'),('indexing:run','Run indexing operations'),
 ('applications:approve','Approve applications'),('applications:reject','Reject applications'),
 ('accounts:activate','Activate accounts'),('accounts:suspend','Suspend accounts');

INSERT INTO roles(name, organization_type, description) VALUES
 ('BUSINESS_OWNER','BUSINESS','Business owner'),('BUSINESS_ADMIN','BUSINESS','Business administrator'),
 ('FINANCE_MANAGER','BUSINESS','Finance manager'),('PAYMENTS_OPERATOR','BUSINESS','Payments operator'),
 ('PAYOUT_APPROVER','BUSINESS','Payout approver'),('BUSINESS_DEVELOPER','BUSINESS','Business developer'),
 ('BUSINESS_AUDITOR','BUSINESS','Business auditor'),
 ('PARTNER_OWNER','SETTLEMENT_PARTNER','Partner owner'),('PARTNER_ADMIN','SETTLEMENT_PARTNER','Partner administrator'),
 ('LIQUIDITY_MANAGER','SETTLEMENT_PARTNER','Liquidity manager'),('SETTLEMENT_OPERATOR','SETTLEMENT_PARTNER','Settlement operator'),
 ('PAYOUT_OPERATOR','SETTLEMENT_PARTNER','Partner payout operator'),('COMPLIANCE_MANAGER','SETTLEMENT_PARTNER','Partner compliance manager'),
 ('PARTNER_DEVELOPER','SETTLEMENT_PARTNER','Partner developer'),('PARTNER_AUDITOR','SETTLEMENT_PARTNER','Partner auditor'),
 ('PLATFORM_OWNER','INTERNAL','Platform owner'),('COMPLIANCE_ADMIN','INTERNAL','Compliance administrator'),
 ('COMPLIANCE_REVIEWER','INTERNAL','Compliance reviewer'),('PARTNER_OPERATIONS','INTERNAL','Partner operations'),
 ('PAYMENT_OPERATIONS','INTERNAL','Payment operations'),('RISK_ANALYST','INTERNAL','Risk analyst'),
 ('TECHNICAL_ADMIN','INTERNAL','Technical administrator'),('SUPPORT_AGENT','INTERNAL','Support agent'),
 ('INTERNAL_AUDITOR','INTERNAL','Internal auditor');

INSERT INTO role_permissions(role_name, permission_name)
SELECT 'PLATFORM_OWNER', name FROM permissions;
INSERT INTO role_permissions(role_name, permission_name)
SELECT 'BUSINESS_OWNER', name FROM permissions WHERE name NOT LIKE 'indexing:%' AND name NOT LIKE 'applications:%' AND name NOT LIKE 'accounts:%' AND name <> 'compliance:review';
INSERT INTO role_permissions(role_name, permission_name)
SELECT 'PARTNER_OWNER', name FROM permissions WHERE name NOT LIKE 'indexing:%' AND name NOT LIKE 'applications:%' AND name NOT LIKE 'accounts:%' AND name <> 'compliance:review';
INSERT INTO role_permissions(role_name, permission_name) VALUES
 ('TECHNICAL_ADMIN','indexing:read'),('TECHNICAL_ADMIN','indexing:run'),('TECHNICAL_ADMIN','api_keys:manage'),('TECHNICAL_ADMIN','webhooks:manage'),('TECHNICAL_ADMIN','audit_logs:read'),
 ('COMPLIANCE_ADMIN','compliance:read'),('COMPLIANCE_ADMIN','compliance:review'),('COMPLIANCE_ADMIN','applications:approve'),('COMPLIANCE_ADMIN','applications:reject'),('COMPLIANCE_ADMIN','audit_logs:read'),
 ('COMPLIANCE_REVIEWER','compliance:read'),('COMPLIANCE_REVIEWER','compliance:review'),
 ('PARTNER_OPERATIONS','settlements:read'),('PARTNER_OPERATIONS','liquidity:read'),('PARTNER_OPERATIONS','accounts:activate'),
 ('PAYMENT_OPERATIONS','payments:read'),('PAYMENT_OPERATIONS','payouts:read'),('PAYMENT_OPERATIONS','settlements:read'),('PAYMENT_OPERATIONS','settlements:execute'),
 ('RISK_ANALYST','compliance:read'),('RISK_ANALYST','audit_logs:read'),
 ('INTERNAL_AUDITOR','audit_logs:read'),('INTERNAL_AUDITOR','compliance:read'),('INTERNAL_AUDITOR','payments:read'),('INTERNAL_AUDITOR','settlements:read'),
 ('BUSINESS_ADMIN','payments:read'),('BUSINESS_ADMIN','payments:create'),('BUSINESS_ADMIN','payments:refund'),('BUSINESS_ADMIN','payouts:read'),('BUSINESS_ADMIN','payouts:create'),('BUSINESS_ADMIN','payouts:approve'),('BUSINESS_ADMIN','terminals:read'),('BUSINESS_ADMIN','terminals:manage'),('BUSINESS_ADMIN','settlements:read'),('BUSINESS_ADMIN','organizations:manage'),('BUSINESS_ADMIN','members:manage'),('BUSINESS_ADMIN','compliance:read'),('BUSINESS_ADMIN','compliance:submit'),
 ('FINANCE_MANAGER','payments:read'),('FINANCE_MANAGER','payments:refund'),('FINANCE_MANAGER','payouts:read'),('FINANCE_MANAGER','payouts:create'),('FINANCE_MANAGER','payouts:approve'),('FINANCE_MANAGER','settlements:read'),
 ('PAYMENTS_OPERATOR','payments:read'),('PAYMENTS_OPERATOR','payments:create'),('PAYMENTS_OPERATOR','payouts:read'),
 ('PAYOUT_APPROVER','payouts:read'),('PAYOUT_APPROVER','payouts:approve'),('PAYOUT_APPROVER','settlements:read'),
 ('BUSINESS_DEVELOPER','api_keys:manage'),('BUSINESS_DEVELOPER','webhooks:manage'),
 ('BUSINESS_AUDITOR','payments:read'),('BUSINESS_AUDITOR','payouts:read'),('BUSINESS_AUDITOR','settlements:read'),('BUSINESS_AUDITOR','audit_logs:read'),
 ('PARTNER_ADMIN','settlements:read'),('PARTNER_ADMIN','settlements:execute'),('PARTNER_ADMIN','liquidity:read'),('PARTNER_ADMIN','liquidity:quote'),('PARTNER_ADMIN','liquidity:commit'),('PARTNER_ADMIN','compliance:read'),('PARTNER_ADMIN','compliance:submit'),('PARTNER_ADMIN','organizations:manage'),('PARTNER_ADMIN','members:manage'),
 ('LIQUIDITY_MANAGER','liquidity:read'),('LIQUIDITY_MANAGER','liquidity:quote'),('LIQUIDITY_MANAGER','liquidity:commit'),('LIQUIDITY_MANAGER','settlements:read'),
 ('SETTLEMENT_OPERATOR','settlements:read'),('SETTLEMENT_OPERATOR','settlements:execute'),
 ('PAYOUT_OPERATOR','settlements:read'),('PAYOUT_OPERATOR','settlements:execute'),
 ('COMPLIANCE_MANAGER','compliance:read'),('COMPLIANCE_MANAGER','compliance:submit'),
 ('PARTNER_DEVELOPER','api_keys:manage'),('PARTNER_DEVELOPER','webhooks:manage'),
 ('PARTNER_AUDITOR','settlements:read'),('PARTNER_AUDITOR','liquidity:read'),('PARTNER_AUDITOR','audit_logs:read');
