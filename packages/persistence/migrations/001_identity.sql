-- Migration 001: Identity Model
-- Account → Passport → Binding → Grant → Credential

-- Accounts (authentication only)
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_provider TEXT NOT NULL,
    auth_id TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (auth_provider, auth_id)
);

-- Passports (memory containers)
CREATE TABLE passports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_ephemeral BOOLEAN NOT NULL DEFAULT false,
    device_id TEXT,
    expires_at TIMESTAMPTZ
);

CREATE INDEX idx_passports_account ON passports(account_id);

-- Developer accounts (app registrants)
CREATE TABLE developer_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    domain TEXT,
    verification_status TEXT NOT NULL DEFAULT 'unverified'
        CHECK (verification_status IN ('unverified', 'verified')),
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- App principals (immutable identity)
CREATE TABLE app_principals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    developer_id UUID NOT NULL REFERENCES developer_accounts(id),
    name TEXT NOT NULL,
    domain TEXT,
    description TEXT NOT NULL DEFAULT '',
    declared_purposes TEXT[] NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'suspended', 'banned')),
    registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ownership history (append-only)
CREATE TABLE ownership_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    app_principal_id UUID NOT NULL REFERENCES app_principals(id),
    developer_id UUID NOT NULL REFERENCES developer_accounts(id),
    from_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    to_at TIMESTAMPTZ
);

-- Bridges (cross-passport links)
CREATE TABLE bridges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_passport_id UUID NOT NULL REFERENCES passports(id),
    target_passport_id UUID NOT NULL REFERENCES passports(id),
    direction TEXT NOT NULL CHECK (direction IN ('one_way', 'bidirectional')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID NOT NULL REFERENCES accounts(id),
    categories TEXT[] NOT NULL,
    sensitivity_ceiling TEXT NOT NULL
        CHECK (sensitivity_ceiling IN ('public', 'personal', 'sensitive', 'restricted')),
    claim_filter TEXT,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'revoked')),
    CHECK (source_passport_id != target_passport_id)
);
