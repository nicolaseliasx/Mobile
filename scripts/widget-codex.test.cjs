const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

function loadWidgetModule(name, dependencies = {}) {
  const filename = path.join(__dirname, "..", "app", "widgets", `${name}.ts`);
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  vm.runInNewContext(
    output,
    {
      exports,
      require(id) {
        if (Object.hasOwn(dependencies, id)) return dependencies[id];
        throw new Error(`Unexpected import: ${id}`);
      },
    },
    { filename },
  );
  return exports;
}

const types = loadWidgetModule("types");
const codex = loadWidgetModule("codex");
const snapshot = loadWidgetModule("snapshot", { "./types": types });

const serverStatus = {
  checkedAt: "2026-10-23T12:00:00Z",
  token: "must never reach the widget",
  profiles: {
    codex: {
      state: "available",
      remainingPercent: 18,
      activeSessions: ["private-tmux-name"],
      windows: [
        {
          name: "primary",
          remainingPercent: 55,
          resetsAt: 42,
          email: "private@example.com",
        },
        { name: "secondary", remainingPercent: 18, resetsAt: 43 },
      ],
    },
    codex2: {
      state: "limited",
      remainingPercent: 0,
      activeSessions: [],
      windows: [{ name: "primary", remainingPercent: 0, resetsAt: null }],
    },
  },
};

test("widget status includes both quotas without credentials or session names", () => {
  const result = codex.toWidgetCodexSummary(serverStatus);
  assert.equal(result.checkedAt, Date.parse(serverStatus.checkedAt));
  assert.equal(result.codex.remainingPercent, 18);
  assert.equal(result.codex.shortRemainingPercent, 55);
  assert.equal(result.codex.longRemainingPercent, 18);
  assert.equal(result.codex.activeSessionCount, 1);
  assert.equal(result.codex2.state, "limited");
  assert.equal(result.codex2.longRemainingPercent, null);
  const json = JSON.stringify(result);
  for (const secret of [
    "private-tmux-name",
    "private@example.com",
    "must never reach the widget",
    "resetsAt",
  ]) {
    assert.equal(json.includes(secret), false);
  }
});

test("unknown and invalid status cannot invent a healthy quota", () => {
  assert.equal(codex.toWidgetCodexSummary(null), null);
  assert.equal(
    codex.toWidgetCodexSummary({ ...serverStatus, checkedAt: "invalid" }),
    null,
  );
  const result = codex.toWidgetCodexSummary({
    checkedAt: serverStatus.checkedAt,
    profiles: {
      codex: {
        state: "unknown",
        remainingPercent: NaN,
        activeSessions: [],
        windows: [],
      },
    },
  });
  assert.equal(result.codex.remainingPercent, null);
  assert.equal(result.codex2.state, "unknown");
});

test("signed-out snapshots clear quotas; authenticated snapshots carry them", () => {
  const status = codex.toWidgetCodexSummary(serverStatus);
  const common = {
    hosts: [],
    statuses: {},
    accent: "#f59145",
    now: 1234,
    codex: status,
  };
  const authenticated = snapshot.buildWidgetSnapshot({
    ...common,
    authenticated: true,
  });
  assert.equal(authenticated.codex.codex2.state, "limited");
  assert.equal(
    snapshot.buildWidgetSnapshot({ ...common, authenticated: false }).codex,
    null,
  );
  assert.equal(snapshot.buildSignedOutSnapshot("#f59145", 1234).codex, null);
  assert.equal(
    snapshot.isSnapshotEquivalent(authenticated, {
      ...authenticated,
      updatedAt: 9999,
    }),
    true,
  );
  assert.equal(
    snapshot.isSnapshotEquivalent(authenticated, {
      ...authenticated,
      codex: null,
    }),
    false,
  );
});
