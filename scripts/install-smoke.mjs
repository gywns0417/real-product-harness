#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const installScript = path.join(repoRoot, "install.sh");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-install-smoke-"));
const homeDir = path.join(tmpRoot, "home");
const stubBinDir = path.join(tmpRoot, "stub-bin");
const logDir = path.join(tmpRoot, "logs");
const installDir = path.join(homeDir, ".real-product-harness");
const binDir = path.join(homeDir, ".local", "bin");
const configDir = path.join(homeDir, ".config", "rph");
const profilePath = path.join(homeDir, ".zshrc");

fs.mkdirSync(homeDir, { recursive: true });
fs.mkdirSync(stubBinDir, { recursive: true });
fs.mkdirSync(logDir, { recursive: true });
fs.writeFileSync(profilePath, "# existing shell config\n", "utf8");

writeStub("git", `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$RPH_INSTALL_SMOKE_LOG_DIR/git.log"
if [ "\${1:-}" = "clone" ]; then
  target="\${@: -1}"
  mkdir -p "$target"
  mkdir -p "$target/.git"
  exit 0
fi
if [ "\${1:-}" = "-C" ]; then
  exit 0
fi
printf 'unsupported git stub invocation: %s\\n' "$*" >&2
exit 1
`);

writeStub("pnpm", `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$RPH_INSTALL_SMOKE_LOG_DIR/pnpm.log"
dir=""
args=("$@")
if [ "\${1:-}" = "--dir" ]; then
  dir="\${2:-}"
  args=("\${@:3}")
fi
if [ -z "$dir" ]; then
  printf 'pnpm stub requires --dir\\n' >&2
  exit 1
fi
cmd="\${args[0]:-}"
case "$cmd" in
  install)
    mkdir -p "$dir/node_modules"
    ;;
  build)
    target="$dir/dist/apps/cli/src/index.js"
    mkdir -p "$(dirname "$target")"
    cat > "$target" <<'EOF'
#!/usr/bin/env node
const args = process.argv.slice(2);
if (args.includes("--json") && (args.includes("workspace") || args.includes("/workspace") || args.includes("status") || args.includes("/status"))) {
  console.log(JSON.stringify({ schemaVersion: "rph-operator-workspace-v0" }));
  process.exit(0);
} else if (args[0] === "doctor" && args[1] === "install") {
  console.log("RPH install doctor");
  console.log("- workspace-json=ok");
  console.log("- status-json=ok");
  console.log("next=none");
  process.exit(0);
} else if (args[0] === "doctor" && args[1] === "shell") {
  console.log("RPH shell doctor");
  console.log("- zsh-workspace-json=ok");
  console.log("- bash-workspace-json=ok");
  console.log("next=none");
  process.exit(0);
} else if (args[0] === "update" && args.includes("--dry-run")) {
  console.log("RPH update plan");
  console.log("- command: bash install.sh");
  process.exit(0);
} else {
  console.log('rph stub args=' + args.join(' '));
}
if (args.includes("help")) {
  console.log("rph help stub");
} else if (args.includes("status") || args.includes("/status")) {
  console.log("rph status stub");
} else if (args.includes("workspace") || args.includes("/workspace")) {
  console.log("rph workspace stub");
} else if (args.includes("setup")) {
  console.log("rph setup stub");
} else if (args.includes("/pm") || args.includes("pm")) {
  console.log("rph pm stub");
}
EOF
    chmod +x "$target"
    ;;
  *)
    printf 'unsupported pnpm stub invocation: %s\\n' "$*" >&2
    exit 1
    ;;
esac
`);

const syntax = spawnSync("bash", ["-n", installScript], {
  cwd: repoRoot,
  encoding: "utf8"
});

if (syntax.status !== 0) {
  fail(`install.sh syntax check failed\nstdout:\n${syntax.stdout}\nstderr:\n${syntax.stderr}`);
}

const env = {
  ...process.env,
  HOME: homeDir,
  SHELL: "/bin/zsh",
  PATH: `${stubBinDir}:${process.env.PATH}`,
  NO_COLOR: "1",
  RPH_USE_GH: "0",
  RPH_REPO_URL: "https://example.invalid/real-product-harness.git",
  RPH_REF: "main",
  RPH_INSTALL_DIR: installDir,
  RPH_BIN_DIR: binDir,
  RPH_CONFIG_DIR: configDir,
  RPH_INSTALL_SMOKE_LOG_DIR: logDir
};

const run = spawnSync("bash", [installScript], {
  cwd: repoRoot,
  env,
  encoding: "utf8"
});

if (run.status !== 0) {
  fail(`install smoke failed\nstdout:\n${run.stdout}\nstderr:\n${run.stderr}`);
}

const rerun = spawnSync("bash", [installScript], {
  cwd: repoRoot,
  env,
  encoding: "utf8"
});

if (rerun.status !== 0) {
  fail(`install smoke rerun failed\nstdout:\n${rerun.stdout}\nstderr:\n${rerun.stderr}`);
}

const wrapperPath = path.join(binDir, "rph");
const initPath = path.join(configDir, "init.sh");
const completionPath = path.join(configDir, "completion.zsh");

assertFile(wrapperPath, "wrapper");
assertFile(initPath, "init");
assertFile(completionPath, "completion");
assertFile(profilePath, "shell profile");

const wrapper = fs.readFileSync(wrapperPath, "utf8");
const initFile = fs.readFileSync(initPath, "utf8");
const completion = fs.readFileSync(completionPath, "utf8");
const profile = fs.readFileSync(profilePath, "utf8");
const gitLog = readFile(path.join(logDir, "git.log"));
const pnpmLog = readFile(path.join(logDir, "pnpm.log"));

assertIncludes(wrapper, `exec node "${installDir}/dist/apps/cli/src/index.js" "$@"`, "wrapper");
assertIncludes(initFile, `export PATH="${binDir}:$PATH"`, "init.sh");
assertIncludes(initFile, "function /pm() { command rph /pm \"$@\"; }", "init.sh");
assertIncludes(initFile, "function /agent() { command rph /agent \"$@\"; }", "init.sh");
assertIncludes(initFile, "function /ai() { command rph /ai \"$@\"; }", "init.sh");
assertIncludes(initFile, "function /mcp() { command rph /mcp \"$@\"; }", "init.sh");
assertIncludes(initFile, "function /docs() { command rph /docs \"$@\"; }", "init.sh");
assertIncludes(initFile, "function /workspace() { command rph /workspace \"$@\"; }", "init.sh");
assertIncludes(initFile, "function /doctor() { command rph /doctor \"$@\"; }", "init.sh");
assertIncludes(initFile, "function /github() { command rph /github \"$@\"; }", "init.sh");
assertIncludes(initFile, "function /notion() { command rph /notion \"$@\"; }", "init.sh");
assertIncludes(initFile, 'if [ "${RPH_ENABLE_SLASH_COMMANDS:-1}" = "1" ]; then', "init.sh");
assertIncludes(initFile, `source "${completionPath}"`, "init.sh");
assertIncludes(completion, "#compdef rph", "completion.zsh");
assertIncludes(completion, "help version update shell runtime init status workspace next pause resume cancel setup settings", "completion.zsh");
assertIncludes(completion, "setup_cmds=(auto repair detect apply check ai mcp custom)", "completion.zsh");
assertIncludes(completion, "doctor_cmds=(status install shell)", "completion.zsh");
assertIncludes(completion, "agent_cmds=(status roles catalog discover search import install use activate bind bindings unbind session journal replay handoffs actions action-approvals intents confirm-intent dismiss-intent lanes run continue recover pool worker claim heartbeat ack complete dead-letter approve-action reject-action clear reset)", "completion.zsh");
assertIncludes(completion, "github_cmds=(create-repo setup-labels setup-templates setup-branches create-issue create-pr sync release-plan release-approve hotfix-plan)", "completion.zsh");
assertIncludes(profile, "# existing shell config", "shell profile");
assertIncludes(profile, "# >>> rph init >>>", "shell profile");
assertIncludes(profile, `source "${initPath}"`, "shell profile");

const initBlockCount = profile.match(/# >>> rph init >>>/g)?.length ?? 0;
if (initBlockCount !== 1) {
  fail(`expected exactly one shell init block, found ${initBlockCount}`);
}

assertIncludes(gitLog, `clone --depth 1 --branch main https://example.invalid/real-product-harness.git ${installDir}`, "git log");
assertIncludes(gitLog, `-C ${installDir} status --porcelain --untracked-files=all`, "git log");
assertIncludes(gitLog, `-C ${installDir} remote set-url origin https://example.invalid/real-product-harness.git`, "git log");
assertIncludes(gitLog, `-C ${installDir} fetch --depth 1 origin main`, "git log");
assertIncludes(gitLog, `-C ${installDir} checkout FETCH_HEAD`, "git log");
assertNotIncludes(gitLog, `checkout --force FETCH_HEAD`, "git log");
assertIncludes(pnpmLog, `--dir ${installDir} install --frozen-lockfile`, "pnpm log");
assertIncludes(pnpmLog, `--dir ${installDir} build`, "pnpm log");

assertCommand([wrapperPath, "help"], env, "rph help stub", "wrapper help");
assertCommand([wrapperPath, "status"], env, "rph status stub", "wrapper status");
assertJsonCommand([wrapperPath, "status", "--json"], env, "wrapper status json");
assertJsonCommand([wrapperPath, "workspace", "--json"], env, "wrapper workspace json");
assertCommand([wrapperPath, "/status"], env, "rph status stub", "wrapper slash status");
assertJsonCommand([wrapperPath, "/workspace", "--json"], env, "wrapper slash workspace");
assertCommand([wrapperPath, "/pm", "start"], env, "rph pm stub", "wrapper slash pm");
assertCommand([wrapperPath, "doctor", "install"], env, "RPH install doctor", "wrapper doctor install");
assertCommand([wrapperPath, "doctor", "shell"], env, "RPH shell doctor", "wrapper doctor shell");
assertCommand([wrapperPath, "update", "--dry-run"], env, "RPH update plan", "wrapper update dry-run");
assertShellHelper(initPath, env, "zsh");
assertShellHelper(initPath, env, "bash");

console.log("install smoke passed");
console.log(`tmp: ${tmpRoot}`);

function writeStub(name, content) {
  const filePath = path.join(stubBinDir, name);
  fs.writeFileSync(filePath, content, "utf8");
  fs.chmodSync(filePath, 0o755);
}

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`${label} file missing: ${filePath}`);
  }
}

function assertIncludes(text, expected, label) {
  if (!text.includes(expected)) {
    fail(`${label} missing expected content: ${expected}`);
  }
}

function assertNotIncludes(text, unexpected, label) {
  if (text.includes(unexpected)) {
    fail(`${label} included unexpected content: ${unexpected}`);
  }
}

function readFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`expected log missing: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function assertCommand(command, envValues, expected, label) {
  const [bin, ...args] = command;
  const result = spawnSync(bin, args, {
    env: envValues,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    fail(`${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  assertIncludes(result.stdout, expected, label);
}

function assertJsonCommand(command, envValues, label) {
  const [bin, ...args] = command;
  const result = spawnSync(bin, args, {
    env: envValues,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    fail(`${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  assertJsonSchema(result.stdout, label);
}

function assertJsonSchema(text, label) {
  try {
    const parsed = JSON.parse(text);
    if (parsed.schemaVersion !== "rph-operator-workspace-v0") {
      fail(`${label} expected rph-operator-workspace-v0 schema, got ${parsed.schemaVersion}`);
    }
  } catch (error) {
    fail(`${label} did not print JSON\n${error instanceof Error ? error.message : String(error)}\nstdout:\n${text}`);
  }
}

function assertShellHelper(initFile, envValues, shellName) {
  const result = spawnSync(shellName, ["-lc", `source "${initFile}"; /agent status; /status; /workspace --json; /pm start`], {
    env: {
      ...envValues,
      PATH: `${binDir}:${envValues.PATH}`
    },
    encoding: "utf8"
  });
  if (result.status !== 0) {
    fail(`${shellName} slash helper execution failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  assertIncludes(result.stdout, "rph stub args=/agent status", `${shellName} slash helper`);
  assertIncludes(result.stdout, "rph stub args=/status", `${shellName} slash helper`);
  assertIncludes(result.stdout, "rph stub args=/pm start", `${shellName} slash helper`);
  assertIncludes(result.stdout, "rph status stub", `${shellName} slash helper`);
  assertIncludes(result.stdout, "rph pm stub", `${shellName} slash helper`);
  const jsonLine = result.stdout.split("\n").find((line) => line.trim().startsWith("{"));
  if (!jsonLine) {
    fail(`${shellName} slash helper did not print workspace JSON\nstdout:\n${result.stdout}`);
  }
  assertJsonSchema(jsonLine, `${shellName} slash helper workspace json`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
