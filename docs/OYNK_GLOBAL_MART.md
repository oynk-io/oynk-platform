# Oynk Global Mart

Global Mart is a separate catalog boundary inside Oynk Mart. It exposes external marketplace listings without converting them into local merchant inventory.

## Catalog boundaries

- Local storefronts belong to approved Oynk businesses. Their inventory is synchronized from LemonBooks or another inventory connector.
- Global markets are Oynk-managed routes such as `ebay_us` or a future Alibaba route.
- Global storefronts represent external sellers or stores inside a source market. They are not Oynk-verified local businesses.
- Global listings retain their source market, seller, source item ID, source URL, currency, condition, buying options, and synchronization time.

## Consumer discovery

The mobile Shop surface supports:

1. Local or Global market selection.
2. Storefront or Item discovery within either market.
3. Source-market selection within Global.
4. Partial text search against synchronized listings and source storefronts.

Global checkout is intentionally disabled in the first slice. A source price is not a landed Nigerian price. Procurement, foreign-exchange quoting, international freight, customs, warehouse receiving, consolidation, returns, and last-mile delivery must be represented before Oynk accepts payment.

## Provider adapters

The first adapter uses eBay's Browse API. Enable it only on the API server with:

```text
MART_GLOBAL_ENABLED=true
EBAY_BROWSE_ENABLED=true
EBAY_CLIENT_ID=...
EBAY_CLIENT_SECRET=...
EBAY_MARKETPLACE_ID=EBAY_US
```

Provider credentials never belong in the mobile application or control portal. Adding Alibaba or another source requires a provider adapter that normalizes source data into the existing market, storefront, and item contracts.

## Oynk control

Authorized internal operators can:

- activate or pause source-market routes;
- add and curate external storefronts;
- see provider connectivity and synchronized catalog counts;
- configure separate Local and Global logistics routes.

All control mutations require an internal organization, explicit `mart_global:manage` permission, CSRF verification, and an audit record.

## eBay limitation

The Browse API supports discovery and item details with an application access token. eBay's Order and Offer APIs are limited-release capabilities. Oynk must obtain the appropriate eBay production approval before implementing native purchasing or auction bidding. Discovery access must not be treated as checkout authorization.
