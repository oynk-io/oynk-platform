-- Execution attempts transition from queued/processing to one terminal state.
-- Once terminal, their provider and chain evidence must remain immutable.
CREATE OR REPLACE FUNCTION protect_terminal_ramp_execution() RETURNS TRIGGER AS $$
BEGIN
 IF TG_OP = 'DELETE' THEN
  RAISE EXCEPTION 'Ramp execution records cannot be deleted';
 END IF;
 IF OLD.state IN ('SUCCEEDED','FAILED') AND NEW IS DISTINCT FROM OLD THEN
  RAISE EXCEPTION 'Terminal ramp execution records are immutable';
 END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ramp_execution_terminal_immutable ON ramp_execution_attempts;
CREATE TRIGGER ramp_execution_terminal_immutable
BEFORE UPDATE OR DELETE ON ramp_execution_attempts
FOR EACH ROW EXECUTE FUNCTION protect_terminal_ramp_execution();
