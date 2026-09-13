CREATE TABLE newsletter_subscribers (
 id UUID PRIMARY KEY,
 email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
 consent_version TEXT NOT NULL,
 subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 unsubscribed_at TIMESTAMPTZ,
 unsubscribe_token TEXT NOT NULL UNIQUE,
 delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending','sending','sent','previewed','failed')),
 delivery_attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 lease_id UUID,
 lease_until TIMESTAMPTZ,
 confirmation_sent_at TIMESTAMPTZ
);
CREATE INDEX newsletter_pending_idx ON newsletter_subscribers(next_attempt_at) WHERE delivery_status IN ('pending','sending');
CREATE TABLE newsletter_rate_limits (
 key TEXT PRIMARY KEY,
 window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 attempts INTEGER NOT NULL DEFAULT 1
);
