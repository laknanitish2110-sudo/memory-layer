-- Migration 009: Add passport scope RPCs for RLS enforcement
-- These functions allow the application to set the `app.passport_id` session
-- variable that RLS policies (migration 006) reference via current_passport_id().
--
-- The service_role key bypasses RLS by default, but setting this variable
-- provides defense-in-depth: even if a code bug constructs a cross-tenant
-- query, the RLS policies will block it because app.passport_id is scoped
-- to the authenticated user's passport.
--
-- set_config(..., true) makes the value transaction-local, so it cannot
-- leak between requests sharing the same connection.

-- RPC to set passport scope for RLS policies
CREATE OR REPLACE FUNCTION set_passport_scope(p_passport_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.passport_id', p_passport_id::text, true);
END;
$$;

-- RPC to clear passport scope
CREATE OR REPLACE FUNCTION clear_passport_scope()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.passport_id', '', true);
END;
$$;

-- Grant execute to service_role only (not anon or authenticated)
REVOKE ALL ON FUNCTION set_passport_scope(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_passport_scope(uuid) TO service_role;

REVOKE ALL ON FUNCTION clear_passport_scope() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clear_passport_scope() TO service_role;
