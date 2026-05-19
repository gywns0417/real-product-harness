import path from "node:path";
import { spawnSync } from "node:child_process";
import { githubDir } from "./paths";
import { ensureDir, writeJson, writeText } from "./fs";
import { GitHubLabel } from "./types";

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
}

export function applyGitHubLabels(owner: string, repo: string, labels: GitHubLabel[] = DEFAULT_GITHUB_LABELS): GitHubApplyResult[] {
  const repoName = `${owner}/${repo}`;
  return labels.map((label) => {
    const result = spawnSync(
      "gh",
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
      { encoding: "utf8" }
    );
    return {
      label: label.name,
      ok: result.status === 0,
      message: result.status === 0 ? "applied" : (result.stderr || result.stdout || "unknown error").trim()
    };
  });
}

export function createGitHubRepo(
  projectRoot: string,
  owner: string,
  repo: string,
  options: { visibility: "private" | "public"; push: boolean }
): GitHubRepoResult {
  const repoName = `${owner}/${repo}`;
  const view = spawnSync("gh", ["repo", "view", repoName, "--json", "url"], {
    cwd: projectRoot,
    encoding: "utf8"
  });
  if (view.status === 0) {
    const url = parseGhUrl(view.stdout);
    ensureOriginRemote(projectRoot, url);
    return {
      ok: true,
      existed: true,
      url,
      message: "repository already exists"
    };
  }

  const args = ["repo", "create", repoName, options.visibility === "private" ? "--private" : "--public", "--source", projectRoot, "--remote", "origin"];
  if (options.push) {
    args.push("--push");
  }
  const created = spawnSync("gh", args, {
    cwd: projectRoot,
    encoding: "utf8"
  });
  const output = `${created.stdout}\n${created.stderr}`.trim();
  return {
    ok: created.status === 0,
    existed: false,
    url: created.status === 0 ? firstGithubUrl(output) : null,
    message: output || "repository created"
  };
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
