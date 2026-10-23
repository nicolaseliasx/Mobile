import type { CodexProfileStatus, CodexServerStatus } from "@/app/main-axios";
import type { WidgetCodexProfile, WidgetCodexSummary } from "./types";

function percent(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, value))
    : null;
}

function toProfile(
  profile: CodexProfileStatus | undefined,
): WidgetCodexProfile {
  const windows = Array.isArray(profile?.windows) ? profile.windows : [];
  return {
    state:
      profile?.state === "available" || profile?.state === "limited"
        ? profile.state
        : "unknown",
    remainingPercent: percent(profile?.remainingPercent),
    shortRemainingPercent: percent(
      windows.find((window) => window.name === "primary")?.remainingPercent,
    ),
    longRemainingPercent: percent(
      windows.find((window) => window.name === "secondary")?.remainingPercent,
    ),
    activeSessionCount: Array.isArray(profile?.activeSessions)
      ? profile.activeSessions.length
      : 0,
  };
}

/** Copy only display-safe fields; authentication data and tmux names stay in the app. */
export function toWidgetCodexSummary(
  status: CodexServerStatus | null,
): WidgetCodexSummary | null {
  if (!status) return null;
  const checkedAt = Date.parse(status.checkedAt);
  if (!Number.isFinite(checkedAt)) return null;
  return {
    checkedAt,
    codex: toProfile(status.profiles?.codex),
    codex2: toProfile(status.profiles?.codex2),
  };
}
