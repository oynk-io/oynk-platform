# Oynk Mart catalog foundation

Oynk Mart owns catalog ingestion and discovery. Every bookkeeping or inventory provider implements the same connector contract. LemonBooks is one adapter, not the Mart data model. The current backend foundation lives in `apps/api/src/mart` and migration `038_mart_catalog.sql`.

## Authority and publication

- Oynk `organizations.id` is the Mart merchant ID. An approved business can connect a source, sync items, and save its intent to publish while finishing financial-account setup. The storefront and its listed items appear in public discovery only when the business is active. A connection alone never publishes items.
- A source connection is scoped to one merchant, one source system, and one source tenant. Its connector token is returned once, stored only as a hash, and never has merchant administration permissions.
- New items created by a merchant owner/admin in LemonBooks or Oynk Console default to published. The item form includes a checked publication option that the merchant can uncheck. Editing preserves the existing choice, and older items are not automatically published. Publication still requires an active source connection and a published storefront before shoppers can see the item. Oynk sends signed changes to the source; the connector then syncs source revisions back into Mart's projection.
- Search includes only items from active connections and active businesses, with a published storefront, source-published item, active source record, known in-stock state, and a successful sync in the past 24 hours. Discovery reads Mart's catalog database, not LemonBooks on every request.
- Connector revocation immediately removes its items from public discovery. Reconnecting the same source tenant creates a new connection.

## Source-neutral ingestion

`POST /api/mart/connector/ingest` uses `x-mart-connector-token`. A batch has a unique `eventId` and 1–100 items. Each item has a source-local ID and a monotonically increasing integer `revision`. An adapter must assign this revision if its upstream provider has only timestamps, opaque cursors, or no revision. Older revisions are ignored; an identical current revision can refresh its sync time. A changed payload at the same revision is rejected. The whole batch and its event record commit atomically. Retrying the same `eventId` with identical contents is idempotent; reusing it with different contents fails.

Fields: `sourceItemId`, `revision`, `kind`, `sku`, `title`, `description`, `category`, `imageUrls`, `currency`, `priceMinor`, `quantity`, `availability`, `active`, and `published`. The schema rejects extra fields, including source cost and private bookkeeping records. Prices are integer minor units; adapters must convert using the currency's actual exponent. `active:false` represents removal or unavailability at the source. `availability:UNKNOWN` is never shown as immediately purchasable.

Adapter responsibilities: merchant-granted upstream access, initial paginated import, incremental updates, item deletion signals, mapping to the canonical fields, revision assignment, retries with the original `eventId`, and periodic reconciliation. The Mart connector credential must be stored in the adapter's secret store. The current LemonBooks `/api/v3/sync/pull` is a broad private bookkeeping feed and must not be passed to Mart or exposed to agents; a dedicated item-only adapter is required.

## Routes

Merchant routes use the existing Console session, `mart:read`/`mart:manage`, and CSRF on mutations:

- `GET /api/mart/merchant` — storefront and connections without tokens.
- `GET /api/mart/merchant/items?limit=50&after=<item UUID>&connectionId=<connection UUID>` — bounded, merchant-scoped item pages.
- `PUT /api/mart/merchant/storefront` — `{displayName,description,serviceArea,published}`. Description and service area are optional merchant-controlled public fields; private compliance addresses are never copied into the storefront.
- `POST /api/mart/merchant/connections` — `{sourceSystem,sourceTenantId,label}`; returns a connector token once.
- `DELETE /api/mart/merchant/connections/:id` — revokes the credential and public visibility.

LemonBooks manages item selection through `PATCH /api/v3/integrations/oynk-mart/items/:id/publication`. Its connector syncs that selection into Mart. Other source adapters must provide an equivalent merchant-controlled selection mechanism.

Discovery routes are read-only and return a source-neutral public item projection:

- `GET /api/mart/offers?q=rice&category=supermarket&storeId=<merchant UUID>&limit=20&after=<item UUID>` — cross-store item search or a single storefront's available items, with bounded keyset pagination. `category` and `storeId` are optional.
- `GET /api/mart/offers/:id` — a currently discoverable item.
- `GET /api/mart/stores?category=supermarket&q=rice&limit=20&after=<merchant UUID>` — active storefronts with discoverable item counts. The optional search matches store names and items; the category is the merchant-selected store type.
- `GET /api/mart/stores/:id` — one active storefront. Private, inactive, and empty storefronts are excluded.

The Oynk Pay Shop tab opens with storefronts. Buyers can switch to items, filter by store type, or search from either view. Entering a product search shows matching items and the stores that carry them. Future free-form or voice-assisted shopping should parse the customer's request into bounded catalog filters and use the same public projection; agents must not receive private bookkeeping fields or authority to pay without the buyer's separate approval.

Search matches whole words, prefixes, middle-of-word fragments and partial phrases in item names, descriptions, categories, SKUs and storefront names. Multiple typed words can be fragments, and extra spaces are tolerated. Results retain the same publication, freshness, category and merchant restrictions. Migration `050_mart_partial_search.sql` adds PostgreSQL trigram indexes for substring matching. LIKE wildcard characters are escaped as literal input. Product details use a fixed-height, full-width photo gallery. Tapping opens a separate viewer with a persistent Close button, photos aligned directly below the header at their original aspect ratio, horizontal swiping and selectable thumbnails. Tall photos scroll vertically without cropping the source image.

The public `verified` storefront badge means the Oynk business is approved and active. It does not represent a physical site visit or independent product authentication. Only active businesses with a published storefront, active catalog connection and available items are returned. Merchants choose a store type in Console; existing storefronts default to Other until updated. Catalog sources may send up to eight HTTPS item image URLs. The app lets buyers swipe through them and shows a placeholder when no photo is supplied or a photo fails to load.

The purchase path uses `POST /api/mart/offers/:id/quotes` (quantity 1–1000), `POST /api/mart/orders` (SocketFi bearer token, quote ID, idempotency key), buyer `GET /api/mart/orders` and `GET /api/mart/orders/:id`, and merchant `GET /api/mart/merchant/orders` / `POST /api/mart/merchant/orders/:id/decision`. Quotes call the source's live price and stock endpoint and expire after five minutes. Merchant confirmation checks the source again and rejects a price change. No funds move until the buyer explicitly pays.

`POST /api/mart/orders/:id/payments` creates or returns the order's payment intent. It snapshots the amount and the buyer/merchant dedicated VFD accounts. The buyer then authenticates again with their bound passkey or device signer and calls `POST /api/mart/payments/:id/submit`. The backend checks a fresh SocketFi token, same wallet and auth method, consumes that token for only one Mart intent, rechecks live price/availability, and sends a VFD transfer with one stable reference. `GET /api/mart/payments/:id` reports the result. A confirmed transfer creates one Oynk Pay ledger debit and moves the order to `PAID`. Unknown VFD outcomes stay in reconciliation and are never resubmitted. Completed Mart payments appear in Oynk Pay Activity. Migrations `040_mart_payments.sql` and `041_mart_approval_token.sql` add payment state, append-only events, and one-time approval tokens.

**Release boundary:** Paid orders queue an idempotent stock decrement in LemonBooks, with insufficient stock flagged for review. LemonBooks still has no atomic pre-payment stock reservation. A live stock recheck reduces stale orders but does not guarantee stock between recheck and VFD settlement. Refund/fulfillment exceptions and a transaction-bound passkey/device proof are still required before unrestricted live commerce. The current fresh-token approval is suitable for sandbox testing, not a substitute for signing the exact order and amount. Keep live Mart payment execution disabled until those controls are complete.

## Operation and release

### Item photos and bulk import

Both LemonBooks' native Add/Edit Item form and Oynk Console support up to five uploaded photos per item. Merchants can remove photos and choose the cover by moving a photo to the first position. Uploads accept JPEG, PNG and WebP up to 5 MB each; the server validates the raster, removes metadata, resizes to at most 1600 pixels and stores a WebP capped at 2 MB. Save and close remain disabled while uploads are running. Neither application needs public image-hosting credentials for this flow.

LemonBooks stores native photo references in its own inventory database. Its connector projects those references into Oynk's source-photo URLs. Mart serves source photos through a signed, connection-scoped fetch from the trusted LemonBooks API. Draft photos remain private; public access requires an active source connection, active business, published storefront and published source item referencing the exact photo. Oynk Console photos use Oynk's media endpoint, and LemonBooks can preview them through its authenticated connector. Photos are not copied into the source's inventory when edited from Console; existing references are preserved.

The bulk CSV template includes `publish_to_mart` and `image_urls`. Omitted or blank publication values default to true for owner/admin imports; `false`, `no` and `0` keep an item private. `image_urls` contains up to five HTTPS URLs separated by semicolons. Console also accepts the publication aliases `publish_to_store` and `published`. The five-photo cap applies to the merchant editor and CSV import; the provider-neutral ingestion schema retains its broader eight-URL limit.

Media storage is bounded to 200 MB per business with at most 60 new photos per hour and content-hash deduplication. LemonBooks' `item_media` table and Oynk migration `049_mart_media.sql` currently store normalized photo bytes in PostgreSQL. Move that storage behind an object-store adapter before expanding catalog volume beyond these limits. Set `API_PUBLIC_URL` to the stable HTTPS Oynk API origin: source-photo links use this origin, which LemonBooks discovers through connector status. A changing development tunnel requires re-projecting stored catalog photo URLs.

Apply the regular Oynk API migration process, then deploy the API. Configure LemonBooks with `OYNK_MART_API_URL` pointing to the Oynk API and its existing `INTEGRATION_CREDENTIALS_KEY` for connector-token encryption; run its schema migration. Configure the Oynk API with `MART_LEMONBOOKS_API_URL` set to the trusted LemonBooks API origin (HTTPS outside localhost). This source URL comes only from deployment configuration, never from a merchant connection. In Console, choose LemonBooks as the inventory provider and complete its one-time email/password and OTP connection approval. The popup does not establish a LemonBooks login session. Select items for publication and publish the Mart storefront in Console. Changes flow through LemonBooks' durable sync queue into Mart's indexed catalog. Neither application needs a per-search request to the other. The signed live-quote endpoint is used only when a buyer requests a quote or a merchant confirms a request.

Add gateway-level request-rate and payload controls for public discovery and connector ingest. Observe connector sync lag, stale item count, ingestion errors, publication changes, and revoked-token attempts. The database keeps catalog events for audits; sensitive source credentials and private bookkeeping data must never be logged.

Validation: `pnpm --filter @oynk/api typecheck`; `pnpm --filter @oynk/api exec tsx --test src/mart/model.test.ts`. The isolated PostgreSQL integration test runs when `MART_TEST_DATABASE_URL` points to the loopback development database on `127.0.0.1:5433/oynk_dashboard`.
