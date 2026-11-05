CREATE TABLE consumer_auth_rate_windows (
 scope TEXT NOT NULL,
 window_start TIMESTAMPTZ NOT NULL,
 count INTEGER NOT NULL CHECK(count>0),
 PRIMARY KEY(scope,window_start)
);
