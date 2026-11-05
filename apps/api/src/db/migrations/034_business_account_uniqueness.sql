-- A dedicated bank or settlement account cannot be bound to two businesses.
CREATE UNIQUE INDEX business_financial_accounts_vfd_unique
  ON business_financial_accounts(vfd_account_number)
  WHERE vfd_account_number IS NOT NULL;

CREATE UNIQUE INDEX business_financial_accounts_crypto_unique
  ON business_financial_accounts(smart_account_network,smart_account_address)
  WHERE smart_account_network IS NOT NULL AND smart_account_address IS NOT NULL;

