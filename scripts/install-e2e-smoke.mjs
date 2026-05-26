#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const installScript = path.join(repoRoot, "install.sh");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-install-e2e-"));
const sourceRepo = path.join(tmpRoot, "source");
const homeDir = path.join(tmpRoot, "home");
const installDir = path.join(homeDir, ".real-product-harness");
const binDir = path.join(homeDir, ".local", "bin");
const configDir = path.join(homeDir, ".config", "rph");
const profilePath = path.join(homeDir, ".zshrc");
const projectDir = path.join(tmpRoot, "product");
const slashProjectDir = path.join(tmpRoot, "slash-product");
const topLevelProjectDir = path.join(tmpRoot, "top-level-product");

fs.mkdirSync(homeDir, { recursive: true });
fs.mkdirSync(projectDir, { recursive: true });
fs.mkdirSync(slashProjectDir, { recursive: true });
fs.mkdirSync(topLevelProjectDir, { recursive: true });
fs.writeFileSync(profilePath, "# existing shell config\n", "utf8");

copyCurrentWorktree(sourceRepo);
createSourceGitRepo(sourceRepo);

const env = {
  ...process.env,
  HOME: homeDir,
  SHELL: "/bin/zsh",
  NO_COLOR: "1",
  RPH_USE_GH: "0",
  RPH_REPO_URL: pathToFileURL(sourceRepo).href,
  RPH_REF: "main",
  RPH_INSTALL_DIR: installDir,
  RPH_BIN_DIR: binDir,
  RPH_CONFIG_DIR: configDir,
  RPH_AUTO_SHELL_INTEGRATION: "1"
};

runChecked("bash", [installScript], {
  cwd: repoRoot,
  env,
  label: "install.sh clean-home run"
});

const wrapperPath = path.join(binDir, "rph");
const initPath = path.join(configDir, "init.sh");
const completionPath = path.join(configDir, "completion.zsh");
assertFile(wrapperPath, "installed wrapper");
assertFile(initPath, "shell init");
assertFile(completionPath, "zsh completion");
assertFile(path.join(installDir, "dist", "apps", "cli", "src", "index.js"), "built CLI entry");

const wrapper = fs.readFileSync(wrapperPath, "utf8");
const init = fs.readFileSync(initPath, "utf8");
const completion = fs.readFileSync(completionPath, "utf8");
const profile = fs.readFileSync(profilePath, "utf8");
assertIncludes(wrapper, `exec node "${installDir}/dist/apps/cli/src/index.js" "$@"`, "wrapper");
assertIncludes(init, `export PATH="${binDir}:$PATH"`, "init.sh");
assertIncludes(init, "function /shell() { command rph shell \"$@\"; }", "init.sh");
assertIncludes(init, "function /chat() { command rph /chat \"$@\"; }", "init.sh");
assertIncludes(init, "function /pm() { command rph /pm \"$@\"; }", "init.sh");
assertIncludes(init, "function /agent() { command rph /agent \"$@\"; }", "init.sh");
assertIncludes(init, "function /daemon() { command rph /daemon \"$@\"; }", "init.sh");
assertIncludes(init, "function /setup() { command rph /setup \"$@\"; }", "init.sh");
assertIncludes(init, "function /home() { command rph /home \"$@\"; }", "init.sh");
assertIncludes(init, "function /workspace() { command rph /workspace \"$@\"; }", "init.sh");
assertIncludes(init, "function /live() { command rph /live \"$@\"; }", "init.sh");
assertIncludes(init, "_rph_slash_helpers=\"/shell /chat /pm /pd /setup /status /home /workspace /next /qa /fe /be /ai /mcp /live /docs /github /notion /agent /daemon /productize /doctor /help\"", "init.sh");
assertIncludes(init, 'if [ "${RPH_ENABLE_SLASH_COMMANDS:-1}" = "1" ]; then', "init.sh");
assertIncludes(init, 'complete -F _rph_bash_complete "$helper" 2>/dev/null || true', "init.sh");
assertIncludes(completion, "#compdef rph /shell /chat /pm /pd /setup /status /home /workspace /next /qa /fe /be /ai /mcp /live /docs /github /notion /agent /daemon /productize /doctor /help", "completion.zsh");
assertIncludes(completion, "help version update home go shell runtime init status workspace next pause resume cancel setup settings", "completion.zsh");
assertIncludes(completion, "_rph_subcommands()", "completion.zsh");
assertIncludes(completion, "compdef _rph rph /shell /chat /pm /pd /setup /status /home /workspace /next /qa /fe /be /ai /mcp /live /docs /github /notion /agent /daemon /productize /doctor /help", "completion.zsh");
assertIncludes(completion, "setup_cmds=(auto repair detect apply check ai provider mcp custom)", "completion.zsh");
assertIncludes(completion, "doctor_cmds=(status install shell)", "completion.zsh");
assertIncludes(completion, "agent_cmds=(status roles catalog discover search import install use activate bind bindings unbind session journal replay graph handoffs actions action-approvals intents confirm-intent dismiss-intent lanes workers run continue recover pool worker claim heartbeat ack complete dead-letter approve-action reject-action clear reset)", "completion.zsh");
assertIncludes(completion, "daemon_cmds=(status start run stop logs service install uninstall plist)", "completion.zsh");
assertIncludes(completion, "mcp_cmds=(status tools call canary test enable disable)", "completion.zsh");
assertIncludes(completion, "live_cmds=(status audit repair target ai:openai ai:anthropic ai:gemini mcp:stitch mcp:github mcp:notion mcp:figma)", "completion.zsh");
assertIncludes(completion, "proofs_cmds=(status events)", "completion.zsh");
assertIncludes(profile, "# >>> rph init >>>", "shell profile");
assertIncludes(profile, `source "${initPath}"`, "shell profile");

const version = runChecked(wrapperPath, ["version"], {
  cwd: projectDir,
  env,
  label: "installed rph version"
});
assertIncludes(version.stdout, packageJson.version, "installed rph version");

const topLevelCapture = path.join(tmpRoot, "top-level-fetch-calls.jsonl");
const topLevelPreload = createInstallTopLevelPreload(tmpRoot, topLevelCapture);
const topLevelEnv = {
  ...env,
  OPENAI_API_KEY: "install-e2e-openai",
  NODE_OPTIONS: `${env.NODE_OPTIONS ?? ""} --require ${topLevelPreload}`.trim()
};
const topLevelStart = runChecked(wrapperPath, [
  "start",
  "--from-env",
  "--live",
  "--ai",
  "openai",
  "--mcp",
  "none",
  "연결 확인 인사해줘"
], {
  cwd: topLevelProjectDir,
  env: topLevelEnv,
  label: "installed top-level start chat"
});
assertIncludes(topLevelStart.stdout, "RPH runtime: setup needed before agent chat", "installed top-level start chat");
assertIncludes(topLevelStart.stdout, "setup assistant: rph setup auto --live", "installed top-level start chat");
assertIncludes(topLevelStart.stdout, "setup live check passed", "installed top-level start chat");
assertIncludes(topLevelStart.stdout, "OK", "installed top-level start chat");
assertFile(path.join(topLevelProjectDir, ".rph", "project.json"), "top-level project");
assertFile(path.join(topLevelProjectDir, ".rph", "connections", "latest.json"), "top-level connection report");
const topLevelChat = runChecked(wrapperPath, ["chat", "두 번째 인사도 해줘"], {
  cwd: topLevelProjectDir,
  env: topLevelEnv,
  label: "installed top-level chat alias"
});
assertIncludes(topLevelChat.stdout, "OK", "installed top-level chat alias");
const topLevelShellChat = runChecked("zsh", ["-lc", `source "${initPath}"; cd "${topLevelProjectDir}"; /chat "세 번째 인사도 해줘"`], {
  cwd: tmpRoot,
  env: {
    ...topLevelEnv,
    PATH: `${binDir}:${topLevelEnv.PATH}`
  },
  label: "installed shell chat helper"
});
assertIncludes(topLevelShellChat.stdout, "OK", "installed shell chat helper");
const capturedTopLevelCalls = fs.readFileSync(topLevelCapture, "utf8");
assertIncludes(capturedTopLevelCalls, "Reply with exactly OK.", "installed top-level captured smoke");
assertIncludes(capturedTopLevelCalls, "연결 확인 인사해줘", "installed top-level captured first chat");
assertIncludes(capturedTopLevelCalls, "두 번째 인사도 해줘", "installed top-level captured second chat");
assertIncludes(capturedTopLevelCalls, "세 번째 인사도 해줘", "installed shell captured third chat");

const pmStart = runChecked(wrapperPath, ["/pm", "start", "--project-name", "Install E2E Product"], {
  cwd: projectDir,
  env,
  label: "installed slash pm start"
});
assertIncludes(pmStart.stdout, "RPH project initialized: Install E2E Product", "installed slash pm start");
assertIncludes(pmStart.stdout, "PM 워크플로우 시작", "installed slash pm start");
assertFile(path.join(projectDir, ".rph", "state.json"), "project state");

const pmStartPlainProjectDir = path.join(tmpRoot, "plain-pm-product");
fs.mkdirSync(pmStartPlainProjectDir, { recursive: true });
const pmStartPlain = runChecked(wrapperPath, ["pm", "start", "--project-name", "Install Plain PM Product"], {
  cwd: pmStartPlainProjectDir,
  env,
  label: "installed pm start"
});
assertIncludes(pmStartPlain.stdout, "RPH project initialized: Install Plain PM Product", "installed pm start");
assertIncludes(pmStartPlain.stdout, "PM 워크플로우 시작", "installed pm start");
assertFile(path.join(pmStartPlainProjectDir, ".rph", "state.json"), "plain pm project state");

const status = runChecked(wrapperPath, ["/status"], {
  cwd: projectDir,
  env,
  label: "installed slash status"
});
assertIncludes(status.stdout, "PM_PRODUCT_DEFINITION_INTERVIEW", "installed slash status");

const workspaceJson = runChecked(wrapperPath, ["workspace", "--json"], {
  cwd: projectDir,
  env,
  label: "installed workspace json"
});
assertJsonSchema(workspaceJson.stdout, "rph-operator-workspace-v0", "installed workspace json");

const statusJson = runChecked(wrapperPath, ["status", "--json"], {
  cwd: projectDir,
  env,
  label: "installed status json"
});
assertJsonSchema(statusJson.stdout, "rph-operator-workspace-v0", "installed status json");

const installDoctor = runChecked(wrapperPath, ["doctor", "install"], {
  cwd: projectDir,
  env: {
    ...env,
    PATH: `${binDir}:${env.PATH}`
  },
  label: "installed doctor install"
});
assertIncludes(installDoctor.stdout, "RPH install doctor", "installed doctor install");
assertIncludes(installDoctor.stdout, "- workspace-json=ok", "installed doctor install");
assertIncludes(installDoctor.stdout, "- status-json=ok", "installed doctor install");
assertIncludes(installDoctor.stdout, "current_install=yes", "installed doctor install");
assertIncludes(installDoctor.stdout, "next=none", "installed doctor install");

const shellDoctor = runChecked(wrapperPath, ["doctor", "shell"], {
  cwd: projectDir,
  env: {
    ...env,
    PATH: `${binDir}:${env.PATH}`
  },
  label: "installed doctor shell"
});
assertIncludes(shellDoctor.stdout, "RPH shell doctor", "installed doctor shell");
assertIncludes(shellDoctor.stdout, "- zsh-workspace-json=ok", "installed doctor shell");
assertIncludes(shellDoctor.stdout, "next=none", "installed doctor shell");

const updateDryRun = runChecked(wrapperPath, ["update", "--dry-run"], {
  cwd: projectDir,
  env,
  label: "installed update dry-run"
});
assertIncludes(updateDryRun.stdout, "RPH update plan", "installed update dry-run");
assertIncludes(updateDryRun.stdout, "- command: bash", "installed update dry-run");
assertIncludes(updateDryRun.stdout, "- install_dirty=no", "installed update dry-run");
assertIncludes(updateDryRun.stdout, "- safe_to_run=yes", "installed update dry-run");

appendAndCommit(sourceRepo, "README.md", "\nremote update for dirty-check smoke\n", "Advance source for update smoke");
const localDirtyMarker = "local install edit must survive dirty update refusal";
fs.appendFileSync(path.join(installDir, "README.md"), `\n${localDirtyMarker}\n`, "utf8");
const dirtyUpdate = spawnSync(wrapperPath, ["update"], {
  cwd: projectDir,
  env,
  encoding: "utf8",
  maxBuffer: 1024 * 1024 * 20
});
if (dirtyUpdate.status === 0) {
  fail(`dirty installed checkout update unexpectedly succeeded\nstdout:\n${dirtyUpdate.stdout}\nstderr:\n${dirtyUpdate.stderr}`);
}
assertIncludes(
  `${dirtyUpdate.stdout}\n${dirtyUpdate.stderr}`,
  "has local changes; commit, stash, or remove them before running rph update",
  "dirty update refusal"
);
assertIncludes(fs.readFileSync(path.join(installDir, "README.md"), "utf8"), localDirtyMarker, "dirty update preserved local edit");
runChecked("git", ["checkout", "--", "README.md"], {
  cwd: installDir,
  env,
  label: "clean dirty install checkout"
});
const cleanUpdate = runChecked(wrapperPath, ["update"], {
  cwd: projectDir,
  env,
  label: "installed clean update after dirty refusal"
});
assertIncludes(cleanUpdate.stdout, "updating", "installed clean update after dirty refusal");

const shellHelpers = runChecked("zsh", ["-lc", `source "${initPath}"; cd "${slashProjectDir}"; /pm start --project-name "Shell Slash Product"; /workspace --json; /daemon status; /status`], {
  cwd: tmpRoot,
  env: {
    ...env,
    PATH: `${binDir}:${env.PATH}`
  },
  label: "installed shell slash helpers"
});
assertFile(path.join(slashProjectDir, ".rph", "state.json"), "slash helper project state");
const shellWorkspaceJson = extractFirstJsonObject(shellHelpers.stdout, "installed shell slash helpers");
assertJsonSchema(shellWorkspaceJson, "rph-operator-workspace-v0", "installed shell workspace json");
assertIncludes(shellHelpers.stdout, "Worker pool daemon", "installed shell daemon helper");

console.log("install e2e smoke passed");
console.log(`tmp: ${tmpRoot}`);

function createInstallTopLevelPreload(rootDir, captureFile) {
  const preloadPath = path.join(rootDir, "install-top-level-preload.cjs");
  fs.writeFileSync(preloadPath, [
    "const fs = require('node:fs');",
    `const captureFile = ${JSON.stringify(captureFile)};`,
    "global.fetch = async (url, init = {}) => {",
    "  const target = String(url);",
    "  if (target.endsWith('/models')) {",
    "    return json({ data: [{ id: 'gpt-5.4' }] });",
    "  }",
    "  if (target.endsWith('/responses')) {",
    "    const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};",
    "    fs.appendFileSync(captureFile, JSON.stringify(body) + '\\n');",
    "    return json({ output_text: 'OK', usage: { input_tokens: 4, output_tokens: 1 } });",
    "  }",
    "  return json({ error: { message: `unexpected URL ${target}` } }, 500);",
    "};",
    "function json(data, status = 200) {",
    "  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });",
    "}"
  ].join("\n"));
  return preloadPath;
}

function copyCurrentWorktree(targetDir) {
  const skipTopLevel = new Set([
    ".git",
    ".omx",
    ".rph",
    "coverage",
    "dist",
    "node_modules"
  ]);

  fs.cpSync(repoRoot, targetDir, {
    recursive: true,
    verbatimSymlinks: true,
    filter(source) {
      const relative = path.relative(repoRoot, source);
      if (!relative) {
        return true;
      }
      const parts = relative.split(path.sep);
      if (skipTopLevel.has(parts[0])) {
        return false;
      }
      return !parts.includes(".DS_Store");
    }
  });
}

function createSourceGitRepo(cwd) {
  const init = spawnSync("git", ["init", "-b", "main"], {
    cwd,
    encoding: "utf8"
  });
  if (init.status !== 0) {
    runChecked("git", ["init"], { cwd, label: "git init source repo" });
    runChecked("git", ["checkout", "-B", "main"], { cwd, label: "git branch source repo" });
  }
  runChecked("git", ["config", "user.email", "rph-install-smoke@example.invalid"], {
    cwd,
    label: "git config email"
  });
  runChecked("git", ["config", "user.name", "RPH Install Smoke"], {
    cwd,
    label: "git config name"
  });
  runChecked("git", ["add", "."], { cwd, label: "git add source repo" });
  runChecked("git", ["commit", "-m", "Install e2e source"], {
    cwd,
    label: "git commit source repo"
  });
}

function appendAndCommit(cwd, relativePath, content, message) {
  fs.appendFileSync(path.join(cwd, relativePath), content, "utf8");
  runChecked("git", ["add", relativePath], {
    cwd,
    label: `git add ${relativePath}`
  });
  runChecked("git", ["commit", "-m", message], {
    cwd,
    label: `git commit ${message}`
  });
}

function runChecked(command, args, options) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20
  });
  if (result.status !== 0) {
    fail(`${options.label} failed: ${command} ${args.join(" ")}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result;
}

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    fail(`${label} missing: ${filePath}`);
  }
}

function assertIncludes(text, expected, label) {
  if (!text.includes(expected)) {
    fail(`${label} missing expected content: ${expected}\nactual:\n${text}`);
  }
}

function assertJsonSchema(text, expectedSchema, label) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    fail(`${label} did not produce JSON\nerror: ${error instanceof Error ? error.message : String(error)}\ntext:\n${text}`);
  }
  if (parsed?.schemaVersion !== expectedSchema) {
    fail(`${label} expected schemaVersion=${expectedSchema}, got ${JSON.stringify(parsed?.schemaVersion)}`);
  }
}

function extractFirstJsonObject(text, label) {
  const start = text.indexOf("{");
  if (start === -1) {
    fail(`${label} missing JSON object\nstdout:\n${text}`);
  }
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }
  fail(`${label} has unterminated JSON object\nstdout:\n${text}`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
