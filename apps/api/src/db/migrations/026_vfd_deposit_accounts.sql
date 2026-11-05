-- Provisioning is recorded before calling VFD so retries cannot create two
-- stable accounts after an ambiguous provider timeout.
ALTER TABLE consumer_quick_pay_deposit_accounts ALTER COLUMN bank_name DROP NOT NULL;
ALTER TABLE consumer_quick_pay_deposit_accounts ALTER COLUMN account_number DROP NOT NULL;
ALTER TABLE consumer_quick_pay_deposit_accounts ALTER COLUMN account_name DROP NOT NULL;

