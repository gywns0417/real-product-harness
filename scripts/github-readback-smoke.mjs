#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliEntry = path.join(repoRoot, "dist", "apps", "cli", "src", "index.js");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-github-readback-"));
const binDir = path.join(tmpRoot, "bin");
const fakeGhState = path.join(tmpRoot, "fake-gh-state.json");
const preload = path.join(tmpRoot, "fetch-preload.cjs");

if (!fs.existsSync(cliEntry)) {
  fail(`CLI dist entry not found: ${cliEntry}. Run pnpm run build first.`);
}

fs.mkdirSync(binDir, { recursive: true });
fs.writeFileSync(fakeGhState, JSON.stringify({
  repoCreated: false,
  labels: [],
  issues: [],
  prs: [],
  nextIssueNumber: 1,
  nextPrNumber: 1
}, null, 2));
const fakeGh = path.join(binDir, "gh");
fs.writeFileSync(fakeGh, [
  "#!/usr/bin/env node",
  "const fs = require('node:fs');",
  `const statePath = ${JSON.stringify(fakeGhState)};`,
  "const args = process.argv.slice(2);",
  "const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));",
  "function save() { fs.writeFileSync(statePath, JSON.stringify(state, null, 2)); }",
  "function argAfter(name) { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; }",
  "function allFlagValues(name) { const values = []; for (let index = 0; index < args.length; index += 1) { if (args[index] === name && args[index + 1]) values.push(args[index + 1]); } return values; }",
  "if (args[0] === '--version') { console.log('gh version 2.0.0'); process.exit(0); }",
  "if (args[0] === 'auth' && args[1] === 'status') { if (!process.env.GH_TOKEN) { console.error('GH_TOKEN missing'); process.exit(1); } process.exit(0); }",
  "if (args[0] === 'auth' && args[1] === 'token') { console.log(process.env.GH_TOKEN || process.env.GITHUB_TOKEN || 'test-github-token'); process.exit(0); }",
  "if (args[0] === 'repo' && args[1] === 'view') {",
  "  if (!state.repoCreated) { console.error('not found'); process.exit(1); }",
  "  const repo = args[2] || 'gywns0417/real-product-harness-smoke';",
  "  console.log(JSON.stringify({ nameWithOwner: repo, url: `https://github.com/${repo}`, visibility: 'PUBLIC', isPrivate: false, defaultBranchRef: { name: 'main' }, viewerPermission: 'ADMIN' }));",
  "  process.exit(0);",
  "}",
  "if (args[0] === 'repo' && args[1] === 'create') {",
  "  const repo = args[2] || 'gywns0417/real-product-harness-smoke';",
  "  state.repoCreated = true;",
  "  state.repo = repo;",
  "  save();",
  "  console.log(`https://github.com/${repo}`);",
  "  process.exit(0);",
  "}",
  "if (args[0] === 'label' && args[1] === 'create') {",
  "  const name = args[2];",
  "  const color = argAfter('--color');",
  "  const description = argAfter('--description');",
  "  const existing = state.labels.find((label) => label.name === name);",
  "  if (existing) { existing.color = color; existing.description = description; }",
  "  else { state.labels.push({ name, color, description }); }",
  "  save();",
  "  process.exit(0);",
  "}",
  "if (args[0] === 'label' && args[1] === 'list') {",
  "  console.log(JSON.stringify(state.labels));",
  "  process.exit(0);",
  "}",
  "if (args[0] === 'issue' && args[1] === 'create') {",
  "  const repo = argAfter('--repo') || state.repo || 'gywns0417/real-product-harness-smoke';",
  "  const number = state.nextIssueNumber++;",
  "  const title = argAfter('--title') || 'Untitled issue';",
  "  const labels = allFlagValues('--label').flatMap((value) => value.split(',')).filter(Boolean).map((name) => ({ name }));",
  "  const url = `https://github.com/${repo}/issues/${number}`;",
  "  state.issues.push({ number, title, url, state: 'OPEN', labels });",
  "  save();",
  "  console.log(url);",
  "  process.exit(0);",
  "}",
  "if (args[0] === 'issue' && args[1] === 'view') {",
  "  const number = Number(args[2]);",
  "  const issue = state.issues.find((item) => item.number === number);",
  "  if (!issue) { console.error('issue not found'); process.exit(1); }",
  "  console.log(JSON.stringify(issue));",
  "  process.exit(0);",
  "}",
  "if (args[0] === 'pr' && args[1] === 'create') {",
  "  const repo = argAfter('--repo') || state.repo || 'gywns0417/real-product-harness-smoke';",
  "  const number = state.nextPrNumber++;",
  "  const title = argAfter('--title') || 'Untitled PR';",
  "  const baseRefName = argAfter('--base') || 'dev';",
  "  const headRefName = argAfter('--head') || 'feature/smoke';",
  "  const url = `https://github.com/${repo}/pull/${number}`;",
  "  state.prs.push({ number, title, url, state: 'OPEN', headRefName, baseRefName, isDraft: args.includes('--draft') });",
  "  save();",
  "  console.log(url);",
  "  process.exit(0);",
  "}",
  "if (args[0] === 'pr' && args[1] === 'view') {",
  "  const number = Number(args[2]);",
  "  const pr = state.prs.find((item) => item.number === number);",
  "  if (!pr) { console.error('pr not found'); process.exit(1); }",
  "  console.log(JSON.stringify(pr));",
  "  process.exit(0);",
  "}",
  "console.error(`unexpected gh args: ${args.join(' ')}`);",
  "process.exit(1);"
].join("\n"), { mode: 0o755 });

const fakeGit = path.join(binDir, "git");
fs.writeFileSync(fakeGit, [
  "#!/usr/bin/env node",
  "const fs = require('node:fs');",
  `const statePath = ${JSON.stringify(fakeGhState)};`,
  "const args = process.argv.slice(2);",
  "const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));",
  "function save() { fs.writeFileSync(statePath, JSON.stringify(state, null, 2)); }",
  "if (args[0] === 'remote' && args[1] === 'get-url' && args[2] === 'origin') {",
  "  if (!state.origin) { process.exit(1); }",
  "  console.log(state.origin);",
  "  process.exit(0);",
  "}",
  "if (args[0] === 'remote' && args[1] === 'add' && args[2] === 'origin') {",
  "  state.origin = args[3];",
  "  save();",
  "  process.exit(0);",
  "}",
  "if (args[0] === 'rev-parse' && args[1] === 'HEAD') {",
  "  console.log('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');",
  "  process.exit(0);",
  "}",
  "if (args[0] === 'ls-remote' && args[1] === '--heads') {",
  "  const branch = args[3] || 'main';",
  "  console.log(`aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\\trefs/heads/${branch}`);",
  "  process.exit(0);",
  "}",
  "console.error(`unexpected git args: ${args.join(' ')}`);",
  "process.exit(1);"
].join("\n"), { mode: 0o755 });

fs.writeFileSync(preload, [
  "global.fetch = async (url, init = {}) => {",
  "  const target = String(url);",
  "  if (!target.includes('example.invalid')) {",
  "    return new Response(JSON.stringify({ error: { message: `unexpected fetch ${target}` } }), { status: 500, headers: { 'content-type': 'application/json' } });",
  "  }",
  "  const source = String(init.body || '');",
  "  const command = source.includes('GitHub PR을 live로')",
  "    ? '/github create-pr --issue 1 --live'",
  "    : source.includes('GitHub 이슈를 live로')",
  "      ? '/github create-issue --agent FE --title \"Smoke live issue\" --live'",
  "      : '/github setup-labels';",
  "  const text = JSON.stringify({ action: { type: 'command', command, safeToAutoRun: false, reason: 'approval-gated GitHub write', message: 'GitHub write requires approval.' } });",
  "  return new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text }] }], usage: { input_tokens: 8, output_tokens: 4 } }), { status: 200, headers: { 'content-type': 'application/json' } });",
  "};"
].join("\n"));

const env = {
  ...process.env,
  PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
  GITHUB_TOKEN: "test-github-token",
  GITHUB_OWNER: "gywns0417",
  GITHUB_REPO: "real-product-harness-smoke",
  NO_COLOR: "1"
};

run(["init", "--yes", "--project-name", "GitHub Readback Smoke"], "init");
const statePath = path.join(tmpRoot, ".rph", "state.json");
const harnessState = JSON.parse(fs.readFileSync(statePath, "utf8"));
harnessState.currentStage = "IMPLEMENTATION";
fs.writeFileSync(statePath, JSON.stringify(harnessState, null, 2));

const created = run(["github", "create-repo", "--public"], "create repo");
assertIncludes(created.stdout, "GitHub repo 생성 완료", "create repo");
assertIncludes(created.stdout, "readback: gywns0417/real-product-harness-smoke", "create repo");
const repoProofPath = path.join(tmpRoot, ".rph", "github", "live-repo-readback.json");
assertFile(repoProofPath, "repo readback");
const repoProof = JSON.parse(fs.readFileSync(repoProofPath, "utf8"));
if (repoProof.nameWithOwner !== "gywns0417/real-product-harness-smoke" || repoProof.viewerPermission !== "ADMIN") {
  fail(`unexpected repo readback proof: ${JSON.stringify(repoProof)}`);
}
if (repoProof.pushReadbackStatus !== "passed" || repoProof.localHead !== repoProof.remoteHead) {
  fail(`expected pushed repo readback proof, got ${JSON.stringify(repoProof)}`);
}
assertNotIncludes(fs.readFileSync(repoProofPath, "utf8"), "test-github-token", "repo readback");

fs.writeFileSync(path.join(tmpRoot, ".env"), [
  "OPENAI_API_KEY=test-openai",
  "OPENAI_BASE_URL=https://example.invalid/v1",
  "GITHUB_TOKEN=test-github-token",
  "GITHUB_OWNER=gywns0417",
  "GITHUB_REPO=real-product-harness-smoke"
].join("\n"));

const proposed = run(["ask", "--execute", "GitHub labels를 live로 세팅해줘"], "proposal", true);
assertIncludes(proposed.stdout, "external action approval required", "proposal");
assertNotIncludes(proposed.stdout, "GitHub label 설정 파일 생성", "proposal");
const approvalsPath = path.join(tmpRoot, ".rph", "runtime", "action-approvals.json");
const approvals = JSON.parse(fs.readFileSync(approvalsPath, "utf8"));
const action = approvals[0];
if (action.status !== "pending" || action.target !== "github" || action.action !== "labels.apply") {
  fail(`unexpected pending GitHub action: ${JSON.stringify(action)}`);
}

const approved = run(["agent", "approve-action", action.id, "--by", "smoke"], "approve", true);
assertIncludes(approved.stdout, `external action completed: ${action.id}`, "approve");
assertIncludes(approved.stdout, "readback: gywns0417/real-product-harness-smoke labels=", "approve");
const labelsProofPath = path.join(tmpRoot, ".rph", "github", "live-labels-readback.json");
assertFile(labelsProofPath, "labels readback");
const labelsProofText = fs.readFileSync(labelsProofPath, "utf8");
assertNotIncludes(labelsProofText, "test-github-token", "labels readback");
const labelsProof = JSON.parse(labelsProofText);
if (!labelsProof.verified || labelsProof.observed.length < 8) {
  fail(`unexpected label readback proof: ${JSON.stringify(labelsProof)}`);
}
const completed = JSON.parse(fs.readFileSync(approvalsPath, "utf8"))[0];
if (completed.status !== "completed" || completed.readbackStatus !== "passed" || !completed.readbackArtifactPath) {
  fail(`expected completed action with readback proof, got ${JSON.stringify(completed)}`);
}

const proposedIssue = run(["ask", "--execute", "GitHub 이슈를 live로 만들어줘"], "issue proposal", true);
assertIncludes(proposedIssue.stdout, "external action approval required", "issue proposal");
const issueActions = JSON.parse(fs.readFileSync(approvalsPath, "utf8"));
const issueAction = issueActions.find((item) => item.action === "issue.create" && item.status === "pending");
if (!issueAction || issueAction.approvedTargetId !== "gywns0417/real-product-harness-smoke") {
  fail(`unexpected pending GitHub issue action: ${JSON.stringify(issueActions)}`);
}
if (issueAction.approvedSnapshot?.kind !== "github.issue" || issueAction.approvedSnapshot.version !== "github-local-artifact-v1") {
  fail(`expected issue approval snapshot, got ${JSON.stringify(issueAction)}`);
}
if (!issueAction.approvedSnapshot.localIssueNumber || issueAction.approvedSnapshot.localIssueNumber !== Number(issueAction.approvedParameters?.localIssueNumber)) {
  fail(`expected issue approval to bind a local issue number, got ${JSON.stringify(issueAction)}`);
}
if (issueAction.approvedParameters?.snapshotFingerprint !== issueAction.approvedSnapshot.fingerprint) {
  fail(`expected issue approval parameter fingerprint to match snapshot, got ${JSON.stringify(issueAction)}`);
}
const localIssueNumber = issueAction.approvedSnapshot.localIssueNumber;
const approvedIssue = run(["agent", "approve-action", issueAction.id, "--by", "smoke"], "approve issue", true);
assertIncludes(approvedIssue.stdout, `external action completed: ${issueAction.id}`, "approve issue");
assertIncludes(approvedIssue.stdout, "readback: gywns0417/real-product-harness-smoke#1", "approve issue");
const issueProofPath = path.join(tmpRoot, ".rph", "github", `live-issue-${localIssueNumber}-readback.json`);
assertFile(issueProofPath, "issue readback");
assertFile(path.join(tmpRoot, ".rph", "github", "live-issue-latest-readback.json"), "latest issue readback pointer");
const issueProofText = fs.readFileSync(issueProofPath, "utf8");
assertNotIncludes(issueProofText, "test-github-token", "issue readback");
const issueProof = JSON.parse(issueProofText);
if (!issueProof.verified || issueProof.githubIssueNumber !== 1 || issueProof.title !== "Smoke live issue") {
  fail(`unexpected issue readback proof: ${JSON.stringify(issueProof)}`);
}
if (issueProof.localIssueNumber !== localIssueNumber || issueProof.actionApprovalId !== issueAction.id || issueProof.approvedFingerprint !== issueAction.fingerprint) {
  fail(`issue readback proof is not bound to the approved action: ${JSON.stringify(issueProof)}`);
}
const completedIssue = JSON.parse(fs.readFileSync(approvalsPath, "utf8")).find((item) => item.id === issueAction.id);
if (
  completedIssue?.status !== "completed"
  || completedIssue.readbackStatus !== "passed"
  || !samePath(completedIssue.readbackArtifactPath, issueProofPath)
  || completedIssue.readbackActionApprovalId !== issueAction.id
  || completedIssue.readbackApprovedFingerprint !== issueAction.fingerprint
) {
  fail(`expected completed issue action to point at the per-issue proof, got ${JSON.stringify(completedIssue)}`);
}

const proposedPr = run(["ask", "--execute", "GitHub PR을 live로 만들어줘"], "PR proposal", true);
assertIncludes(proposedPr.stdout, "external action approval required", "PR proposal");
const prActions = JSON.parse(fs.readFileSync(approvalsPath, "utf8"));
const prAction = prActions.find((item) => item.action === "pr.create" && item.status === "pending");
if (!prAction || prAction.approvedTargetId !== "gywns0417/real-product-harness-smoke") {
  fail(`unexpected pending GitHub PR action: ${JSON.stringify(prActions)}`);
}
if (prAction.approvedSnapshot?.kind !== "github.pr" || prAction.approvedSnapshot.version !== "github-local-artifact-v1") {
  fail(`expected PR approval snapshot, got ${JSON.stringify(prAction)}`);
}
if (!prAction.approvedSnapshot.localPrNumber || prAction.approvedSnapshot.localPrNumber !== Number(prAction.approvedParameters?.localPrNumber)) {
  fail(`expected PR approval to bind a local PR number, got ${JSON.stringify(prAction)}`);
}
if (prAction.approvedSnapshot.localIssueNumber !== localIssueNumber || Number(prAction.approvedParameters?.localIssueNumber) !== localIssueNumber) {
  fail(`expected PR approval to bind issue #${localIssueNumber}, got ${JSON.stringify(prAction)}`);
}
if (prAction.approvedParameters?.snapshotFingerprint !== prAction.approvedSnapshot.fingerprint) {
  fail(`expected PR approval parameter fingerprint to match snapshot, got ${JSON.stringify(prAction)}`);
}
const localPrNumber = prAction.approvedSnapshot.localPrNumber;
const approvedPr = run(["agent", "approve-action", prAction.id, "--by", "smoke"], "approve PR", true);
assertIncludes(approvedPr.stdout, `external action completed: ${prAction.id}`, "approve PR");
assertIncludes(approvedPr.stdout, "readback: gywns0417/real-product-harness-smoke#1", "approve PR");
const prProofPath = path.join(tmpRoot, ".rph", "github", `live-pr-${localPrNumber}-readback.json`);
assertFile(prProofPath, "PR readback");
assertFile(path.join(tmpRoot, ".rph", "github", "live-pr-latest-readback.json"), "latest PR readback pointer");
const prProofText = fs.readFileSync(prProofPath, "utf8");
assertNotIncludes(prProofText, "test-github-token", "PR readback");
const prProof = JSON.parse(prProofText);
if (!prProof.verified || prProof.githubPrNumber !== 1 || prProof.isDraft !== true) {
  fail(`unexpected PR readback proof: ${JSON.stringify(prProof)}`);
}
if (prProof.localPrNumber !== localPrNumber || prProof.localIssueNumber !== localIssueNumber || prProof.actionApprovalId !== prAction.id || prProof.approvedFingerprint !== prAction.fingerprint) {
  fail(`PR readback proof is not bound to the approved action: ${JSON.stringify(prProof)}`);
}
const completedPr = JSON.parse(fs.readFileSync(approvalsPath, "utf8")).find((item) => item.id === prAction.id);
if (
  completedPr?.status !== "completed"
  || completedPr.readbackStatus !== "passed"
  || !samePath(completedPr.readbackArtifactPath, prProofPath)
  || completedPr.readbackActionApprovalId !== prAction.id
  || completedPr.readbackApprovedFingerprint !== prAction.fingerprint
) {
  fail(`expected completed PR action to point at the per-PR proof, got ${JSON.stringify(completedPr)}`);
}

console.log("github readback smoke passed");
console.log(`tmp: ${tmpRoot}`);

function run(args, label, withPreload = false) {
  const result = spawnSync(process.execPath, [
    ...(withPreload ? ["--require", preload] : []),
    cliEntry,
    ...args
  ], {
    cwd: tmpRoot,
    env,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    fail(`${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
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

function assertNotIncludes(text, unexpected, label) {
  if (text.includes(unexpected)) {
    fail(`${label} included unexpected content: ${unexpected}\nactual:\n${text}`);
  }
}

function samePath(left, right) {
  if (typeof left !== "string" || typeof right !== "string") {
    return false;
  }
  return fs.realpathSync(left) === fs.realpathSync(right);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
