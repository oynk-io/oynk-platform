CREATE TABLE mobile_diagnostics (
 id BIGSERIAL PRIMARY KEY,
 code TEXT NOT NULL CHECK(code IN ('APP_RENDER_FAILURE','HTTP_FAILURE','NETWORK_FAILURE')),
 http_status INTEGER CHECK(http_status BETWEEN 100 AND 599),
 request_id UUID,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX mobile_diagnostics_time_idx ON mobile_diagnostics(created_at DESC);
