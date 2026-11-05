# Oynk Mart inventory connection

Oynk owns the merchant storefront and catalog projection. An inventory provider owns its source workspace, items, prices, stock, and publication controls. LemonBooks is the first provider; other providers can implement the same signed inventory and synchronization contract.

## Merchant flow

1. Business signup offers **Set up inventory with LemonBooks** by default. The preference is stored on the Oynk organization. After email verification and sign-in, that browser takes the merchant to Oynk Mart. Unchecking it leaves Mart available for setup later.
2. **Connect a provider** opens a focused LemonBooks approval window. The owner/admin enters LemonBooks credentials and a six-digit email code. This does not create or persist a LemonBooks browser session. A new user may create a workspace separately and return to the approval window. Oynk never receives the password or code.
3. The connection credential is exchanged between the windows and saved encrypted by LemonBooks. Oynk marks the connection active only after LemonBooks confirms approval. Cancellation revokes the pending credential.
4. The merchant can create and edit items, set prices and stock, import a CSV, and select item visibility from Oynk Mart; those writes update the same LemonBooks inventory. They can also manage items in LemonBooks. The Oynk storefront name and publication state remain independent. Only an active business with a published storefront and source-published items is discoverable.
5. After a paid Mart order, an idempotent outbox requests an exact stock decrement in LemonBooks. A stock conflict enters review. Live commerce still needs a pre-payment stock reservation and exception/refund handling before unrestricted rollout.

The checked signup preference brings the merchant to the Mart setup after Oynk verification. It does not silently create a LemonBooks login. Merchants who uncheck it can connect later.

## Configuration

- Oynk Console: `VITE_LEMONBOOKS_URL` must be the LemonBooks web origin in non-development builds.
- LemonBooks web: `VITE_OYNK_CONSOLE_URL` must be the exact trusted Console origin. The connection page rejects all other opener origins.
- LemonBooks API: `OYNK_MART_API_URL` points to the Oynk API, and `INTEGRATION_CREDENTIALS_KEY` protects the stored connector token. Use the existing HTTPS configuration in deployed environments.

Local defaults are `http://localhost:5174` for Oynk Console and `http://localhost:5173` for LemonBooks web. The Oynk API applies migrations `043_business_inventory_intent.sql`, `044_mart_stock_fulfillment.sql`, `045_mart_connection_approval.sql`, and `046_mart_source_item_id.sql` on startup.

Previously created manual LemonBooks connections remain valid. To use one, paste its saved ID and token into **LemonBooks → Items & inventory → Oynk Mart**. To switch that workspace to the guided connection, disconnect the old connection in Oynk Console first, then run the guided flow. Revoke any credential that may have been exposed outside the intended setup.
