import type { RecallContext, MemorySnapshot, SessionRecord } from "./types";
import { MemoryStore } from "./store";

function formatTimeSince(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
}

export async function buildRecallContext(
  store: MemoryStore,
  appId?: string
): Promise<RecallContext> {
  const snapshot = await store.getSnapshot();
  const { profile, lastSession, activePlan } = snapshot;

  const isReturningUser = profile.totalSessions > 0;
  const timeSinceMs = Date.now() - profile.lastActiveAt;
  const timeSinceLastSession = formatTimeSince(timeSinceMs);

  const appSession = appId
    ? await store.getLastSessionForApp(appId)
    : lastSession;

  let suggestedAction: RecallContext["suggestedAction"] = "new";
  if (activePlan) {
    suggestedAction = "planned";
  } else if (appSession && timeSinceMs > 86400000) {
    suggestedAction = "review";
  } else if (appSession) {
    suggestedAction = "continue";
  }

  const summary = buildSummary(
    snapshot,
    appSession,
    timeSinceLastSession,
    suggestedAction
  );

  const activePlanSummary = activePlan
    ? `Plan: ${activePlan.goals.join(", ")}${activePlan.notes ? ` — ${activePlan.notes}` : ""}`
    : null;

  return {
    isReturningUser,
    timeSinceLastSession,
    summary,
    lastAppId: appSession?.appId ?? null,
    activePlanSummary,
    sessionCount: profile.totalSessions,
    totalMinutes: profile.totalTimeMinutes,
    suggestedAction,
  };
}

function buildSummary(
  snapshot: MemorySnapshot,
  lastAppSession: SessionRecord | null,
  timeSince: string,
  action: RecallContext["suggestedAction"]
): string {
  const { profile, activePlan } = snapshot;

  if (!snapshot.lastSession) {
    return "First session. No prior context.";
  }

  const parts: string[] = [];

  parts.push(`Last active ${timeSince}.`);

  if (profile.totalSessions > 1) {
    parts.push(
      `${profile.totalSessions} sessions, ${profile.totalTimeMinutes} minutes total.`
    );
  }

  if (lastAppSession?.summary) {
    parts.push(`Last session: ${lastAppSession.summary}`);
  }

  if (lastAppSession?.tags.length) {
    parts.push(`Topics: ${lastAppSession.tags.join(", ")}.`);
  }

  if (activePlan) {
    parts.push(`Plan: ${activePlan.goals.join(", ")}.`);
  }

  switch (action) {
    case "planned":
      parts.push("Ready to execute plan.");
      break;
    case "review":
      parts.push("Been a while — review recommended.");
      break;
    case "continue":
      parts.push("Continue from last session.");
      break;
  }

  return parts.join(" ");
}

export async function buildContextForAI(
  store: MemoryStore,
  appId: string
): Promise<string> {
  const snapshot = await store.getSnapshot();
  const { profile } = snapshot;
  const appSession = await store.getLastSessionForApp(appId);

  const lines: string[] = [];

  lines.push(`Returning user: ${profile.totalSessions} past sessions.`);
  lines.push(
    `Last active: ${formatTimeSince(Date.now() - profile.lastActiveAt)}.`
  );

  if (Object.keys(profile.preferences).length > 0) {
    lines.push(`Preferences: ${JSON.stringify(profile.preferences)}.`);
  }

  lines.push(
    `Avg engagement: ${(profile.patterns.avgEngagement * 100).toFixed(0)}%.`
  );

  if (appSession) {
    lines.push(`Last session on this app: ${appSession.summary || "no summary"}.`);
    if (appSession.tags.length > 0) {
      lines.push(`Topics: ${appSession.tags.join(", ")}.`);
    }
  }

  const plan = snapshot.activePlan;
  if (plan && plan.appId === appId) {
    lines.push(`User's plan: ${plan.goals.join(", ")}.`);
  }

  return lines.join("\n");
}
