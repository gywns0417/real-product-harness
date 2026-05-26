#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliEntry = path.join(repoRoot, "dist", "apps", "cli", "src", "index.js");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-productize-smoke-"));
const idea = "AI 회의록을 액션아이템과 담당자 추적으로 바꾸는 SaaS";

if (!fs.existsSync(cliEntry)) {
  fail(`CLI dist entry not found: ${cliEntry}. Run pnpm run build first.`);
}

const conversational = spawnSync(process.execPath, [cliEntry, "ask", `이 아이디어를 MVP spec과 FE/BE 작업으로 만들어줘: ${idea}`], {
  cwd: tmpRoot,
  encoding: "utf8"
});

if (conversational.status !== 0) {
  fail(`conversational ask failed\nstdout:\n${conversational.stdout}\nstderr:\n${conversational.stderr}`);
}
if (!conversational.stdout.includes("suggested control: /productize")) {
  fail(`conversational ask did not propose /productize\nstdout:\n${conversational.stdout}\nstderr:\n${conversational.stderr}`);
}
if (fs.existsSync(path.join(tmpRoot, ".rph", "golden-path", "latest.md"))) {
  fail("conversational ask generated a golden path without --execute");
}

const result = spawnSync(process.execPath, [cliEntry, "ask", "--execute", `이 아이디어를 MVP spec과 FE/BE 작업으로 만들어줘: ${idea}`], {
  cwd: tmpRoot,
  encoding: "utf8"
});

if (result.status !== 0) {
  fail(`productize command failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
}

const reportPath = path.join(tmpRoot, ".rph", "golden-path", "latest.md");
if (!fs.existsSync(reportPath)) {
  fail(`golden path report missing: ${reportPath}`);
}
const reportJsonPath = path.join(tmpRoot, ".rph", "golden-path", "latest.json");
const report = JSON.parse(fs.readFileSync(reportJsonPath, "utf8"));
if (report.idea !== idea) {
  fail(`product idea was not extracted cleanly. expected "${idea}", got "${report.idea}"`);
}
if (!report.traceability?.confirmedFacts?.some((item) => item.includes(idea))) {
  fail("golden path report JSON missing traceability confirmed fact for the original idea");
}
const reportMarkdown = fs.readFileSync(reportPath, "utf8");
if (!reportMarkdown.includes("## Traceability") || !reportMarkdown.includes("### Open Questions")) {
  fail("golden path markdown missing traceability sections");
}

const generatedRoots = [
  path.join(tmpRoot, ".rph", "documents"),
  path.join(tmpRoot, ".rph", "design"),
  path.join(tmpRoot, ".rph", "prs"),
  path.join(tmpRoot, ".rph", "qa"),
  path.join(tmpRoot, ".rph", "golden-path")
];

const placeholderHits = [];
const routingPhraseHits = [];
for (const root of generatedRoots) {
  for (const file of walk(root)) {
    const text = fs.readFileSync(file, "utf8");
    if (/\bTBD\b/.test(text)) {
      placeholderHits.push(file);
    }
    if (text.includes("이 아이디어를 MVP spec과 FE/BE 작업으로 만들어줘")) {
      routingPhraseHits.push(file);
    }
  }
}

if (placeholderHits.length > 0) {
  fail(`placeholder text found:\n${placeholderHits.map((file) => `- ${file}`).join("\n")}`);
}
if (routingPhraseHits.length > 0) {
  fail(`routing prompt leaked into generated artifacts:\n${routingPhraseHits.map((file) => `- ${file}`).join("\n")}`);
}

console.log("productize smoke passed");
console.log(`tmp: ${tmpRoot}`);
console.log(`report: ${reportPath}`);

function walk(root) {
  if (!fs.existsSync(root)) {
    return [];
  }
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const current = path.join(root, entry.name);
    if (entry.isDirectory()) {
      return walk(current);
    }
    return entry.isFile() ? [current] : [];
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
