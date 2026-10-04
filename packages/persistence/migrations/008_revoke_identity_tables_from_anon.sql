-- Migration 008: Revoke anon access to identity tables
-- Codifies the live fix applied during M1.5 session.
-- Without this, Supabase's anon key (public knowledge) can read accounts and passports.

REVOKE ALL ON accounts FROM anon;
REVOKE ALL ON passports FROM anon;
REVOKE ALL ON developer_accounts FROM anon;
REVOKE ALL ON app_principals FROM anon;
REVOKE ALL ON ownership_history FROM anon;
REVOKE ALL ON bridges FROM anon;
REVOKE ALL ON consent_records FROM anon;
REVOKE ALL ON experiences FROM anon;
REVOKE ALL ON memories FROM anon;
REVOKE ALL ON purged_provenance FROM anon;
REVOKE ALL ON restricted_approvals FROM anon;
REVOKE ALL ON app_reliability FROM anon;
