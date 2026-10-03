-- Migration 006: Row Level Security
-- Every memory-bearing table gets passport-scoped RLS.
-- The database prevents cross-passport access even if application code has a bug.
--
-- RLS uses a session variable `app.passport_id` that the application sets
-- via `SET LOCAL` at the start of each request transaction.
-- This is the passport boundary enforcement.

ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memory_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE purged_provenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_events ENABLE ROW LEVEL SECURITY;

-- Helper: get the current passport_id from session context
CREATE OR REPLACE FUNCTION current_passport_id()
RETURNS UUID AS $$
BEGIN
    RETURN current_setting('app.passport_id', true)::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'app.passport_id not set — all memory queries require passport scope';
END;
$$ LANGUAGE plpgsql STABLE;

-- Claims: passport-scoped
CREATE POLICY claims_passport_isolation ON claims
    USING (passport_id = current_passport_id());

CREATE POLICY claims_insert_passport ON claims
    FOR INSERT WITH CHECK (passport_id = current_passport_id());

-- Claim versions: scoped through claim's passport
-- (claim_versions don't have passport_id directly, but the join enforces it)
CREATE POLICY versions_passport_isolation ON claim_versions
    USING (
        claim_id IN (
            SELECT id FROM claims WHERE passport_id = current_passport_id()
        )
    );

CREATE POLICY versions_insert_passport ON claim_versions
    FOR INSERT WITH CHECK (
        claim_id IN (
            SELECT id FROM claims WHERE passport_id = current_passport_id()
        )
    );

-- Evidence: scoped through claim's passport
CREATE POLICY evidence_passport_isolation ON evidence
    USING (
        claim_id IN (
            SELECT id FROM claims WHERE passport_id = current_passport_id()
        )
    );

CREATE POLICY evidence_insert_passport ON evidence
    FOR INSERT WITH CHECK (
        claim_id IN (
            SELECT id FROM claims WHERE passport_id = current_passport_id()
        )
    );

-- Observations: scoped through binding's passport
CREATE POLICY observations_passport_isolation ON observations
    USING (
        binding_id IN (
            SELECT id FROM bindings WHERE passport_id = current_passport_id()
        )
    );

CREATE POLICY observations_insert_passport ON observations
    FOR INSERT WITH CHECK (
        binding_id IN (
            SELECT id FROM bindings WHERE passport_id = current_passport_id()
        )
    );

-- User memory events: passport-scoped directly
CREATE POLICY user_events_passport_isolation ON user_memory_events
    USING (passport_id = current_passport_id());

CREATE POLICY user_events_insert_passport ON user_memory_events
    FOR INSERT WITH CHECK (passport_id = current_passport_id());

-- Experiences: passport-scoped directly
CREATE POLICY experiences_passport_isolation ON experiences
    USING (passport_id = current_passport_id());

CREATE POLICY experiences_insert_passport ON experiences
    FOR INSERT WITH CHECK (passport_id = current_passport_id());

-- Purged provenance: scoped through claim's passport
CREATE POLICY purged_passport_isolation ON purged_provenance
    USING (
        claim_id IN (
            SELECT id FROM claims WHERE passport_id = current_passport_id()
        )
    );

-- Access events: scoped through binding's passport
CREATE POLICY access_events_passport_isolation ON access_events
    USING (
        binding_id IN (
            SELECT id FROM bindings WHERE passport_id = current_passport_id()
        )
    );

-- Note: bindings table itself does NOT have RLS in v1.
-- The application layer handles binding lookups.
-- Memory data (claims, evidence, etc.) is what RLS protects.
-- This is deliberate: binding management is a control plane operation,
-- not a data plane query.
