-- Migration 004: Credential Lifecycle
-- Token families with atomic CAS rotation

-- Token families
CREATE TABLE token_families (
    family_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    binding_id UUID NOT NULL REFERENCES bindings(id),
    current_generation INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_token_families_binding ON token_families(binding_id);

-- Atomic compare-and-swap for token rotation
-- Returns the new generation on success, -1 on failure (reuse detected)
CREATE OR REPLACE FUNCTION token_family_cas(
    p_family_id UUID,
    p_expected_generation INTEGER
) RETURNS INTEGER AS $$
DECLARE
    actual_gen INTEGER;
    new_gen INTEGER;
BEGIN
    -- Lock the row and read current generation atomically
    SELECT current_generation INTO actual_gen
    FROM token_families
    WHERE family_id = p_family_id
      AND revoked_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN -1;
    END IF;

    IF actual_gen != p_expected_generation THEN
        -- REUSE DETECTED — revoke the entire family
        UPDATE token_families
        SET revoked_at = now()
        WHERE family_id = p_family_id;
        RETURN -1;
    END IF;

    -- CAS succeeded — increment generation
    new_gen := actual_gen + 1;
    UPDATE token_families
    SET current_generation = new_gen
    WHERE family_id = p_family_id;

    RETURN new_gen;
END;
$$ LANGUAGE plpgsql;

-- Refresh tokens (hashed, generation-tracked)
CREATE TABLE refresh_tokens (
    token_hash TEXT PRIMARY KEY,
    family_id UUID NOT NULL REFERENCES token_families(family_id),
    generation INTEGER NOT NULL,
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_refresh_tokens_family ON refresh_tokens(family_id);

-- Access tokens (short-lived)
CREATE TABLE access_tokens (
    token_hash TEXT PRIMARY KEY,
    family_id UUID NOT NULL REFERENCES token_families(family_id),
    binding_id UUID NOT NULL REFERENCES bindings(id),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL
);

-- Revoke all credentials for a binding (used on ownership transfer, user disconnect)
CREATE OR REPLACE FUNCTION revoke_all_credentials(
    p_binding_id UUID
) RETURNS void AS $$
BEGIN
    UPDATE token_families
    SET revoked_at = now()
    WHERE binding_id = p_binding_id
      AND revoked_at IS NULL;
END;
$$ LANGUAGE plpgsql;
