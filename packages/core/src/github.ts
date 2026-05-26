import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  githubBranchPlanFile,
  githubDir,
  githubIssueLatestReadbackFile,
  githubIssueReadbackFile,
  githubLabelsReadbackFile,
  githubPullRequestLatestReadbackFile,
  githubPullRequestReadbackFile,
  githubRepoReadbackFile,
  issueFile,
  pullRequestNumberFile
} from "./paths";
import { attachRuntimeActionReadbackBinding, RuntimeActionReadbackBinding } from "./agent-action-approvals";
import { ensureDir, writeJson, writeText } from "./fs";
import { GitHubLabel, PullRequestRecord, RuntimeActionApprovedSnapshot, WorkIssue } from "./types";

export const DEFAULT_GITHUB_LABELS: GitHubLabel[] = [
  { name: "feat", color: "0E8A16", description: "New feature implementation" },
  { name: "refactor", color: "5319E7", description: "Code restructuring without behavior change" },
  { name: "chore", color: "C5DEF5", description: "Maintenance or tooling work" },
  { name: "test", color: "FBCA04", description: "Test additions or updates" },
  { name: "fix", color: "D73A4A", description: "Bug fix" },
  { name: "hotfix", color: "B60205", description: "Urgent production fix" },
  { name: "docs", color: "0075CA", description: "Documentation update" },
  { name: "release", color: "7057FF", description: "Release preparation" }
];

const LABEL_ALIASES: Record<string, string> = {
  refator: "refactor",
  refractor: "refactor",
  feature: "feat",
  bug: "fix"
};

export function normalizeLabel(label: string): string {
  const normalized = label.trim().toLowerCase();
  return LABEL_ALIASES[normalized] ?? normalized;
}

export function createBranchName(label: string, issueNumber: number, slug: string): string {
  const normalized = normalizeLabel(label);
  const safeSlug = slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${normalized}/${String(issueNumber).padStart(2, "0")}-${safeSlug || "task"}`;
}

export function setupGitHubLabels(projectRoot: string): { labels: GitHubLabel[]; commands: string[] } {
  ensureDir(githubDir(projectRoot));
  writeJson(path.join(githubDir(projectRoot), "labels.json"), DEFAULT_GITHUB_LABELS);
  const commands = DEFAULT_GITHUB_LABELS.map(
    (label) =>
      `gh label create ${label.name} --color ${label.color} --description "${label.description}" --force`
  );
  return { labels: DEFAULT_GITHUB_LABELS, commands };
}

export interface GitHubApplyResult {
  label: string;
  ok: boolean;
  message: string;
}

export interface GitHubRepoResult {
  ok: boolean;
  existed: boolean;
  url: string | null;
  message: string;
  readback?: GitHubRepoReadbackProof;
}

export interface GitHubRepoReadbackProof extends RuntimeActionReadbackBinding {
  owner: string;
  repo: string;
  nameWithOwner: string;
  url: string | null;
  visibility?: string;
  isPrivate?: boolean;
  defaultBranch?: string | null;
  viewerPermission?: string;
  existed: boolean;
  pushReadbackStatus?: "not_required" | "passed" | "failed";
  localHead?: string | null;
  remoteHead?: string | null;
  remoteRef?: string | null;
  pushReadbackReason?: string;
  verifiedAt: string;
}

export interface GitHubLabelsReadbackProof extends RuntimeActionReadbackBinding {
  owner: string;
  repo: string;
  expected: GitHubLabel[];
  observed: Array<{ name: string; color?: string; description?: string }>;
  missing: string[];
  mismatched: Array<{ name: string; expectedColor: string; observedColor?: string }>;
  verified: boolean;
  verifiedAt: string;
}

export interface GitHubIssueReadbackProof extends RuntimeActionReadbackBinding {
  owner: string;
  repo: string;
  localIssueNumber: number;
  githubIssueNumber: number | null;
  title: string;
  url: string | null;
  state?: string;
  labels: Array<{ name: string }>;
  expectedLabel?: string;
  verified: boolean;
  verifiedAt: string;
  reason?: string;
}

export interface GitHubPullRequestReadbackProof extends RuntimeActionReadbackBinding {
  owner: string;
  repo: string;
  localPrNumber: number;
  localIssueNumber: number;
  githubPrNumber: number | null;
  title: string;
  url: string | null;
  state?: string;
  headRefName?: string;
  baseRefName?: string;
  expectedHeadRefName: string;
  expectedBaseRefName: string;
  isDraft?: boolean;
  verified: boolean;
  verifiedAt: string;
  reason?: string;
}

export interface GitHubApplyWithReadbackResult {
  applied: GitHubApplyResult[];
  readback: GitHubLabelsReadbackProof;
}

export interface GitHubIssueWithReadbackResult {
  ok: boolean;
  message: string;
  readback: GitHubIssueReadbackProof;
}

export interface GitHubPullRequestWithReadbackResult {
  ok: boolean;
  message: string;
  readback: GitHubPullRequestReadbackProof;
}

export interface GitHubCliWriteReadiness {
  ok: boolean;
  binary: string;
  repo: string;
  message: string;
  viewerPermission?: string;
  nameWithOwner?: string;
}

const GITHUB_WRITE_PERMISSIONS = new Set(["ADMIN", "MAINTAIN", "WRITE"]);

export function captureGitHubIssueApprovalSnapshot(
  projectRoot: string,
  owner: string,
  repo: string,
  issue: WorkIssue
): RuntimeActionApprovedSnapshot {
  const bodyFile = path.join(githubDir(projectRoot), `issue-${issue.issueNumber}-body.md`);
  writeText(bodyFile, renderGitHubIssueBody(issue));
  return currentGitHubIssueApprovalSnapshot(projectRoot, owner, repo, issue);
}

export function currentGitHubIssueApprovalSnapshot(
  projectRoot: string,
  owner: string,
  repo: string,
  issue: WorkIssue
): RuntimeActionApprovedSnapshot {
  const bodyFile = path.join(githubDir(projectRoot), `issue-${issue.issueNumber}-body.md`);
  const body = fs.existsSync(bodyFile) ? fs.readFileSync(bodyFile, "utf8") : "__missing_body_file__";
  const canonical = {
    kind: "github.issue",
    version: "github-local-artifact-v1",
    owner,
    repo,
    localIssueNumber: issue.issueNumber,
    label: issue.label,
    title: issue.title,
    description: issue.description,
    acceptanceCriteria: issue.acceptanceCriteria,
    relatedDocs: issue.relatedDocs,
    relatedScreens: issue.relatedScreens,
    relatedApis: issue.relatedApis,
    branchName: issue.branchName,
    assigneeAgent: issue.assigneeAgent,
    testRequirement: issue.testRequirement,
    qaChecklist: issue.qaChecklist,
    renderedBodySha256: sha256(renderGitHubIssueBody(issue)),
    bodyFileSha256: sha256(body)
  };
  return {
    kind: "github.issue",
    version: "github-local-artifact-v1",
    fingerprint: sha256(stableSnapshotJson(canonical)).slice(0, 24),
    snapshotPath: relativeProjectPath(projectRoot, issueFile(projectRoot, issue.issueNumber)),
    bodyPath: relativeProjectPath(projectRoot, bodyFile),
    localIssueNumber: issue.issueNumber,
    capturedAt: new Date().toISOString(),
    summary: `${owner}/${repo} issue local #${issue.issueNumber}: ${issue.title}`
  };
}

export function captureGitHubPullRequestApprovalSnapshot(
  projectRoot: string,
  owner: string,
  repo: string,
  pullRequest: PullRequestRecord,
  issue: WorkIssue
): RuntimeActionApprovedSnapshot {
  const bodyFile = path.join(projectRoot, ".rph", "prs", `issue-${pullRequest.issueNumber}.md`);
  if (!fs.existsSync(bodyFile)) {
    writeText(bodyFile, renderGitHubPullRequestBody(issue));
  }
  return currentGitHubPullRequestApprovalSnapshot(projectRoot, owner, repo, pullRequest, issue);
}

export function currentGitHubPullRequestApprovalSnapshot(
  projectRoot: string,
  owner: string,
  repo: string,
  pullRequest: PullRequestRecord,
  issue: WorkIssue
): RuntimeActionApprovedSnapshot {
  const bodyFile = path.join(projectRoot, ".rph", "prs", `issue-${pullRequest.issueNumber}.md`);
  const body = fs.existsSync(bodyFile) ? fs.readFileSync(bodyFile, "utf8") : "__missing_body_file__";
  const canonical = {
    kind: "github.pr",
    version: "github-local-artifact-v1",
    owner,
    repo,
    localPrNumber: pullRequest.prNumber,
    localIssueNumber: pullRequest.issueNumber,
    sourceBranch: pullRequest.sourceBranch,
    targetBranch: pullRequest.targetBranch,
    title: issue.title,
    issueLabel: issue.label,
    issueDescription: issue.description,
    issueAcceptanceCriteria: issue.acceptanceCriteria,
    issueBranchName: issue.branchName,
    issueAssigneeAgent: issue.assigneeAgent,
    issueTestRequirement: issue.testRequirement,
    dryRunCommand: pullRequest.dryRunCommand,
    bodyFileSha256: sha256(body)
  };
  return {
    kind: "github.pr",
    version: "github-local-artifact-v1",
    fingerprint: sha256(stableSnapshotJson(canonical)).slice(0, 24),
    snapshotPath: relativeProjectPath(projectRoot, pullRequestNumberFile(projectRoot, pullRequest.prNumber)),
    bodyPath: relativeProjectPath(projectRoot, bodyFile),
    localIssueNumber: pullRequest.issueNumber,
    localPrNumber: pullRequest.prNumber,
    capturedAt: new Date().toISOString(),
    summary: `${owner}/${repo} PR local #${pullRequest.prNumber} for issue #${pullRequest.issueNumber}: ${issue.title}`
  };
}

export function githubCliBinary(env: NodeJS.ProcessEnv = process.env): string {
  return env.RPH_GH_BIN?.trim() || "gh";
}

export function githubCliAuthToken(cwd = process.cwd(), env: NodeJS.ProcessEnv = process.env): string {
  const result = spawnSync(githubCliBinary(env), ["auth", "token"], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (result.status !== 0) {
    return "";
  }
  return result.stdout.trim();
}

export function githubRestToken(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): string {
  if (env.GITHUB_TOKEN) {
    return env.GITHUB_TOKEN;
  }
  if (env.GH_TOKEN) {
    return env.GH_TOKEN;
  }
  if (env.GITHUB_TOKEN_SOURCE === "gh-cli") {
    return githubCliAuthToken(cwd, env);
  }
  return "";
}

export function githubCliEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const merged: NodeJS.ProcessEnv = { ...process.env, ...env };
  if (merged.GITHUB_TOKEN) {
    merged.GH_TOKEN = merged.GITHUB_TOKEN;
  } else if (!merged.GH_TOKEN) {
    const token = githubRestToken(merged);
    if (token) {
      merged.GH_TOKEN = token;
    }
  }
  return merged;
}

export function checkGitHubCliWriteReadiness(
  owner: string,
  repo: string,
  env: NodeJS.ProcessEnv = process.env
): GitHubCliWriteReadiness {
  const binary = githubCliBinary(env);
  const repoName = `${owner}/${repo}`;
  const childEnv = githubCliEnv(env);
  const version = spawnSync(binary, ["--version"], {
    encoding: "utf8",
    env: childEnv
  });
  if (version.status !== 0) {
    return {
      ok: false,
      binary,
      repo: repoName,
      message: `gh CLI unavailable: ${commandFailureMessage(version, `${binary} --version failed`)}`
    };
  }

  const auth = spawnSync(binary, ["auth", "status", "--hostname", "github.com"], {
    encoding: "utf8",
    env: childEnv
  });
  if (auth.status !== 0) {
    return {
      ok: false,
      binary,
      repo: repoName,
      message: `gh auth status failed: ${commandFailureMessage(auth, "gh auth status failed")}`
    };
  }

  const view = spawnSync(binary, [
    "repo",
    "view",
    repoName,
    "--json",
    "nameWithOwner,viewerPermission"
  ], {
    encoding: "utf8",
    env: childEnv
  });
  if (view.status !== 0) {
    return {
      ok: false,
      binary,
      repo: repoName,
      message: `gh repo view failed: ${commandFailureMessage(view, "gh repo view failed")}`
    };
  }
  try {
    const parsed = JSON.parse(view.stdout) as { nameWithOwner?: string; viewerPermission?: string };
    const viewerPermission = (parsed.viewerPermission ?? "").toUpperCase();
    if (!GITHUB_WRITE_PERMISSIONS.has(viewerPermission)) {
      return {
        ok: false,
        binary,
        repo: repoName,
        nameWithOwner: parsed.nameWithOwner,
        viewerPermission: parsed.viewerPermission,
        message: `gh repo permission ${viewerPermission || "unknown"} is not write-capable`
      };
    }
    return {
      ok: true,
      binary,
      repo: repoName,
      nameWithOwner: parsed.nameWithOwner ?? repoName,
      viewerPermission,
      message: `gh write channel verified for ${parsed.nameWithOwner ?? repoName} (${viewerPermission})`
    };
  } catch {
    return {
      ok: false,
      binary,
      repo: repoName,
      message: "gh repo view returned invalid JSON"
    };
  }
}

export function applyGitHubLabels(owner: string, repo: string, labels: GitHubLabel[] = DEFAULT_GITHUB_LABELS): GitHubApplyResult[] {
  const repoName = `${owner}/${repo}`;
  return labels.map((label) => {
    const result = spawnSync(
      githubCliBinary(),
      [
        "label",
        "create",
        label.name,
        "--repo",
        repoName,
        "--color",
        label.color,
        "--description",
        label.description,
        "--force"
      ],
      { encoding: "utf8", env: githubCliEnv() }
    );
    return {
      label: label.name,
      ok: result.status === 0,
      message: result.status === 0 ? "applied" : commandFailureMessage(result, "unknown error")
    };
  });
}

export function applyGitHubLabelsWithReadback(
  projectRoot: string,
  owner: string,
  repo: string,
  labels: GitHubLabel[] = DEFAULT_GITHUB_LABELS
): GitHubApplyWithReadbackResult {
  const applied = applyGitHubLabels(owner, repo, labels);
  const failed = applied.filter((item) => !item.ok);
  if (failed.length > 0) {
    return {
      applied,
      readback: writeGitHubLabelsReadback(projectRoot, owner, repo, labels, [], labels.map((label) => label.name), [])
    };
  }
  const readback = readGitHubLabels(projectRoot, owner, repo, labels);
  return { applied, readback };
}

export function createGitHubIssueWithReadback(
  projectRoot: string,
  owner: string,
  repo: string,
  issue: WorkIssue
): GitHubIssueWithReadbackResult {
  const repoName = `${owner}/${repo}`;
  const bodyFile = path.join(githubDir(projectRoot), `issue-${issue.issueNumber}-body.md`);
  ensureDir(githubDir(projectRoot));
  writeText(bodyFile, renderGitHubIssueBody(issue));
  const created = spawnSync(githubCliBinary(), [
    "issue",
    "create",
    "--repo",
    repoName,
    "--title",
    issue.title,
    "--body-file",
    bodyFile,
    "--label",
    issue.label
  ], {
    cwd: projectRoot,
    encoding: "utf8",
    env: githubCliEnv()
  });
  const output = `${created.stdout}\n${created.stderr}`.trim();
  const githubIssueNumber = githubNumberFromOutput(output, "issues");
  if (created.status !== 0 || !githubIssueNumber) {
    const readback = writeGitHubIssueReadback(projectRoot, {
      owner,
      repo,
      localIssueNumber: issue.issueNumber,
      githubIssueNumber,
      title: issue.title,
      url: firstGithubUrl(output),
      labels: [],
      expectedLabel: issue.label,
      verified: false,
      verifiedAt: new Date().toISOString(),
      reason: created.status !== 0
        ? commandFailureMessage(created, "github issue create failed")
        : "github issue create did not return an issue URL/number"
    });
    return { ok: false, message: readback.reason ?? "github issue create failed", readback };
  }
  const readback = readGitHubIssue(projectRoot, owner, repo, issue, githubIssueNumber);
  return {
    ok: readback.verified,
    message: readback.verified ? "github issue created and verified" : readback.reason ?? "github issue readback failed",
    readback
  };
}

export function createGitHubPullRequestWithReadback(
  projectRoot: string,
  owner: string,
  repo: string,
  pullRequest: PullRequestRecord,
  issue: WorkIssue
): GitHubPullRequestWithReadbackResult {
  const repoName = `${owner}/${repo}`;
  const bodyFile = path.join(projectRoot, ".rph", "prs", `issue-${pullRequest.issueNumber}.md`);
  if (!path.isAbsolute(bodyFile) || !bodyFile.startsWith(projectRoot)) {
    throw new Error("invalid PR body path");
  }
  if (!fs.existsSync(bodyFile)) {
    ensureDir(path.dirname(bodyFile));
    writeText(bodyFile, renderGitHubPullRequestBody(issue));
  }
  const created = spawnSync(githubCliBinary(), [
    "pr",
    "create",
    "--repo",
    repoName,
    "--draft",
    "--base",
    pullRequest.targetBranch,
    "--head",
    pullRequest.sourceBranch,
    "--title",
    issue.title,
    "--body-file",
    bodyFile
  ], {
    cwd: projectRoot,
    encoding: "utf8",
    env: githubCliEnv()
  });
  const output = `${created.stdout}\n${created.stderr}`.trim();
  const githubPrNumber = githubNumberFromOutput(output, "pull");
  if (created.status !== 0 || !githubPrNumber) {
    const readback = writeGitHubPullRequestReadback(projectRoot, {
      owner,
      repo,
      localPrNumber: pullRequest.prNumber,
      localIssueNumber: pullRequest.issueNumber,
      githubPrNumber,
      title: issue.title,
      url: firstGithubUrl(output),
      expectedHeadRefName: pullRequest.sourceBranch,
      expectedBaseRefName: pullRequest.targetBranch,
      verified: false,
      verifiedAt: new Date().toISOString(),
      reason: created.status !== 0
        ? commandFailureMessage(created, "github pr create failed")
        : "github pr create did not return a PR URL/number"
    });
    return { ok: false, message: readback.reason ?? "github pr create failed", readback };
  }
  const readback = readGitHubPullRequest(projectRoot, owner, repo, pullRequest, issue, githubPrNumber);
  return {
    ok: readback.verified,
    message: readback.verified ? "github pull request created and verified" : readback.reason ?? "github pull request readback failed",
    readback
  };
}

export function createGitHubRepo(
  projectRoot: string,
  owner: string,
  repo: string,
  options: { visibility: "private" | "public"; push: boolean }
): GitHubRepoResult {
  const repoName = `${owner}/${repo}`;
  const existing = readGitHubRepo(projectRoot, owner, repo, true);
  if (existing) {
    ensureOriginRemote(projectRoot, existing.url);
    return {
      ok: true,
      existed: true,
      url: existing.url,
      message: "repository already exists",
      readback: existing
    };
  }

  const args = ["repo", "create", repoName, options.visibility === "private" ? "--private" : "--public", "--source", projectRoot, "--remote", "origin"];
  if (options.push) {
    args.push("--push");
  }
  const created = spawnSync(githubCliBinary(), args, {
    cwd: projectRoot,
    encoding: "utf8",
    env: githubCliEnv()
  });
  const output = `${created.stdout}\n${created.stderr}`.trim();
  if (created.status !== 0) {
    return {
      ok: false,
      existed: false,
      url: null,
      message: output || "repository create failed"
    };
  }
  const readback = readGitHubRepo(projectRoot, owner, repo, false);
  if (!readback) {
    return {
      ok: false,
      existed: false,
      url: firstGithubUrl(output),
      message: `repository create succeeded but readback failed: ${output || "missing gh repo view proof"}`
    };
  }
  ensureOriginRemote(projectRoot, readback.url);
  const verifiedReadback = options.push
    ? withGitPushReadback(projectRoot, readback)
    : writeGitHubRepoReadback(projectRoot, {
        ...readback,
        pushReadbackStatus: "not_required",
        pushReadbackReason: "push was not requested"
      });
  return {
    ok: verifiedReadback.pushReadbackStatus !== "failed",
    existed: false,
    url: verifiedReadback.url,
    message: verifiedReadback.pushReadbackStatus === "failed"
      ? `repository created but push readback failed: ${verifiedReadback.pushReadbackReason ?? "unknown"}`
      : output || "repository created",
    readback: verifiedReadback
  };
}

function readGitHubRepo(projectRoot: string, owner: string, repo: string, existed: boolean): GitHubRepoReadbackProof | null {
  const repoName = `${owner}/${repo}`;
  const result = spawnSync(githubCliBinary(), [
    "repo",
    "view",
    repoName,
    "--json",
    "nameWithOwner,url,visibility,isPrivate,defaultBranchRef,viewerPermission"
  ], {
    cwd: projectRoot,
    encoding: "utf8",
    env: githubCliEnv()
  });
  if (result.status !== 0) {
    return null;
  }
  try {
    const parsed = JSON.parse(result.stdout) as {
      nameWithOwner?: string;
      url?: string;
      visibility?: string;
      isPrivate?: boolean;
      defaultBranchRef?: { name?: string } | null;
      viewerPermission?: string;
    };
    const proof: GitHubRepoReadbackProof = {
      owner,
      repo,
      nameWithOwner: parsed.nameWithOwner ?? repoName,
      url: parsed.url ?? null,
      visibility: parsed.visibility,
      isPrivate: parsed.isPrivate,
      defaultBranch: parsed.defaultBranchRef?.name ?? null,
      viewerPermission: parsed.viewerPermission,
      existed,
      verifiedAt: new Date().toISOString()
    };
    return writeGitHubRepoReadback(projectRoot, proof);
  } catch {
    return null;
  }
}

function withGitPushReadback(projectRoot: string, proof: GitHubRepoReadbackProof): GitHubRepoReadbackProof {
  const branch = proof.defaultBranch || "main";
  const local = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: projectRoot,
    encoding: "utf8"
  });
  if (local.status !== 0) {
    return writeGitHubRepoReadback(projectRoot, {
      ...proof,
      pushReadbackStatus: "failed",
      localHead: null,
      remoteHead: null,
      remoteRef: `refs/heads/${branch}`,
      pushReadbackReason: local.stderr.trim() || local.stdout.trim() || "local HEAD unavailable"
    });
  }
  const localHead = local.stdout.trim();
  const remote = spawnSync("git", ["ls-remote", "--heads", "origin", branch], {
    cwd: projectRoot,
    encoding: "utf8"
  });
  if (remote.status !== 0) {
    return writeGitHubRepoReadback(projectRoot, {
      ...proof,
      pushReadbackStatus: "failed",
      localHead,
      remoteHead: null,
      remoteRef: `refs/heads/${branch}`,
      pushReadbackReason: remote.stderr.trim() || remote.stdout.trim() || "remote HEAD unavailable"
    });
  }
  const [remoteHead, remoteRef] = remote.stdout.trim().split(/\s+/);
  const matched = Boolean(remoteHead) && remoteHead === localHead;
  return writeGitHubRepoReadback(projectRoot, {
    ...proof,
    pushReadbackStatus: matched ? "passed" : "failed",
    localHead,
    remoteHead: remoteHead || null,
    remoteRef: remoteRef || `refs/heads/${branch}`,
    pushReadbackReason: matched ? "remote branch HEAD matches local HEAD" : "remote branch HEAD does not match local HEAD"
  });
}

function writeGitHubRepoReadback(projectRoot: string, proof: GitHubRepoReadbackProof): GitHubRepoReadbackProof {
  ensureDir(githubDir(projectRoot));
  const boundProof = attachRuntimeActionReadbackBinding(proof);
  writeJson(githubRepoReadbackFile(projectRoot), boundProof);
  return boundProof;
}

function readGitHubLabels(projectRoot: string, owner: string, repo: string, expected: GitHubLabel[]): GitHubLabelsReadbackProof {
  const result = spawnSync(githubCliBinary(), [
    "label",
    "list",
    "--repo",
    `${owner}/${repo}`,
    "--json",
    "name,color,description"
  ], {
    cwd: projectRoot,
    encoding: "utf8",
    env: githubCliEnv()
  });
  if (result.status !== 0) {
    return writeGitHubLabelsReadback(projectRoot, owner, repo, expected, [], expected.map((label) => label.name), []);
  }
  try {
    const observed = JSON.parse(result.stdout) as Array<{ name: string; color?: string; description?: string }>;
    const observedByName = new Map(observed.map((label) => [label.name, label]));
    const missing = expected
      .filter((label) => !observedByName.has(label.name))
      .map((label) => label.name);
    const mismatched = expected.flatMap((label) => {
      const observedLabel = observedByName.get(label.name);
      if (!observedLabel || normalizeColor(observedLabel.color) === normalizeColor(label.color)) {
        return [];
      }
      return [{ name: label.name, expectedColor: label.color, observedColor: observedLabel.color }];
    });
    return writeGitHubLabelsReadback(projectRoot, owner, repo, expected, observed, missing, mismatched);
  } catch {
    return writeGitHubLabelsReadback(projectRoot, owner, repo, expected, [], expected.map((label) => label.name), []);
  }
}

function writeGitHubLabelsReadback(
  projectRoot: string,
  owner: string,
  repo: string,
  expected: GitHubLabel[],
  observed: Array<{ name: string; color?: string; description?: string }>,
  missing: string[],
  mismatched: Array<{ name: string; expectedColor: string; observedColor?: string }>
): GitHubLabelsReadbackProof {
  const proof: GitHubLabelsReadbackProof = attachRuntimeActionReadbackBinding({
    owner,
    repo,
    expected,
    observed,
    missing,
    mismatched,
    verified: missing.length === 0 && mismatched.length === 0,
    verifiedAt: new Date().toISOString()
  });
  ensureDir(githubDir(projectRoot));
  writeJson(githubLabelsReadbackFile(projectRoot), proof);
  return proof;
}

function readGitHubIssue(
  projectRoot: string,
  owner: string,
  repo: string,
  issue: WorkIssue,
  githubIssueNumber: number
): GitHubIssueReadbackProof {
  const result = spawnSync(githubCliBinary(), [
    "issue",
    "view",
    String(githubIssueNumber),
    "--repo",
    `${owner}/${repo}`,
    "--json",
    "number,title,url,state,labels"
  ], {
    cwd: projectRoot,
    encoding: "utf8",
    env: githubCliEnv()
  });
  if (result.status !== 0) {
    return writeGitHubIssueReadback(projectRoot, {
      owner,
      repo,
      localIssueNumber: issue.issueNumber,
      githubIssueNumber,
      title: issue.title,
      url: null,
      labels: [],
      expectedLabel: issue.label,
      verified: false,
      verifiedAt: new Date().toISOString(),
      reason: commandFailureMessage(result, "github issue view failed")
    });
  }
  try {
    const parsed = JSON.parse(result.stdout) as {
      number?: number;
      title?: string;
      url?: string;
      state?: string;
      labels?: Array<{ name?: string }>;
    };
    const labels = (parsed.labels ?? []).flatMap((label) => label.name ? [{ name: label.name }] : []);
    const labelMatched = labels.some((label) => label.name === issue.label);
    const numberMatched = parsed.number === githubIssueNumber;
    const titleMatched = parsed.title === issue.title;
    const verified = numberMatched && titleMatched && labelMatched;
    return writeGitHubIssueReadback(projectRoot, {
      owner,
      repo,
      localIssueNumber: issue.issueNumber,
      githubIssueNumber: parsed.number ?? githubIssueNumber,
      title: parsed.title ?? issue.title,
      url: parsed.url ?? null,
      state: parsed.state,
      labels,
      expectedLabel: issue.label,
      verified,
      verifiedAt: new Date().toISOString(),
      reason: verified
        ? "github issue title, number, and label matched local issue"
        : `github issue readback mismatch: number=${numberMatched} title=${titleMatched} label=${labelMatched}`
    });
  } catch {
    return writeGitHubIssueReadback(projectRoot, {
      owner,
      repo,
      localIssueNumber: issue.issueNumber,
      githubIssueNumber,
      title: issue.title,
      url: null,
      labels: [],
      expectedLabel: issue.label,
      verified: false,
      verifiedAt: new Date().toISOString(),
      reason: "github issue view returned invalid JSON"
    });
  }
}

function readGitHubPullRequest(
  projectRoot: string,
  owner: string,
  repo: string,
  pullRequest: PullRequestRecord,
  issue: WorkIssue,
  githubPrNumber: number
): GitHubPullRequestReadbackProof {
  const result = spawnSync(githubCliBinary(), [
    "pr",
    "view",
    String(githubPrNumber),
    "--repo",
    `${owner}/${repo}`,
    "--json",
    "number,title,url,state,headRefName,baseRefName,isDraft"
  ], {
    cwd: projectRoot,
    encoding: "utf8",
    env: githubCliEnv()
  });
  if (result.status !== 0) {
    return writeGitHubPullRequestReadback(projectRoot, {
      owner,
      repo,
      localPrNumber: pullRequest.prNumber,
      localIssueNumber: pullRequest.issueNumber,
      githubPrNumber,
      title: issue.title,
      url: null,
      expectedHeadRefName: pullRequest.sourceBranch,
      expectedBaseRefName: pullRequest.targetBranch,
      verified: false,
      verifiedAt: new Date().toISOString(),
      reason: commandFailureMessage(result, "github pr view failed")
    });
  }
  try {
    const parsed = JSON.parse(result.stdout) as {
      number?: number;
      title?: string;
      url?: string;
      state?: string;
      headRefName?: string;
      baseRefName?: string;
      isDraft?: boolean;
    };
    const numberMatched = parsed.number === githubPrNumber;
    const titleMatched = parsed.title === issue.title;
    const headMatched = parsed.headRefName === pullRequest.sourceBranch;
    const baseMatched = parsed.baseRefName === pullRequest.targetBranch;
    const draftMatched = parsed.isDraft === true;
    const verified = numberMatched && titleMatched && headMatched && baseMatched && draftMatched;
    return writeGitHubPullRequestReadback(projectRoot, {
      owner,
      repo,
      localPrNumber: pullRequest.prNumber,
      localIssueNumber: pullRequest.issueNumber,
      githubPrNumber: parsed.number ?? githubPrNumber,
      title: parsed.title ?? issue.title,
      url: parsed.url ?? null,
      state: parsed.state,
      headRefName: parsed.headRefName,
      baseRefName: parsed.baseRefName,
      expectedHeadRefName: pullRequest.sourceBranch,
      expectedBaseRefName: pullRequest.targetBranch,
      isDraft: parsed.isDraft,
      verified,
      verifiedAt: new Date().toISOString(),
      reason: verified
        ? "github PR title, number, head, base, and draft status matched local PR draft"
        : `github PR readback mismatch: number=${numberMatched} title=${titleMatched} head=${headMatched} base=${baseMatched} draft=${draftMatched}`
    });
  } catch {
    return writeGitHubPullRequestReadback(projectRoot, {
      owner,
      repo,
      localPrNumber: pullRequest.prNumber,
      localIssueNumber: pullRequest.issueNumber,
      githubPrNumber,
      title: issue.title,
      url: null,
      expectedHeadRefName: pullRequest.sourceBranch,
      expectedBaseRefName: pullRequest.targetBranch,
      verified: false,
      verifiedAt: new Date().toISOString(),
      reason: "github pr view returned invalid JSON"
    });
  }
}

function writeGitHubIssueReadback(
  projectRoot: string,
  proof: GitHubIssueReadbackProof
): GitHubIssueReadbackProof {
  ensureDir(githubDir(projectRoot));
  const boundProof = attachRuntimeActionReadbackBinding(proof);
  writeJson(githubIssueReadbackFile(projectRoot, proof.localIssueNumber), boundProof);
  writeJson(githubIssueLatestReadbackFile(projectRoot), boundProof);
  return boundProof;
}

function writeGitHubPullRequestReadback(
  projectRoot: string,
  proof: GitHubPullRequestReadbackProof
): GitHubPullRequestReadbackProof {
  ensureDir(githubDir(projectRoot));
  const boundProof = attachRuntimeActionReadbackBinding(proof);
  writeJson(githubPullRequestReadbackFile(projectRoot, proof.localPrNumber), boundProof);
  writeJson(githubPullRequestLatestReadbackFile(projectRoot), boundProof);
  return boundProof;
}

function renderGitHubIssueBody(issue: WorkIssue): string {
  return [
    issue.description || issue.title,
    "",
    "## Acceptance Criteria",
    ...issue.acceptanceCriteria.map((item) => `- ${item}`),
    "",
    "## Branch",
    issue.branchName,
    "",
    "## QA Requirement",
    issue.testRequirement,
    "",
    "## RPH Local Issue",
    `#${issue.issueNumber}`
  ].join("\n");
}

function renderGitHubPullRequestBody(issue: WorkIssue): string {
  return [
    "## Summary",
    issue.description || issue.title,
    "",
    "## Related Local Issue",
    `#${issue.issueNumber}`,
    "",
    "## Acceptance Criteria",
    ...issue.acceptanceCriteria.map((item) => `- ${item}`),
    "",
    "## Test Results",
    `- Planned: ${issue.testRequirement}`,
    "",
    "## User Approval Required",
    "yes"
  ].join("\n");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function relativeProjectPath(projectRoot: string, filePath: string): string {
  return path.relative(projectRoot, filePath).split(path.sep).join("/");
}

function stableSnapshotJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSnapshotJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSnapshotJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeColor(color: string | undefined): string {
  return (color ?? "").replace(/^#/, "").toUpperCase();
}

function ensureOriginRemote(projectRoot: string, repoUrl: string | null): void {
  if (!repoUrl) {
    return;
  }
  const remote = spawnSync("git", ["remote", "get-url", "origin"], {
    cwd: projectRoot,
    encoding: "utf8"
  });
  if (remote.status === 0) {
    return;
  }
  spawnSync("git", ["remote", "add", "origin", `${repoUrl}.git`], {
    cwd: projectRoot,
    encoding: "utf8"
  });
}

function parseGhUrl(stdout: string): string | null {
  try {
    const parsed = JSON.parse(stdout) as { url?: string };
    return parsed.url ?? null;
  } catch {
    return null;
  }
}

function firstGithubUrl(output: string): string | null {
  const match = output.match(/https:\/\/github\.com\/[^\s]+/);
  return match?.[0].replace(/\.git$/, "") ?? null;
}

function githubNumberFromOutput(output: string, kind: "issues" | "pull"): number | null {
  try {
    const parsed = JSON.parse(output) as { number?: number; url?: string };
    if (Number.isInteger(parsed.number)) {
      return parsed.number ?? null;
    }
    if (parsed.url) {
      return githubNumberFromOutput(parsed.url, kind);
    }
  } catch {
    // Fall through to URL parsing.
  }
  const match = output.match(new RegExp(`/(${kind})/(\\d+)\\b`));
  if (!match?.[2]) {
    return null;
  }
  const number = Number(match[2]);
  return Number.isInteger(number) ? number : null;
}

function commandFailureMessage(
  result: ReturnType<typeof spawnSync>,
  fallback: string
): string {
  const processError = result.error instanceof Error ? result.error.message : "";
  const output = result.stderr || result.stdout || processError || fallback;
  return Buffer.isBuffer(output) ? output.toString("utf8").trim() : output.trim();
}

export function writeGitHubTemplates(projectRoot: string): string[] {
  const issueDir = path.join(projectRoot, ".github", "ISSUE_TEMPLATE");
  ensureDir(issueDir);
  const files = [
    path.join(issueDir, "feature.yml"),
    path.join(issueDir, "bug_fix.yml"),
    path.join(issueDir, "chore.yml"),
    path.join(issueDir, "config.yml"),
    path.join(projectRoot, ".github", "pull_request_template.md")
  ];
  writeText(files[0], featureTemplate());
  writeText(files[1], bugFixTemplate());
  writeText(files[2], choreTemplate());
  writeText(files[3], "blank_issues_enabled: false\ncontact_links: []\n");
  writeText(files[4], pullRequestTemplate());
  return files;
}

export function writeGitHubBranchPlan(projectRoot: string): string {
  const filePath = githubBranchPlanFile(projectRoot);
  writeText(filePath, [
    "# GitHub Branch Plan",
    "",
    "## Protected branches",
    "- main: production",
    "- release: next version preparation",
    "- dev: integration",
    "",
    "## Branch commands",
    "```bash",
    "git switch -c dev main",
    "git switch -c release main",
    "git switch main",
    "```",
    "",
    "## Merge flow",
    "local branch -> dev -> release -> main",
    "",
    "## Hotfix flow",
    "main -> hotfix/<number>-<slug> -> main, then backport to release and dev",
    "",
    "No branch is created or merged by this plan without user approval."
  ].join("\n"));
  return filePath;
}

function featureTemplate(): string {
  return [
    "name: Feature",
    "description: Product feature work item",
    "title: \"[feat] \"",
    "labels: [\"feat\"]",
    "body:",
    "  - type: textarea",
    "    id: summary",
    "    attributes:",
    "      label: Summary",
    "  - type: textarea",
    "    id: background",
    "    attributes:",
    "      label: Background",
    "  - type: textarea",
    "    id: scope",
    "    attributes:",
    "      label: Scope",
    "  - type: textarea",
    "    id: acceptance",
    "    attributes:",
    "      label: Acceptance Criteria"
  ].join("\n");
}

function bugFixTemplate(): string {
  return [
    "name: Bug fix",
    "description: Defect or regression work item",
    "title: \"[fix] \"",
    "labels: [\"fix\"]",
    "body:",
    "  - type: textarea",
    "    id: summary",
    "    attributes:",
    "      label: Summary",
    "  - type: textarea",
    "    id: reproduction",
    "    attributes:",
    "      label: Reproduction",
    "  - type: textarea",
    "    id: tests",
    "    attributes:",
    "      label: Test Requirements"
  ].join("\n");
}

function choreTemplate(): string {
  return [
    "name: Chore",
    "description: Maintenance, tooling, or docs work item",
    "title: \"[chore] \"",
    "labels: [\"chore\"]",
    "body:",
    "  - type: textarea",
    "    id: summary",
    "    attributes:",
    "      label: Summary",
    "  - type: textarea",
    "    id: risk",
    "    attributes:",
    "      label: Risk"
  ].join("\n");
}

function pullRequestTemplate(): string {
  return [
    "## Summary",
    "",
    "## Related Issue",
    "",
    "## Changes",
    "",
    "## Screenshots or Preview",
    "",
    "## API Changes",
    "",
    "## Test Results",
    "",
    "## QA Checklist",
    "",
    "- [ ] Requirements checked",
    "- [ ] Tests run",
    "- [ ] Conflict status checked",
    "- [ ] User approval required before merge",
    "",
    "## Risk",
    "",
    "## Rollback Plan",
    "",
    "## Merge Target",
    "",
    "## User Approval Required"
  ].join("\n");
}
