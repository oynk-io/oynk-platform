-- General sign-in tokens are never sufficient for a financial/settings approval.
ALTER TABLE consumer_primary_auth_challenges DROP CONSTRAINT consumer_primary_auth_challenges_action_check;
ALTER TABLE consumer_primary_auth_challenges ADD CONSTRAINT consumer_primary_auth_challenges_action_check
 CHECK(action IN ('OFFLINE_PAY_CONFIGURE','MART_PAYMENT','PASSCODE_CHANGE','ACCOUNT_CLOSURE'));
