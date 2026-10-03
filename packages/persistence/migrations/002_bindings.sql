-- Migration 002: Binding & Permission Model
-- Three-layer: Binding → BindingGrant → Credential

-- Bindings (app ↔ passport relationship)
CREATE TABLE bindings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    passport_id UUID NOT NULL REFERENCES passports(id),
    app_principal_id UUID NOT NULL REFERENCES app_principals(id),
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'revoked')),
    current_grant_id UUID,  -- FK added after grants table
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    suspended_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    suspension_type TEXT
        CHECK (suspension_type IN (
            'user_paused',
            'platform_rate_violation',
            'platform_security',
            'platform_abuse',
            'ownership_transfer'
        )),
    UNIQUE (passport_id, app_principal_id)
);

CREATE INDEX idx_bindings_passport ON bindings(passport_id);
CREATE INDEX idx_bindings_app ON bindings(app_principal_id);

-- Binding grants (versioned permissions — append-only)
CREATE TABLE binding_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    binding_id UUID NOT NULL REFERENCES bindings(id),
    version INTEGER NOT NULL,
    capabilities TEXT[] NOT NULL,
    -- Data policy stored as JSONB (complex nested structure)
    data_policy JSONB NOT NULL,
    authorized_purposes TEXT[] NOT NULL DEFAULT '{}',
    consent_record_id UUID,
    consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    consent_method TEXT NOT NULL
        CHECK (consent_method IN (
            'initial_auth', 'upgrade_prompt',
            'downgrade_silent', 'reauthorization'
        )),
    supersedes_grant_id UUID REFERENCES binding_grants(id),
    active BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (binding_id, version)
);

-- Enforce append-only: no UPDATE on grants
CREATE OR REPLACE FUNCTION prevent_grant_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Only allow toggling active flag (to deactivate old grants)
    IF OLD.id = NEW.id
       AND OLD.binding_id = NEW.binding_id
       AND OLD.version = NEW.version
       AND OLD.capabilities = NEW.capabilities
       AND OLD.data_policy = NEW.data_policy
       AND OLD.authorized_purposes = NEW.authorized_purposes
       AND OLD.active != NEW.active
    THEN
        RETURN NEW;
    END IF;
    RAISE EXCEPTION 'binding_grants is append-only — only active flag may change';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_grant_immutable
    BEFORE UPDATE ON binding_grants
    FOR EACH ROW EXECUTE FUNCTION prevent_grant_update();

-- Now add the FK from bindings to binding_grants
ALTER TABLE bindings
    ADD CONSTRAINT fk_binding_current_grant
    FOREIGN KEY (current_grant_id) REFERENCES binding_grants(id);

-- Consent records (audit trail of every consent decision)
CREATE TABLE consent_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    binding_id UUID NOT NULL REFERENCES bindings(id),
    grant_id UUID NOT NULL REFERENCES binding_grants(id),
    grant_version INTEGER NOT NULL,
    consented_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    consent_type TEXT NOT NULL
        CHECK (consent_type IN ('initial', 'expansion', 'reduction', 'reauthorization')),
    capabilities_granted TEXT[] NOT NULL,
    data_policy_granted JSONB NOT NULL,
    delta_from_previous JSONB,
    presented_to_user JSONB NOT NULL
);

-- Restricted claim approvals
CREATE TABLE restricted_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    binding_id UUID NOT NULL REFERENCES bindings(id),
    granularity_type TEXT NOT NULL
        CHECK (granularity_type IN ('claim_version', 'claim_lineage', 'category')),
    claim_id UUID,
    claim_version_id UUID,
    category TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ
);

-- Atomic binding revision increment
CREATE OR REPLACE FUNCTION increment_binding_revision(
    p_binding_id UUID
) RETURNS INTEGER AS $$
DECLARE
    new_rev INTEGER;
BEGIN
    UPDATE bindings
    SET revision = revision + 1
    WHERE id = p_binding_id
    RETURNING revision INTO new_rev;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'binding not found: %', p_binding_id;
    END IF;

    RETURN new_rev;
END;
$$ LANGUAGE plpgsql;

-- Atomic binding revision check (returns true only if request revision >= current)
CREATE OR REPLACE FUNCTION check_binding_revision(
    p_binding_id UUID,
    p_request_revision INTEGER
) RETURNS BOOLEAN AS $$
DECLARE
    current_rev INTEGER;
BEGIN
    SELECT revision INTO current_rev
    FROM bindings
    WHERE id = p_binding_id
    FOR UPDATE;  -- lock row during check

    IF NOT FOUND THEN
        RETURN false;
    END IF;

    RETURN p_request_revision >= current_rev;
END;
$$ LANGUAGE plpgsql;
