-- Migration 007: Force RLS + Harden Role Privileges
-- M1.5 conformance requirement: RLS must apply to ALL roles including table owner

-- Force RLS on all memory tables (table owner is no longer exempt)
ALTER TABLE claims FORCE ROW LEVEL SECURITY;
ALTER TABLE claim_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE observations FORCE ROW LEVEL SECURITY;
ALTER TABLE user_memory_events FORCE ROW LEVEL SECURITY;
ALTER TABLE experiences FORCE ROW LEVEL SECURITY;
ALTER TABLE purged_provenance FORCE ROW LEVEL SECURITY;
ALTER TABLE access_events FORCE ROW LEVEL SECURITY;

-- Revoke anon role access to memory tables
-- Production architecture: only authenticated role should access memory data
-- The anon role is used for unauthenticated Supabase requests
REVOKE ALL ON claims FROM anon;
REVOKE ALL ON claim_versions FROM anon;
REVOKE ALL ON evidence FROM anon;
REVOKE ALL ON observations FROM anon;
REVOKE ALL ON user_memory_events FROM anon;
REVOKE ALL ON experiences FROM anon;
REVOKE ALL ON purged_provenance FROM anon;
REVOKE ALL ON access_events FROM anon;
REVOKE ALL ON bindings FROM anon;
REVOKE ALL ON binding_grants FROM anon;
REVOKE ALL ON token_families FROM anon;
REVOKE ALL ON refresh_tokens FROM anon;
REVOKE ALL ON access_tokens FROM anon;
