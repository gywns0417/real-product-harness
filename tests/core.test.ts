import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  approveDocument,
  createBranchName,
  createDocumentVersion,
  createObsidianProject,
  diffDocumentVersions,
  exportDocumentToObsidian,
  initProject,
  loadState,
  normalizeLabel,
  parseCli,
  readDocumentIndex,
  setupGitHubLabels,
  showDocument,
  syncStateDocuments,
  transitionState,
  validateEnv
} from "../packages/core/src";

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rph-test-"));
  initProject(root, { projectName: "Test Product" });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe("workflow state machine", () => {
  it("moves from setup to PM interview", () => {
    const state = loadState(root);
    const next = transitionState(state, "PM_PRODUCT_DEFINITION_INTERVIEW", "test");
    expect(next.currentStage).toBe("PM_PRODUCT_DEFINITION_INTERVIEW");
  });

  it("blocks approval stage without required approval", () => {
    const state = loadState(root);
    expect(() => transitionState(state, "PM_PRODUCT_DEFINITION_APPROVED", "test")).toThrow(/required approval|cannot move/);
  });
});

describe("document versions", () => {
  it("creates versioned markdown documents", () => {
    const first = createDocumentVersion(root, "product-definition", { changeSummary: "initial" });
    const second = createDocumentVersion(root, "product-definition", { changeSummary: "revision", body: "# Revised" });
    expect(first.currentVersion).toBe("v1.0.0");
    expect(second.currentVersion).toBe("v1.0.1");
    expect(showDocument(root, "product-definition", "v1.0.1")).toContain("# Revised");
  });

  it("diffs two versions", () => {
    createDocumentVersion(root, "product-definition", { changeSummary: "initial", body: "# A" });
    createDocumentVersion(root, "product-definition", { changeSummary: "revision", body: "# B" });
    expect(diffDocumentVersions(root, "product-definition", "v1.0.0", "v1.0.1")).toContain("+ # B");
  });
});

describe("approval gate", () => {
  it("records approval and marks current document approved", () => {
    const index = createDocumentVersion(root, "product-definition", { changeSummary: "initial" });
    const state = syncStateDocuments(loadState(root), index);
    expect(state.documents["product-definition"]?.currentVersion).toBe("v1.0.0");
    const approval = approveDocument(root, "product-definition", "tester");
    const approvedIndex = readDocumentIndex(root, "product-definition");
    expect(approval.approvedBy).toBe("tester");
    expect(approvedIndex.status).toBe("approved");
  });
});

describe("github helpers", () => {
  it("normalizes labels and creates branch names", () => {
    expect(normalizeLabel("refator")).toBe("refactor");
    expect(createBranchName("feat", 12, "PM Document Flow")).toBe("feat/12-pm-document-flow");
  });

  it("writes label dry-run config", () => {
    const result = setupGitHubLabels(root);
    expect(result.labels).toHaveLength(8);
    expect(fs.existsSync(path.join(root, ".rph", "github", "labels.json"))).toBe(true);
  });
});

describe("command parser and env validation", () => {
  it("parses nested command args and options", () => {
    const parsed = parseCli(["pm", "approve", "product-definition", "--by", "tester"]);
    expect(parsed.command).toBe("pm");
    expect(parsed.subcommand).toBe("approve");
    expect(parsed.args).toEqual(["product-definition"]);
    expect(parsed.options.by).toBe("tester");
  });

  it("ignores npm argument separator", () => {
    const parsed = parseCli(["--", "status"]);
    expect(parsed.command).toBe("status");
  });

  it("validates required env keys", () => {
    const result = validateEnv({ GITHUB_TOKEN: "token" } as NodeJS.ProcessEnv, ["GITHUB_TOKEN", "GITHUB_OWNER"]);
    expect(result.valid).toBe(false);
    expect(result.present).toEqual(["GITHUB_TOKEN"]);
    expect(result.missing).toEqual(["GITHUB_OWNER"]);
  });
});

describe("obsidian export", () => {
  it("creates vault structure and exports a document", () => {
    const vault = path.join(root, "vault-project");
    const files = createObsidianProject(vault);
    createDocumentVersion(root, "product-definition", { changeSummary: "initial" });
    const exported = exportDocumentToObsidian(root, vault, "product-definition");
    expect(files.length).toBeGreaterThan(0);
    expect(fs.existsSync(exported)).toBe(true);
    expect(exported).toContain(path.join("01_PM", "product-definition"));
  });
});
