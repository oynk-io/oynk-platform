-- Keep the production corporate account model while allowing an explicitly
-- labelled owner Tier 1 account for sandbox terminal testing.
ALTER TABLE business_financial_accounts
  DROP CONSTRAINT IF EXISTS business_financial_accounts_fiat_account_model_check;

ALTER TABLE business_financial_accounts
  ADD CONSTRAINT business_financial_accounts_fiat_account_model_check
  CHECK (fiat_account_model IN ('ONE_TO_ONE','OWNER_TIER_1_TEST'));
