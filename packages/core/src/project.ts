import fs from "node:fs";
import path from "node:path";
import { approvalsFile, designApprovalsFile, githubDir, interviewsDir, issueIndexFile, projectFile, rphDir, stateFile } from "./paths";
import { ensureDir, fileExists, readJson, writeJson, writeText } from "./fs";
import { Project, ProjectState } from "./types";
import { newId, nowIso } from "./time";
import { createMcpConfig } from "../../integrations/src/mcp";

export interface InitProjectOptions {
  projectName: string;
  obsidianPath?: string;
  force?: boolean;
  dryRun?: boolean;
}

export function initProject(projectRoot: string, options: InitProjectOptions): { project: Project; state: ProjectState; files: string[] } {
  const root = path.resolve(projectRoot);
  const createdAt = nowIso();
  const project: Project = {
    id: newId("project"),
    name: options.projectName,
    rootPath: root,
    createdAt,
    updatedAt: createdAt,
    stack: {
      language: "TypeScript",
      runtime: "Node.js",
      packageManager: "pnpm",
      database: "unset"
    },
    integrations: {
      github: "dry-run",
      notion: "not-configured",
      obsidian: options.obsidianPath ? "configured" : "not-configured",
      mcp: "dry-run"
    }
  };
  const state: ProjectState = {
    projectId: project.id,
    currentStage: "SETUP",
    paused: false,
    history: [{ from: null, to: "SETUP", at: createdAt, reason: "project initialized" }],
    documents: {},
    designArtifacts: {},
    updatedAt: createdAt
  };
  const files = [
    projectFile(root),
    stateFile(root),
    approvalsFile(root),
    designApprovalsFile(root),
    issueIndexFile(root),
    path.join(githubDir(root), "labels.json"),
    path.join(root, ".mcp", "config.json"),
    path.join(root, ".env.example")
  ];
  if (options.dryRun) {
    return { project, state, files };
  }
  ensureDir(rphDir(root));
  ensureDir(interviewsDir(root, "product-definition"));
  writeJson(projectFile(root), project);
  writeJson(stateFile(root), state);
  writeJson(approvalsFile(root), []);
  writeJson(designApprovalsFile(root), []);
  writeJson(issueIndexFile(root), { nextIssueNumber: 1, issues: [] });
  writeJson(path.join(root, ".mcp", "config.json"), createMcpConfig());
  if (!fileExists(path.join(root, ".env.example")) || options.force) {
    writeText(path.join(root, ".env.example"), envExample());
  }
  return { project, state, files };
}

export function loadProject(projectRoot: string): Project {
  return readJson<Project>(projectFile(projectRoot));
}

export function loadState(projectRoot: string): ProjectState {
  return readJson<ProjectState>(stateFile(projectRoot));
}

export function saveState(projectRoot: string, state: ProjectState): void {
  writeJson(stateFile(projectRoot), state);
}

export function requireInitialized(projectRoot: string): void {
  if (!fs.existsSync(projectFile(projectRoot)) || !fs.existsSync(stateFile(projectRoot))) {
    throw new Error("RPH project not initialized. Run: rph init");
  }
}

export function updateDocumentState(projectRoot: string, state: ProjectState): void {
  saveState(projectRoot, state);
}

function envExample(): string {
  return [
    "OPENAI_API_KEY=",
    "ANTHROPIC_API_KEY=",
    "GEMINI_API_KEY=",
    "GITHUB_TOKEN=",
    "GITHUB_OWNER=",
    "GITHUB_REPO=",
    "NOTION_TOKEN=",
    "NOTION_WORKSPACE_ID=",
    "NOTION_PARENT_PAGE_ID=",
    "FIGMA_TOKEN=",
    "FIGMA_FILE_ID=",
    "SLACK_BOT_TOKEN=",
    "DISCORD_BOT_TOKEN=",
    "DEPLOY_PROVIDER=",
    "DATABASE_URL=",
    "CLOUD_PROJECT_ID=",
    "AWS_ACCESS_KEY_ID=",
    "AWS_SECRET_ACCESS_KEY=",
    "GCP_PROJECT_ID="
  ].join("\n");
}
