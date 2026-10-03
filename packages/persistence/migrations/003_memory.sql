-- Migration 003: Memory Object Model
-- Observation → Evidence → Claim → ClaimVersion

-- Claims (the core unit of memory)
CREATE TABLE claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    passport_id UUID NOT NULL REFERENCES passports(id),
    subject TEXT NOT NULL,
    predicate TEXT NOT NULL,
    value TEXT NOT NULL,
    qualifiers JSONB NOT NULL DEFAULT '{}',
    category TEXT NOT NULL
        CHECK (category IN (
            'skills', 'preferences', 'goals', 'projects',
            'behavioral_patterns', 'emotional_patterns', 'personal_context'
        )),
    tags TEXT[] NOT NULL DEFAULT '{}',
    state TEXT NOT NULL DEFAULT 'OBSERVED'
        CHECK (state IN (
            'DECLARED', 'SUPPORTED', 'OBSERVED', 'CONTESTED',
            'UNKNOWN', 'UNSUPPORTED', 'STALE', 'EXPIRED'
        )),
    declared_state TEXT
        CHECK (declared_state IS NULL OR declared_state IN (
            'DECLARED', 'SUPPORTED', 'OBSERVED', 'CONTESTED',
            'UNKNOWN', 'UNSUPPORTED', 'STALE', 'EXPIRED'
        )),
    observed_state TEXT
        CHECK (observed_state IS NULL OR observed_state IN (
            'DECLARED', 'SUPPORTED', 'OBSERVED', 'CONTESTED',
            'UNKNOWN', 'UNSUPPORTED', 'STALE', 'EXPIRED'
        )),
    volatility TEXT NOT NULL DEFAULT 'stable'
        CHECK (volatility IN ('stable', 'slow_changing', 'dynamic', 'ephemeral')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_confirmed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    sensitivity TEXT NOT NULL DEFAULT 'public'
        CHECK (sensitivity IN ('public', 'personal', 'sensitive', 'restricted')),
    sharing_policy JSONB NOT NULL DEFAULT '{"type": "grant_controlled"}',
    current_version_id UUID,
    deleted BOOLEAN NOT NULL DEFAULT false,
    deleted_at TIMESTAMPTZ
);

-- CRITICAL: passport_id index — every query must be passport-scoped
CREATE INDEX idx_claims_passport ON claims(passport_id);
CREATE INDEX idx_claims_passport_category ON claims(passport_id, category);
CREATE INDEX idx_claims_passport_state ON claims(passport_id, state) WHERE NOT deleted;
CREATE INDEX idx_claims_subject_predicate ON claims(passport_id, subject, predicate);

-- Claim versions (append-only history)
CREATE TABLE claim_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id),
    version_number INTEGER NOT NULL,
    previous_version_id UUID REFERENCES claim_versions(id),
    value TEXT NOT NULL,
    qualifiers JSONB NOT NULL DEFAULT '{}',
    state TEXT NOT NULL
        CHECK (state IN (
            'DECLARED', 'SUPPORTED', 'OBSERVED', 'CONTESTED',
            'UNKNOWN', 'UNSUPPORTED', 'STALE', 'EXPIRED'
        )),
    changed_by TEXT NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    change_reason TEXT NOT NULL,
    evidence_ids UUID[] NOT NULL DEFAULT '{}',
    UNIQUE (claim_id, version_number)
);

-- Enforce append-only: no UPDATE or DELETE on claim_versions
CREATE OR REPLACE FUNCTION prevent_version_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'claim_versions is append-only — no updates allowed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_version_immutable
    BEFORE UPDATE ON claim_versions
    FOR EACH ROW EXECUTE FUNCTION prevent_version_mutation();

CREATE TRIGGER trg_version_no_delete
    BEFORE DELETE ON claim_versions
    FOR EACH ROW EXECUTE FUNCTION prevent_version_mutation();

-- FK from claims to claim_versions
ALTER TABLE claims
    ADD CONSTRAINT fk_claim_current_version
    FOREIGN KEY (current_version_id) REFERENCES claim_versions(id);

-- Observations (the boundary object — what apps submit)
CREATE TABLE observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT NOT NULL,
    binding_id UUID NOT NULL REFERENCES bindings(id),
    experience_id UUID,
    subject TEXT NOT NULL,
    predicate TEXT NOT NULL,
    value TEXT NOT NULL,
    qualifiers JSONB NOT NULL DEFAULT '{}',
    declared_sensitivity TEXT NOT NULL
        CHECK (declared_sensitivity IN ('public', 'personal', 'sensitive', 'restricted')),
    declared_category TEXT NOT NULL
        CHECK (declared_category IN (
            'skills', 'preferences', 'goals', 'projects',
            'behavioral_patterns', 'emotional_patterns', 'personal_context'
        )),
    extraction_method TEXT NOT NULL
        CHECK (extraction_method IN ('user_stated', 'app_measured', 'model_inferred')),
    raw_context TEXT NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    outcome JSONB,

    -- CRITICAL: idempotency constraint — prevents replay at DB level
    UNIQUE (binding_id, idempotency_key)
);

CREATE INDEX idx_observations_binding ON observations(binding_id);

-- Protocol namespace enforcement at DB level
-- Subjects and predicates starting with 'protocol.' are rejected
CREATE OR REPLACE FUNCTION enforce_protocol_namespace()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.subject LIKE 'protocol.%' OR NEW.predicate LIKE 'protocol.%' THEN
        RAISE EXCEPTION 'cannot write to protocol namespace: subject=%, predicate=%',
            NEW.subject, NEW.predicate;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_observation_namespace
    BEFORE INSERT ON observations
    FOR EACH ROW EXECUTE FUNCTION enforce_protocol_namespace();

CREATE TRIGGER trg_claim_namespace
    BEFORE INSERT OR UPDATE ON claims
    FOR EACH ROW EXECUTE FUNCTION enforce_protocol_namespace();

-- Evidence (immutable provenance records)
CREATE TABLE evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id),
    observation_id UUID REFERENCES observations(id),
    source_type SMALLINT NOT NULL CHECK (source_type BETWEEN 1 AND 5),
    app_id UUID NOT NULL,
    experience_id UUID,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    raw_observation TEXT NOT NULL,
    extraction_method TEXT NOT NULL,
    first_party BOOLEAN NOT NULL DEFAULT true,
    lineage JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'retracted')),
    retracted_at TIMESTAMPTZ,
    retraction_reason TEXT,
    provenance_status TEXT NOT NULL DEFAULT 'active'
        CHECK (provenance_status IN ('active', 'retracted', 'purged'))
);

-- Enforce evidence immutability: only status/retraction fields can change
CREATE OR REPLACE FUNCTION enforce_evidence_immutability()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.id != NEW.id
       OR OLD.claim_id != NEW.claim_id
       OR OLD.observation_id IS DISTINCT FROM NEW.observation_id
       OR OLD.source_type != NEW.source_type
       OR OLD.app_id != NEW.app_id
       OR OLD.raw_observation != NEW.raw_observation
       OR OLD.extraction_method != NEW.extraction_method
       OR OLD.first_party != NEW.first_party
       OR OLD.lineage != NEW.lineage
    THEN
        RAISE EXCEPTION 'evidence is immutable — only status and retraction fields may change';
    END IF;

    -- Can only transition: active → retracted, or active/retracted → purged
    IF OLD.status = 'retracted' AND NEW.status = 'active' THEN
        RAISE EXCEPTION 'cannot un-retract evidence';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_evidence_immutable
    BEFORE UPDATE ON evidence
    FOR EACH ROW EXECUTE FUNCTION enforce_evidence_immutability();

CREATE INDEX idx_evidence_claim ON evidence(claim_id);
CREATE INDEX idx_evidence_claim_active ON evidence(claim_id) WHERE status = 'active';
CREATE INDEX idx_evidence_app ON evidence(app_id);

-- Purged provenance records
CREATE TABLE purged_provenance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id),
    original_evidence_id UUID NOT NULL,
    purged_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- User memory events (immutable action log)
CREATE TABLE user_memory_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    passport_id UUID NOT NULL REFERENCES passports(id),
    claim_id UUID NOT NULL REFERENCES claims(id),
    action TEXT NOT NULL
        CHECK (action IN (
            'CONFIRM', 'CORRECT', 'OVERRIDE',
            'DELETE', 'RECLASSIFY', 'DISPUTE'
        )),
    previous_value TEXT,
    new_value TEXT,
    previous_sensitivity TEXT,
    new_sensitivity TEXT,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    creates_evidence_id UUID,
    creates_version_id UUID
);

-- Enforce append-only on user_memory_events
CREATE TRIGGER trg_user_event_immutable
    BEFORE UPDATE OR DELETE ON user_memory_events
    FOR EACH ROW EXECUTE FUNCTION prevent_version_mutation();

CREATE INDEX idx_user_events_passport ON user_memory_events(passport_id);
CREATE INDEX idx_user_events_claim ON user_memory_events(claim_id);

-- Experiences (raw interaction records)
CREATE TABLE experiences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    passport_id UUID NOT NULL REFERENCES passports(id),
    app_id UUID NOT NULL,
    binding_id UUID NOT NULL REFERENCES bindings(id),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    context JSONB NOT NULL DEFAULT '{}',
    summary TEXT NOT NULL DEFAULT '',
    tags TEXT[] NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_experiences_passport ON experiences(passport_id);
