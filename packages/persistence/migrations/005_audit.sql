-- Migration 005: Audit Trail
-- AccessEvents with policy version, retention lifecycle

CREATE TABLE access_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    binding_id UUID NOT NULL REFERENCES bindings(id),
    grant_id UUID NOT NULL REFERENCES binding_grants(id),
    credential_id TEXT NOT NULL,
    capability_used TEXT NOT NULL,
    categories_accessed TEXT[] NOT NULL,
    claims_served UUID[] NOT NULL DEFAULT '{}',
    claims_served_count INTEGER NOT NULL DEFAULT 0,
    sensitivity_levels_touched TEXT[] NOT NULL DEFAULT '{}',
    accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    request_context TEXT,
    policy_version TEXT NOT NULL,
    grant_version INTEGER NOT NULL,
    binding_revision INTEGER NOT NULL,

    -- Purge support: when claims are purged, these fields get redacted
    resource_reference TEXT  -- set to 'PURGED' after purge
);

CREATE INDEX idx_access_events_binding ON access_events(binding_id);
CREATE INDEX idx_access_events_accessed ON access_events(accessed_at);

-- App reliability metrics (materialized view)
CREATE TABLE app_reliability (
    app_id UUID PRIMARY KEY,
    claims_created INTEGER NOT NULL DEFAULT 0,
    claims_confirmed INTEGER NOT NULL DEFAULT 0,
    claims_corrected INTEGER NOT NULL DEFAULT 0,
    correction_rate NUMERIC(5,4) NOT NULL DEFAULT 0,
    sample_size INTEGER NOT NULL DEFAULT 0,
    window_start TIMESTAMPTZ,
    window_end TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
