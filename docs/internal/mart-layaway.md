# Oynk Mart Pay small small

The customer-facing product name is **Pay small small**. Internal database,
API, event and accounting identifiers retain `LAYAWAY` for compatibility.

## Customer flow

Pay small small is available only for eligible physical products sold in NGN. The
current policy enables electronics, appliances, phones, computers, furniture,
and home categories. A buyer chooses a 30, 60, or 90-day payoff window. They
can pay the balance once or make any number of contributions before that single
deadline. Oynk adds one fixed NGN 5,000 service fee to the plan and shows the
merchandise amount, fee, total, and payoff window before the buyer requests it.

The merchant confirms the item and agrees to hold it before the first payment
can start. Every contribution requires the same transaction-specific approval
used by other Oynk Pay payments. Paid plans cannot be cancelled through the
consumer cancellation endpoint; any later cancellation or refund must follow a
separately authorized support workflow.

## Money movement and release

Layaway contributions move from the customer's dedicated VFD account into
Oynk's configured Mart holding account. They do not go directly to the
merchant. Configure `VFD_MART_HOLDING_ACCOUNT_NUMBER`; deployments that have
not set it fall back to `VFD_PAYOUT_ACCOUNT_NUMBER`.

When the full balance is confirmed, the plan becomes funded and the
merchandise value becomes payable to the merchant. The NGN 5,000 service fee
remains Oynk revenue. A reconciliation worker pays the merchant's dedicated VFD
business account from the holding account. The order remains in settlement
pending state until VFD confirms the transfer. Only then does Oynk mark the
order paid and send the inventory sale/release event to the source system.

Unknown transfer outcomes enter reconciliation and are verified by provider
reference. Oynk never submits a second payout while an outcome is uncertain.

## Accounting entries

The append-only journal records balanced entries in kobo:

1. Each contribution: debit `HOLDING_CASH`, credit `CUSTOMER_FUNDS_HELD`.
2. Fully funded plan: debit `CUSTOMER_FUNDS_HELD`; credit
   `MERCHANT_PAYABLE` for merchandise and `SERVICE_FEE_REVENUE` for the fee.
3. Confirmed merchant settlement: debit `MERCHANT_PAYABLE`, credit
   `HOLDING_CASH`.

Provider payment, settlement, order-event, and stock-fulfillment records retain
the references needed to reconcile a plan from collection through release.

## Future extensions

The plan model distinguishes customer-funded layaway from `OYNK_CREDIT` and the
journal reserves a `FINANCING_RECEIVABLE` account. Financing is not exposed to
customers yet. When introduced, Oynk can fund the merchant immediately, record
the customer balance as financing receivable, and let the customer repay Oynk
without changing the merchant settlement or item-release contract.

Oynk-owned sourcing, including future China sourcing, can use the same merchant
and settlement interface. The sourcing provider supplies the catalog and
fulfillment events while the quote, collection, accounting, and release flow
remains unchanged.
