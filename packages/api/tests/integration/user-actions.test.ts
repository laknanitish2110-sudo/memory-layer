/**
 * Happy-Path Integration: User Actions
 *
 * confirm → correct → override → dispute → reclassify → delete
 * These produce protocol events and state transitions, not ordinary CRUD.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestApp, userToken, type TestAppContext } from "../helpers/test-app.js";
import { makeClaim } from "../helpers/factories.js";

describe("Integration: User Actions", () => {
  let t: TestAppContext;

  beforeEach(() => {
    t = createTestApp();
  });

  it("confirm: SUPPORTED → DECLARED with evidence", async () => {
    t.addClaim(makeClaim({ id: "clm_confirm", passport_id: "psp_default", state: "SUPPORTED" }));

    const res = await t.app.request("/v1/claims/clm_confirm/confirm", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.new_state).toBe("DECLARED");
    expect(body.data.event_id).toMatch(/^evt_/);
    expect(body.data.evidence_id).toMatch(/^evi_/);
  });

  it("correct: updates value and transitions to DECLARED with new version", async () => {
    t.addClaim(makeClaim({ id: "clm_correct", passport_id: "psp_default", value: "Python 2" }));

    const res = await t.app.request("/v1/claims/clm_correct/correct", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ new_value: "Python 3" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.new_state).toBe("DECLARED");
    expect(body.data.new_value).toBe("Python 3");
    expect(body.data.evidence_id).toMatch(/^evi_/);
    expect(body.data.version_id).toMatch(/^ver_/);
  });

  it("override: sets declared_state chosen by user", async () => {
    t.addClaim(makeClaim({ id: "clm_override", passport_id: "psp_default", state: "CONTESTED" }));

    const res = await t.app.request("/v1/claims/clm_override/override", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ declared_state: "DECLARED" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.new_state).toBe("DECLARED");
    expect(body.data.previous_state).toBe("CONTESTED");
  });

  it("dispute: transitions claim to CONTESTED", async () => {
    t.addClaim(makeClaim({ id: "clm_dispute", passport_id: "psp_default", state: "SUPPORTED" }));

    const res = await t.app.request("/v1/claims/clm_dispute/dispute", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.new_state).toBe("CONTESTED");
  });

  it("reclassify: changes sensitivity level", async () => {
    t.addClaim(makeClaim({ id: "clm_reclass", passport_id: "psp_default", sensitivity: "public" }));

    const res = await t.app.request("/v1/claims/clm_reclass/reclassify", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ new_sensitivity: "sensitive" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.previous_sensitivity).toBe("public");
    expect(body.data.new_sensitivity).toBe("sensitive");
  });

  it("delete: soft-deletes claim with timestamp", async () => {
    t.addClaim(makeClaim({ id: "clm_delete", passport_id: "psp_default" }));

    const res = await t.app.request("/v1/claims/clm_delete/delete", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.deleted).toBe(true);
    expect(body.data.deleted_at).toBeDefined();
  });

  it("all user actions produce events with event_id", async () => {
    const actions = ["confirm", "dispute", "delete"] as const;
    for (const action of actions) {
      const claimId = `clm_${action}_evt`;
      t.addClaim(makeClaim({ id: claimId, passport_id: "psp_default" }));

      const res = await t.app.request(`/v1/claims/${claimId}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.event_id).toMatch(/^evt_/);
    }
  });

  it("user action on nonexistent claim returns 404", async () => {
    const res = await t.app.request("/v1/claims/clm_ghost/confirm", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(404);
  });

  it("user action on another passport's claim returns 404", async () => {
    t.addClaim(makeClaim({ id: "clm_other", passport_id: "psp_attacker" }));

    const res = await t.app.request("/v1/claims/clm_other/confirm", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken()}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(404);
  });
});
