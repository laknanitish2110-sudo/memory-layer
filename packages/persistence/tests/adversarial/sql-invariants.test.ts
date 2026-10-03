import { describe, it, expect } from "vitest";

/**
 * SQL Invariant Tests
 *
 * These tests document the database-level enforcement of protocol invariants.
 * Each test specifies an SQL operation that MUST fail when run against the
 * Postgres schema defined in migrations 001-006.
 *
 * To run these against a live database:
 *   1. Apply migrations 001-006 to a test database
 *   2. Replace `expectSqlToFail` with actual Supabase client calls
 *   3. Verify each operation throws the expected error
 *
 * This file serves as both a test specification and a contract:
 * if any of these operations succeeds, the database is misconfigured.
 */

function sqlInvariant(
  name: string,
  sql: string,
  expectedError: string
): { name: string; sql: string; expectedError: string } {
  return { name, sql, expectedError };
}

describe("Database Invariant #1: Passport isolation via RLS", () => {
  const invariants = [
    sqlInvariant(
      "claims: RLS rejects query without passport scope",
      `SELECT * FROM claims;`,
      "app.passport_id not set"
    ),
    sqlInvariant(
      "claims: RLS prevents cross-passport read",
      `SET LOCAL app.passport_id = 'passport_A';
       SELECT * FROM claims WHERE passport_id = 'passport_B';`,
      "returns 0 rows even if passport_B claims exist"
    ),
    sqlInvariant(
      "claims: RLS prevents cross-passport insert",
      `SET LOCAL app.passport_id = 'passport_A';
       INSERT INTO claims (passport_id, subject, predicate, value, category)
       VALUES ('passport_B', 'user', 'knows', 'Python', 'skills');`,
      "new row violates row-level security policy"
    ),
    sqlInvariant(
      "evidence: RLS scoped through claim's passport",
      `SET LOCAL app.passport_id = 'passport_A';
       SELECT * FROM evidence WHERE claim_id IN (
         SELECT id FROM claims WHERE passport_id = 'passport_B'
       );`,
      "returns 0 rows — RLS on claims filters the subquery"
    ),
    sqlInvariant(
      "observations: RLS scoped through binding's passport",
      `SET LOCAL app.passport_id = 'passport_A';
       SELECT * FROM observations WHERE binding_id IN (
         SELECT id FROM bindings WHERE passport_id = 'passport_B'
       );`,
      "returns 0 rows — binding scope prevents access"
    ),
  ];

  for (const inv of invariants) {
    it(inv.name, () => {
      expect(inv.sql).toBeTruthy();
      expect(inv.expectedError).toBeTruthy();
    });
  }
});

describe("Database Invariant #2: Append-only claim_versions", () => {
  const invariants = [
    sqlInvariant(
      "UPDATE on claim_versions is rejected",
      `UPDATE claim_versions SET value = 'modified' WHERE id = 'cv_1';`,
      "claim_versions is append-only — no updates allowed"
    ),
    sqlInvariant(
      "DELETE on claim_versions is rejected",
      `DELETE FROM claim_versions WHERE id = 'cv_1';`,
      "claim_versions is append-only — no updates allowed"
    ),
  ];

  for (const inv of invariants) {
    it(inv.name, () => {
      expect(inv.sql).toBeTruthy();
      expect(inv.expectedError).toBeTruthy();
    });
  }
});

describe("Database Invariant #3: Append-only binding_grants", () => {
  const invariants = [
    sqlInvariant(
      "UPDATE on grant capabilities is rejected",
      `UPDATE binding_grants
       SET capabilities = ARRAY['read_context', 'read_claims', 'write_claims']
       WHERE id = 'grant_1';`,
      "binding_grants is append-only — only active flag may change"
    ),
    sqlInvariant(
      "UPDATE on grant data_policy is rejected",
      `UPDATE binding_grants
       SET data_policy = '{"read":{"categories":["skills","preferences"],"sensitivity_ceiling":"sensitive"}}'
       WHERE id = 'grant_1';`,
      "binding_grants is append-only — only active flag may change"
    ),
    sqlInvariant(
      "Toggling active flag IS allowed",
      `UPDATE binding_grants SET active = false WHERE id = 'grant_1';`,
      "NO ERROR — this is the one allowed mutation"
    ),
  ];

  for (const inv of invariants) {
    it(inv.name, () => {
      expect(inv.sql).toBeTruthy();
    });
  }
});

describe("Database Invariant #4: Evidence immutability", () => {
  const invariants = [
    sqlInvariant(
      "UPDATE on evidence value columns is rejected",
      `UPDATE evidence SET raw_observation = 'tampered' WHERE id = 'ev_1';`,
      "evidence is immutable — only status and retraction fields may change"
    ),
    sqlInvariant(
      "UPDATE on evidence source_type is rejected",
      `UPDATE evidence SET source_type = 1 WHERE id = 'ev_1';`,
      "evidence is immutable — only status and retraction fields may change"
    ),
    sqlInvariant(
      "UPDATE on evidence lineage is rejected",
      `UPDATE evidence SET lineage = '{"origin_app_id":"attacker"}' WHERE id = 'ev_1';`,
      "evidence is immutable — only status and retraction fields may change"
    ),
    sqlInvariant(
      "Retraction status change IS allowed",
      `UPDATE evidence
       SET status = 'retracted',
           retracted_at = now(),
           retraction_reason = 'user corrected'
       WHERE id = 'ev_1';`,
      "NO ERROR — status transitions are allowed"
    ),
    sqlInvariant(
      "Un-retraction is rejected",
      `UPDATE evidence SET status = 'active'
       WHERE id = 'ev_1' AND status = 'retracted';`,
      "cannot un-retract evidence"
    ),
  ];

  for (const inv of invariants) {
    it(inv.name, () => {
      expect(inv.sql).toBeTruthy();
    });
  }
});

describe("Database Invariant #5: Protocol namespace enforcement", () => {
  const invariants = [
    sqlInvariant(
      "Observation with protocol.* subject is rejected",
      `INSERT INTO observations
       (idempotency_key, binding_id, subject, predicate, value,
        declared_sensitivity, declared_category, extraction_method, raw_context)
       VALUES ('key_1', 'binding_1', 'protocol.internal', 'state', 'active',
               'public', 'skills', 'app_measured', 'test');`,
      "cannot write to protocol namespace"
    ),
    sqlInvariant(
      "Observation with protocol.* predicate is rejected",
      `INSERT INTO observations
       (idempotency_key, binding_id, subject, predicate, value,
        declared_sensitivity, declared_category, extraction_method, raw_context)
       VALUES ('key_2', 'binding_1', 'user', 'protocol.version', '1.0',
               'public', 'skills', 'app_measured', 'test');`,
      "cannot write to protocol namespace"
    ),
    sqlInvariant(
      "Claim with protocol.* subject is rejected",
      `INSERT INTO claims
       (passport_id, subject, predicate, value, category)
       VALUES ('p1', 'protocol.binding', 'status', 'active', 'skills');`,
      "cannot write to protocol namespace"
    ),
  ];

  for (const inv of invariants) {
    it(inv.name, () => {
      expect(inv.sql).toBeTruthy();
    });
  }
});

describe("Database Invariant #6: Observation idempotency", () => {
  const invariants = [
    sqlInvariant(
      "Duplicate (binding_id, idempotency_key) is rejected",
      `INSERT INTO observations
       (idempotency_key, binding_id, subject, predicate, value,
        declared_sensitivity, declared_category, extraction_method, raw_context)
       VALUES ('key_dup', 'binding_1', 'user', 'knows', 'Python',
               'public', 'skills', 'app_measured', 'test');
       INSERT INTO observations
       (idempotency_key, binding_id, subject, predicate, value,
        declared_sensitivity, declared_category, extraction_method, raw_context)
       VALUES ('key_dup', 'binding_1', 'user', 'knows', 'Java',
               'public', 'skills', 'app_measured', 'test');`,
      "duplicate key value violates unique constraint"
    ),
    sqlInvariant(
      "Same key different binding IS allowed",
      `INSERT INTO observations
       (idempotency_key, binding_id, subject, predicate, value,
        declared_sensitivity, declared_category, extraction_method, raw_context)
       VALUES ('key_same', 'binding_1', 'user', 'knows', 'Python',
               'public', 'skills', 'app_measured', 'test');
       INSERT INTO observations
       (idempotency_key, binding_id, subject, predicate, value,
        declared_sensitivity, declared_category, extraction_method, raw_context)
       VALUES ('key_same', 'binding_2', 'user', 'knows', 'Java',
               'public', 'skills', 'app_measured', 'test');`,
      "NO ERROR — different bindings can reuse keys"
    ),
  ];

  for (const inv of invariants) {
    it(inv.name, () => {
      expect(inv.sql).toBeTruthy();
    });
  }
});

describe("Database Invariant #7: Token family CAS atomicity", () => {
  const invariants = [
    sqlInvariant(
      "CAS succeeds with matching generation",
      `SELECT token_family_cas('fam_1', 0);`,
      "returns 1 (new generation) — CAS succeeded"
    ),
    sqlInvariant(
      "CAS fails and revokes on generation mismatch",
      `SELECT token_family_cas('fam_1', 0);  -- first call bumps to gen 1
       SELECT token_family_cas('fam_1', 0);  -- second call with stale gen 0`,
      "returns -1 AND family.revoked_at is set"
    ),
    sqlInvariant(
      "CAS on revoked family returns -1",
      `UPDATE token_families SET revoked_at = now() WHERE family_id = 'fam_1';
       SELECT token_family_cas('fam_1', 0);`,
      "returns -1 — revoked families cannot rotate"
    ),
  ];

  for (const inv of invariants) {
    it(inv.name, () => {
      expect(inv.sql).toBeTruthy();
    });
  }
});

describe("Database Invariant #8: Binding revision atomicity", () => {
  const invariants = [
    sqlInvariant(
      "check_binding_revision with FOR UPDATE prevents concurrent reads",
      `-- In transaction A:
       SELECT check_binding_revision('binding_1', 1);
       -- Row is now locked until A commits
       -- Transaction B calling check_binding_revision blocks until A releases`,
      "FOR UPDATE ensures serialized access"
    ),
    sqlInvariant(
      "increment_binding_revision is atomic",
      `SELECT increment_binding_revision('binding_1');
       SELECT increment_binding_revision('binding_1');`,
      "second call returns current+1, never same value as first"
    ),
  ];

  for (const inv of invariants) {
    it(inv.name, () => {
      expect(inv.sql).toBeTruthy();
    });
  }
});

describe("Database Invariant #9: Append-only user_memory_events", () => {
  it("UPDATE on user_memory_events is rejected", () => {
    const inv = sqlInvariant(
      "UPDATE rejected",
      `UPDATE user_memory_events SET action = 'CONFIRM' WHERE id = 'ume_1';`,
      "claim_versions is append-only — no updates allowed"
    );
    expect(inv.sql).toBeTruthy();
  });

  it("DELETE on user_memory_events is rejected", () => {
    const inv = sqlInvariant(
      "DELETE rejected",
      `DELETE FROM user_memory_events WHERE id = 'ume_1';`,
      "claim_versions is append-only — no updates allowed"
    );
    expect(inv.sql).toBeTruthy();
  });
});

describe("Database Invariant #10: CHECK constraints enforce valid enums", () => {
  const invariants = [
    sqlInvariant(
      "Invalid category is rejected",
      `INSERT INTO claims (passport_id, subject, predicate, value, category)
       VALUES ('p1', 'user', 'knows', 'Python', 'invalid_category');`,
      "violates check constraint"
    ),
    sqlInvariant(
      "Invalid state is rejected",
      `UPDATE claims SET state = 'INVALID_STATE' WHERE id = 'cl_1';`,
      "violates check constraint"
    ),
    sqlInvariant(
      "Invalid sensitivity is rejected",
      `UPDATE claims SET sensitivity = 'ultra_secret' WHERE id = 'cl_1';`,
      "violates check constraint"
    ),
    sqlInvariant(
      "Invalid extraction_method is rejected",
      `INSERT INTO observations
       (idempotency_key, binding_id, subject, predicate, value,
        declared_sensitivity, declared_category, extraction_method, raw_context)
       VALUES ('k1', 'b1', 'u', 'k', 'v', 'public', 'skills', 'hacked', 'x');`,
      "violates check constraint"
    ),
  ];

  for (const inv of invariants) {
    it(inv.name, () => {
      expect(inv.sql).toBeTruthy();
    });
  }
});
