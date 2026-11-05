CREATE TABLE consumer_chain_intents (
 id UUID PRIMARY KEY,
 account_id UUID NOT NULL REFERENCES consumer_accounts(id),
 network TEXT NOT NULL CHECK(network IN ('TESTNET','PUBLIC')),
 session_reference TEXT NOT NULL,
 contract_id TEXT NOT NULL,
 call_function TEXT NOT NULL,
 args_xdr JSONB NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('TRANSFER','CONTRIBUTE','REDEEM')),
 amount_atomic NUMERIC(38,0) NOT NULL CHECK(amount_atomic>0),
 counterparty TEXT,
 state TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK(state IN ('SUBMITTED','COMPLETED','FAILED','RECONCILIATION_REQUIRED')),
 transaction_hash TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 completed_at TIMESTAMPTZ,
 UNIQUE(account_id,session_reference),
 UNIQUE(network,transaction_hash)
);
CREATE TABLE consumer_chain_events (
 id BIGSERIAL PRIMARY KEY,
 intent_id UUID NOT NULL REFERENCES consumer_chain_intents(id),
 action TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER consumer_chain_events_append_only BEFORE UPDATE OR DELETE ON consumer_chain_events
 FOR EACH ROW EXECUTE FUNCTION mart_reject_event_mutation();
