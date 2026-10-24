const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const filename = path.join(
  __dirname,
  "..",
  "app",
  "widgets",
  "useWidgetDeepLink.ts",
);
const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;

function mountWithDelayedInitialUrl() {
  const pushed = [];
  let resolveInitialUrl;
  let onUrl;
  let initialUrlRequests = 0;
  const initialUrl = new Promise((resolve) => {
    resolveInitialUrl = resolve;
  });
  const dependencies = {
    react: {
      useCallback: (callback) => callback,
      useEffect: (effect) => effect(),
      useRef: (current) => ({ current }),
      useState: (value) => [value, () => {}],
    },
    "react-native": {
      Linking: {
        addEventListener: (_event, callback) => {
          onUrl = callback;
          return { remove() {} };
        },
        getInitialURL: () => {
          initialUrlRequests += 1;
          return initialUrl;
        },
      },
    },
    "expo-router": {
      router: { push: (url) => pushed.push(url) },
      useRootNavigationState: () => ({ key: "ready" }),
    },
    "@/app/AppContext": {
      useAppContext: () => ({ isAuthenticated: true }),
    },
    "@/app/contexts/TerminalSessionsContext": {
      useTerminalSessions: () => ({ navigateToSessions() {} }),
    },
    "@/app/main-axios": {},
    "@/lib/frontend-logger": { systemLogger: { warn() {} } },
    "@/app/utils/toast": { toast: { error() {} } },
    "./types": { WIDGET_LINK_PREFIX: "termix-mobile://widget" },
  };
  const exports = {};
  vm.runInNewContext(
    code,
    {
      exports,
      require(id) {
        if (Object.hasOwn(dependencies, id)) return dependencies[id];
        throw new Error(`Unexpected import: ${id}`);
      },
    },
    { filename },
  );
  exports.useWidgetDeepLink();
  return {
    pushed,
    resolveInitialUrl,
    emit: (url) => onUrl({ url }),
    get initialUrlRequests() {
      return initialUrlRequests;
    },
  };
}

test("a delayed cold-start widget link opens Sessions", async () => {
  const app = mountWithDelayedInitialUrl();
  assert.deepEqual(app.pushed, []);
  app.resolveInitialUrl("termix-mobile://widget/sessions");
  await Promise.resolve();
  assert.deepEqual(app.pushed, ["/(tabs)/sessions?overview=1"]);
  assert.equal(app.initialUrlRequests, 1);
});

test("a live widget tap supersedes an in-flight startup link", async () => {
  const app = mountWithDelayedInitialUrl();
  app.emit("termix-mobile://widget/sessions");
  app.resolveInitialUrl("termix-mobile://widget/open");
  await Promise.resolve();
  assert.deepEqual(app.pushed, ["/(tabs)/sessions?overview=1"]);
});
