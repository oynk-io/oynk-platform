INSERT INTO role_permissions(role_name, permission_name) VALUES
  ('SUPPORT_AGENT','payments:read'),
  ('SUPPORT_AGENT','payouts:read')
ON CONFLICT DO NOTHING;
