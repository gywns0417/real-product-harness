#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliEntry = path.join(repoRoot, "dist", "apps", "cli", "src", "index.js");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-hermes-e2e-"));
const env = {
  ...process.env,
  NO_COLOR: "1",
  OPENAI_API_KEY: "",
  ANTHROPIC_API_KEY: "",
  GEMINI_API_KEY: "",
  LOCAL_AI_BASE_URL: "",
  NOTION_TOKEN: "",
  GITHUB_TOKEN: "",
  FIGMA_TOKEN: "",
  STITCH_API_KEY: ""
};

if (!fs.existsSync(cliEntry)) {
  fail(`CLI dist entry not found: ${cliEntry}. Run pnpm run build first.`);
}

const productize = run([
  "ask",
  "--execute",
  "이 아이디어를 MVP spec과 FE/BE 작업으로 만들어줘: $100 결제 가치 검증 SaaS"
]);
assertIncludes(productize.stdout, "RPH project initialized", "productize bootstrap");
assertIncludes(productize.stdout, "Productize golden path complete", "productize bootstrap");
assertFile(path.join(tmpRoot, ".rph", "golden-path", "latest.json"), "golden path json");

const approve = run(["docs", "approve", "product-definition", "--by", "smoke"]);
assertIncludes(approve.stdout, "[승인 완료] product-definition", "product definition approval");

const runAgent = run(["agent", "run", "--steps", "1"]);
assertIncludes(runAgent.stdout, "orchestration loop: max_steps=1", "agent run");
assertIncludes(runAgent.stdout, "orchestrator step 1:", "agent run");

const state = JSON.parse(fs.readFileSync(path.join(tmpRoot, ".rph", "state.json"), "utf8"));
if (state.currentStage === "PM_PRODUCT_DEFINITION_APPROVED" || state.currentStage === "SETUP") {
  fail(`expected agent run to advance beyond first approval, got ${state.currentStage}`);
}

console.log("hermes e2e smoke passed");
console.log(`tmp: ${tmpRoot}`);

function run(args) {
  const result = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd: tmpRoot,
    env,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    fail(`command failed: ${args.join(" ")}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
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
    fail(`${label} missing expected output: ${expected}\nactual:\n${text}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
