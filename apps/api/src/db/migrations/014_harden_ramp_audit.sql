ALTER TABLE ramp_policy_configs ADD COLUMN additional_rules JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE OR REPLACE FUNCTION prevent_ramp_audit_mutation() RETURNS TRIGGER AS $$
BEGIN
 RAISE EXCEPTION 'Ramp audit records are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ramp_events_append_only BEFORE UPDATE OR DELETE ON ramp_transaction_events
FOR EACH ROW EXECUTE FUNCTION prevent_ramp_audit_mutation();
CREATE TRIGGER ramp_decisions_append_only BEFORE UPDATE OR DELETE ON ramp_policy_decisions
FOR EACH ROW EXECUTE FUNCTION prevent_ramp_audit_mutation();
CREATE TRIGGER ramp_approvals_append_only BEFORE UPDATE OR DELETE ON ramp_approval_actions
FOR EACH ROW EXECUTE FUNCTION prevent_ramp_audit_mutation();
CREATE TRIGGER ramp_policy_versions_append_only BEFORE UPDATE OR DELETE ON ramp_policy_versions
FOR EACH ROW EXECUTE FUNCTION prevent_ramp_audit_mutation();
