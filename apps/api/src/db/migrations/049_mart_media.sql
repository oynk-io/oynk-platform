-- Bounded, durable catalog photos. Never store identity documents here.
CREATE TABLE mart_media (
 id UUID PRIMARY KEY,
 organization_id UUID NOT NULL REFERENCES organizations(id),
 content_sha256 TEXT NOT NULL,
 content_type TEXT NOT NULL CHECK (content_type = 'image/webp'),
 byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 2097152),
 content BYTEA NOT NULL,
 public_url TEXT NOT NULL,
 created_by UUID NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 UNIQUE (organization_id, content_sha256),
 CHECK (octet_length(content) = byte_size)
);
CREATE INDEX mart_media_owner_idx ON mart_media(organization_id, created_at DESC);
