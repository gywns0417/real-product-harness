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

fs.mkdirSync(homeDir, { recursive: true });
fs.mkdirSync(projectDir, { recursive: true });
fs.mkdirSync(slashProjectDir, { recursive: true });
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
assertIncludes(init, "function /pm() { command rph /pm \"$@\"; }", "init.sh");
assertIncludes(init, "function /agent() { command rph /agent \"$@\"; }", "init.sh");
assertIncludes(init, "function /setup() { command rph /setup \"$@\"; }", "init.sh");
assertIncludes(init, "function /workspace() { command rph /workspace \"$@\"; }", "init.sh");
assertIncludes(init, 'if [ "${RPH_ENABLE_SLASH_COMMANDS:-1}" = "1" ]; then', "init.sh");
assertIncludes(completion, "#compdef rph", "completion.zsh");
assertIncludes(completion, "help version update shell runtime init status workspace next pause resume cancel setup settings", "completion.zsh");
assertIncludes(completion, "setup_cmds=(auto repair detect apply check ai mcp custom)", "completion.zsh");
assertIncludes(completion, "doctor_cmds=(status install shell)", "completion.zsh");
assertIncludes(completion, "agent_cmds=(status roles catalog discover search import install use activate session journal replay handoffs actions action-approvals intents confirm-intent dismiss-intent lanes run continue recover pool worker claim heartbeat ack complete dead-letter approve-action reject-action clear reset)", "completion.zsh");
assertIncludes(profile, "# >>> rph init >>>", "shell profile");
assertIncludes(profile, `source "${initPath}"`, "shell profile");

const version = runChecked(wrapperPath, ["version"], {
  cwd: projectDir,
  env,
  label: "installed rph version"
});
assertIncludes(version.stdout, packageJson.version, "installed rph version");

const pmStart = runChecked(wrapperPath, ["/pm", "start", "--project-name", "Install E2E Product"], {
  cwd: projectDir,
  env,
  label: "installed slash pm start"
});
assertIncludes(pmStart.stdout, "RPH project initialized: Install E2E Product", "installed slash pm start");
assertIncludes(pmStart.stdout, "PM 워크플로우 시작", "installed slash pm start");
assertFile(path.join(projectDir, ".rph", "state.json"), "project state");

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

const shellHelpers = runChecked("zsh", ["-lc", `source "${initPath}"; cd "${slashProjectDir}"; /pm start --project-name "Shell Slash Product"; /workspace --json; /status`], {
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

console.log("install e2e smoke passed");
console.log(`tmp: ${tmpRoot}`);

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
