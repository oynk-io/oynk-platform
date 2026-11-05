CREATE TABLE consumer_security_requests (
 id UUID PRIMARY KEY,
 account_id UUID NOT NULL REFERENCES consumer_accounts(id),
 kind TEXT NOT NULL CHECK(kind IN ('ACCOUNT_CLOSURE','LOST_DEVICE')),
 state TEXT NOT NULL DEFAULT 'OPEN' CHECK(state IN ('OPEN','IN_REVIEW','COMPLETED','REJECTED','CANCELLED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 operator_note TEXT
);
CREATE UNIQUE INDEX consumer_security_requests_active ON consumer_security_requests(account_id,kind)
 WHERE state IN ('OPEN','IN_REVIEW');
CREATE TABLE consumer_security_events (
 id BIGSERIAL PRIMARY KEY,
 request_id UUID NOT NULL REFERENCES consumer_security_requests(id),
 action TEXT NOT NULL,
 actor_reference TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER consumer_security_events_append_only BEFORE UPDATE OR DELETE ON consumer_security_events
 FOR EACH ROW EXECUTE FUNCTION mart_reject_event_mutation();
