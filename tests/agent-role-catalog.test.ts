import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executionProfileSandboxCommandBlocker, runParsedCommand } from "../apps/cli/src/index";
import {
  createHarnessConfig,
  discoverAgentLibraryProfiles,
  executeAgentTurn,
  initProject,
  parseCli,
  parseCommandLine,
  renderActiveCustomAgentPrompt,
  renderAgentRoleContractCatalog,
  startAgentLaneRun
} from "../packages/core/src";

const SAMPLE_AGENT_TOML = "/Users/king/Desktop/awesome-codex-subagents/categories/04-quality-security/test-automator.toml";
const CLI_DEVELOPER_TOML = "/Users/king/Desktop/awesome-codex-subagents/categories/06-developer-experience/cli-developer.toml";
const QA_EXPERT_TOML = "/Users/king/Desktop/awesome-codex-subagents/categories/04-quality-security/qa-expert.toml";
const HERMES_OPERATOR_PACK = [
  "workflow-orchestrator",
  "multi-agent-coordinator",
  "task-distributor",
  "product-manager",
  "cli-developer",
  "mcp-developer",
  "test-automator",
  "security-auditor",
  "risk-manager",
  "error-coordinator"
];

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "rph-agent-role-test-"));
  initProject(root, { projectName: "Agent Role Test Product" });
  process.exitCode = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("agent role catalog contracts", () => {
  it("parses agent role management commands as agent subcommands", () => {
    expect(parseCli(["agent", "roles"])).toMatchObject({
      command: "agent",
      subcommand: "roles",
      args: []
    });

    expect(parseCli(parseCommandLine(`/agent import "${SAMPLE_AGENT_TOML}"`))).toMatchObject({
      command: "agent",
      subcommand: "import",
      args: [SAMPLE_AGENT_TOML]
    });

    expect(parseCli(parseCommandLine("/agent use test-automator"))).toMatchObject({
      command: "agent",
      subcommand: "use",
      args: ["test-automator"]
    });

    expect(parseCli(parseCommandLine("/agent bind qa-expert --role QA --stage QA_REVIEW"))).toMatchObject({
      command: "agent",
      subcommand: "bind",
      args: ["qa-expert"],
      options: {
        role: "QA",
        stage: "QA_REVIEW"
      }
    });

    expect(parseCli(parseCommandLine("/agent discover cli"))).toMatchObject({
      command: "agent",
      subcommand: "discover",
      args: ["cli"]
    });

    expect(parseCli(parseCommandLine("/agent import cli-developer"))).toMatchObject({
      command: "agent",
      subcommand: "import",
      args: ["cli-developer"]
    });

    expect(parseCli(parseCommandLine("/agent pack --activate workflow-orchestrator"))).toMatchObject({
      command: "agent",
      subcommand: "pack",
      args: [],
      options: {
        activate: "workflow-orchestrator"
      }
    });
  });

  it("renders the built-in runtime role catalog from the current contract source", () => {
    const catalog = renderAgentRoleContractCatalog();

    expect(catalog).toContain("Orchestrator:");
    expect(catalog).toContain("PM:");
    expect(catalog).toContain("PD:");
    expect(catalog).toContain("FE:");
    expect(catalog).toContain("BE:");
    expect(catalog).toContain("QA:");
    expect(catalog).toContain("allowed: /pm, /docs, /status, /next, /agent");
    expect(catalog).toContain("allowed: /qa, /github, /status, /next, /agent");
  });

  it("lists built-in roles together with imported custom roles via rph agent roles and /agent roles", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(await runParsedCommand(root, parseCli(["agent", "import", SAMPLE_AGENT_TOML]))).toBe(true);
    expect(await runParsedCommand(root, parseCli(["agent", "roles"]))).toBe(true);
    expect(await runParsedCommand(root, parseCli(parseCommandLine("/agent roles")), false)).toBe(true);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("Orchestrator");
    expect(output).toContain("PM");
    expect(output).toContain("test-automator");
    expect(output).toMatch(/custom|imported/i);
  });

  it("documents role and stage binding commands in agent help", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(await runParsedCommand(root, parseCli(["help", "agent"]))).toBe(true);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("rph agent bind product-manager --role PM");
    expect(output).toContain("/agent bind qa-expert --role QA --stage QA_REVIEW");
    expect(output).toContain("/agent bindings");
  });

  it("stores an imported TOML agent as a project-local secretless JSON catalog entry", async () => {
    const ok = await runParsedCommand(root, parseCli(["agent", "import", SAMPLE_AGENT_TOML]));

    expect(ok).toBe(true);
    const catalogFile = path.join(root, ".rph", "agents", "test-automator.json");
    expect(fs.existsSync(catalogFile)).toBe(true);

    const stored = JSON.parse(fs.readFileSync(catalogFile, "utf8")) as {
      name: string;
      description: string;
      model?: string;
      sourcePath?: string;
    };

    expect(stored).toMatchObject({
      name: "test-automator",
      description: "Use when a task needs implementation of automated tests, test harness improvements, or targeted regression coverage.",
      model: "gpt-5.3-codex-spark"
    });
    expect(stored.sourcePath).toBeUndefined();
    expect(fs.readFileSync(catalogFile, "utf8")).not.toContain("API_KEY");
  });

  it("discovers Awesome Codex Subagents profiles from the local library for cli and test queries", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const cliDiscovered = discoverAgentLibraryProfiles({ query: "cli", limit: 10 });
    const testDiscovered = discoverAgentLibraryProfiles({ query: "test", limit: 10 });
    expect(cliDiscovered.some((profile) => profile.slug === "cli-developer")).toBe(true);
    expect(testDiscovered.some((profile) => profile.slug === "test-automator")).toBe(true);

    expect(await runParsedCommand(root, parseCli(["agent", "discover", "cli"]))).toBe(true);
    expect(await runParsedCommand(root, parseCli(["agent", "discover", "test"]))).toBe(true);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("cli-developer");
    expect(output).toContain("test-automator");
    expect(output).toContain("Awesome Codex Subagents");
    expect(output).toMatch(/local|library/i);
  });

  it("imports an Awesome profile by slug without requiring a full path", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(await runParsedCommand(root, parseCli(["agent", "import", "cli-developer"]))).toBe(true);

    const catalogFile = path.join(root, ".rph", "agents", "cli-developer.json");
    expect(fs.existsSync(catalogFile)).toBe(true);
    expect(JSON.parse(fs.readFileSync(catalogFile, "utf8"))).toMatchObject({
      name: "cli-developer",
      description: "Use when a task needs a command-line interface feature, UX review, argument parsing change, or shell-facing workflow improvement.",
      model: "gpt-5.4"
    });
    expect(logSpy.mock.calls.flat().join("\n")).toContain("agent imported: cli-developer");
  });

  it("imports the recommended Hermes operator profile pack in one command", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(await runParsedCommand(root, parseCli(["agent", "pack"]))).toBe(true);

    for (const slug of HERMES_OPERATOR_PACK) {
      const catalogFile = path.join(root, ".rph", "agents", `${slug}.json`);
      expect(fs.existsSync(catalogFile)).toBe(true);
      expect(fs.readFileSync(catalogFile, "utf8")).not.toContain("/Users/king/Desktop/awesome-codex-subagents");
    }
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("agent pack imported: hermes-operator");
    expect(output).toContain(`profiles: ${HERMES_OPERATOR_PACK.length}`);
    expect(output).toContain("next: /agent use workflow-orchestrator");
  });

  it("can activate a recommended profile while importing the Hermes operator pack", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(await runParsedCommand(root, parseCli(parseCommandLine("/agent pack --activate workflow-orchestrator")), false)).toBe(true);

    const activeFile = path.join(root, ".rph", "agents", "active.json");
    expect(fs.existsSync(activeFile)).toBe(true);
    expect(JSON.parse(fs.readFileSync(activeFile, "utf8"))).toMatchObject({
      name: "workflow-orchestrator",
      slug: "workflow-orchestrator"
    });
    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("agent pack imported: hermes-operator");
    expect(output).toContain("active custom agent: workflow-orchestrator");
  });

  it("prefers Awesome profile lookup for bare names even when cwd has a colliding local directory", async () => {
    const previousCwd = process.cwd();
    fs.mkdirSync(path.join(root, "cli-developer"));
    try {
      process.chdir(root);

      expect(await runParsedCommand(root, parseCli(["agent", "import", "cli-developer"]))).toBe(true);
    } finally {
      process.chdir(previousCwd);
    }

    const catalogFile = path.join(root, ".rph", "agents", "cli-developer.json");
    expect(fs.existsSync(catalogFile)).toBe(true);
    expect(JSON.parse(fs.readFileSync(catalogFile, "utf8"))).toMatchObject({
      name: "cli-developer"
    });
  });

  it("discovers and imports Awesome profiles that include MCP table metadata", async () => {
    const discovered = discoverAgentLibraryProfiles({ query: "browser-debugger", limit: 10 });

    expect(discovered.some((profile) => profile.slug === "browser-debugger")).toBe(true);
    expect(await runParsedCommand(root, parseCli(["agent", "import", "browser-debugger"]))).toBe(true);

    const catalogFile = path.join(root, ".rph", "agents", "browser-debugger.json");
    const stored = JSON.parse(fs.readFileSync(catalogFile, "utf8")) as { name: string; developerInstructions: string };
    expect(stored.name).toBe("browser-debugger");
    expect(stored.developerInstructions).toContain("Own browser debugging work");
  });

  it("uses explicit library overrides for discover and slug import without persisting the source path", async () => {
    const libraryRoot = path.join(root, "agent-library");
    const categoryDir = path.join(libraryRoot, "local-category");
    fs.mkdirSync(categoryDir, { recursive: true });
    fs.writeFileSync(path.join(categoryDir, "custom-runner.toml"), [
      'name = "custom-runner"',
      'description = "Use for project-local custom runner validation."',
      'model = "gpt-5.4"',
      'model_reasoning_effort = "medium"',
      'sandbox_mode = "workspace-write"',
      'developer_instructions = """',
      "Validate local custom runner behavior.",
      '"""',
      ""
    ].join("\n"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(await runParsedCommand(root, parseCli(["agent", "discover", "custom", "--library", libraryRoot]))).toBe(true);
    expect(await runParsedCommand(root, parseCli(["agent", "import", "custom-runner", "--library", libraryRoot]))).toBe(true);

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain(`library: ${libraryRoot}`);
    expect(output).toContain("custom-runner");
    const storedText = fs.readFileSync(path.join(root, ".rph", "agents", "custom-runner.json"), "utf8");
    expect(storedText).not.toContain(libraryRoot);
  });

  it("does not persist a local absolute source path when importing an Awesome profile by slug", async () => {
    expect(await runParsedCommand(root, parseCli(["agent", "import", "cli-developer"]))).toBe(true);

    const catalogFile = path.join(root, ".rph", "agents", "cli-developer.json");
    const storedText = fs.readFileSync(catalogFile, "utf8");
    const stored = JSON.parse(storedText) as {
      name: string;
      sourcePath?: string;
    };

    expect(stored.name).toBe("cli-developer");
    expect(stored.sourcePath).toBeUndefined();
    expect(storedText).not.toContain(CLI_DEVELOPER_TOML);
    expect(storedText).not.toContain("/Users/king/Desktop/awesome-codex-subagents");
  });

  it("persists the active custom agent selection and exposes it in subsequent agent status output", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(await runParsedCommand(root, parseCli(["agent", "import", SAMPLE_AGENT_TOML]))).toBe(true);
    expect(await runParsedCommand(root, parseCli(["agent", "use", "test-automator"]))).toBe(true);
    expect(await runParsedCommand(root, parseCli(["agent", "status"]))).toBe(true);

    const activeFile = path.join(root, ".rph", "agents", "active.json");
    expect(fs.existsSync(activeFile)).toBe(true);
    expect(JSON.parse(fs.readFileSync(activeFile, "utf8"))).toMatchObject({
      name: "test-automator"
    });

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("test-automator");
    expect(output).toMatch(/active custom agent|next role hint/i);
  });

  it("renders the active imported TOML profile for agent chat prompts without weakening RPH policy", async () => {
    expect(await runParsedCommand(root, parseCli(["agent", "import", SAMPLE_AGENT_TOML]))).toBe(true);
    expect(await runParsedCommand(root, parseCli(["agent", "use", "test-automator"]))).toBe(true);

    const prompt = renderActiveCustomAgentPrompt(root);

    expect(prompt).toContain("test-automator:");
    expect(prompt).toContain("Own test automation engineering work");
    expect(prompt).toContain("do not override RPH approval gates");
  });

  it("injects the active imported TOML profile into agent turn prompts", async () => {
    expect(await runParsedCommand(root, parseCli(["agent", "import", SAMPLE_AGENT_TOML]))).toBe(true);
    expect(await runParsedCommand(root, parseCli(["agent", "use", "test-automator"]))).toBe(true);
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body ?? "{}")) as {
        input?: string;
        model?: string;
        reasoning?: { effort?: string };
      };
      expect(payload.model).toBe("gpt-5.3-codex-spark");
      expect(payload.reasoning?.effort).toBe("medium");
      expect(payload.input).toContain("Custom TOML execution profile:");
      expect(payload.input).toContain("test-automator: active project default");
      expect(payload.input).toContain("do not override RPH approval gates");
      return new Response(JSON.stringify({
        output: [{
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify({ action: { type: "respond", message: "ok" } }) }]
        }]
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeAgentTurn({
      projectRoot: root,
      sessionId: "session-custom-agent-prompt",
      userInput: "테스트 역할로 현재 상황을 봐줘",
      config: createHarnessConfig({ OPENAI_API_KEY: "test-openai" } as NodeJS.ProcessEnv),
      env: { OPENAI_API_KEY: "test-openai" } as NodeJS.ProcessEnv
    });

    expect(result.text).toBe("ok");
    expect(result.result.model).toBe("gpt-5.3-codex-spark");
    expect(result.result.executionProfile).toMatchObject({
      name: "test-automator",
      model: "gpt-5.3-codex-spark",
      modelReasoningEffort: "medium",
      sandboxMode: "workspace-write"
    });
    expect(result.turn.executionProfile).toMatchObject({
      source: "custom-toml",
      name: "test-automator",
      slug: "test-automator"
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("records the active imported TOML profile on lane run evidence", async () => {
    expect(await runParsedCommand(root, parseCli(["agent", "import", SAMPLE_AGENT_TOML]))).toBe(true);
    expect(await runParsedCommand(root, parseCli(["agent", "use", "test-automator"]))).toBe(true);

    const run = startAgentLaneRun(root, {
      sessionId: "session-custom-agent-lane",
      handoffId: "handoff-custom-agent-lane",
      packet: {
        fromAgent: "Orchestrator",
        toAgent: "PM",
        stage: "SETUP",
        summary: "Use the active custom profile for this lane.",
        acceptanceCriteria: ["lane records active TOML profile"],
        artifactRefs: [],
        createdAt: "2026-01-01T00:00:00.000Z"
      },
      command: "/pm start"
    });

    expect(run.executionProfile).toMatchObject({
      source: "custom-toml",
      name: "test-automator",
      slug: "test-automator"
    });
    expect(run.executionProfile?.model).toBeTruthy();
    expect(run.systemPrompt).toContain("Active custom TOML agent: test-automator");
    expect(run.systemPrompt).toContain("sandbox=");
  });

  it("binds imported TOML agents to lane roles and stages with active fallback", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(await runParsedCommand(root, parseCli(["agent", "import", CLI_DEVELOPER_TOML]))).toBe(true);
    expect(await runParsedCommand(root, parseCli(["agent", "import", QA_EXPERT_TOML]))).toBe(true);
    expect(await runParsedCommand(root, parseCli(["agent", "import", SAMPLE_AGENT_TOML]))).toBe(true);
    expect(await runParsedCommand(root, parseCli(["agent", "use", "cli-developer"]))).toBe(true);
    expect(await runParsedCommand(root, parseCli(parseCommandLine("/agent bind qa-expert --role QA")), false)).toBe(true);
    expect(await runParsedCommand(root, parseCli(parseCommandLine("/agent bind test-automator --stage QA_REVIEW")), false)).toBe(true);
    expect(await runParsedCommand(root, parseCli(["agent", "bindings"]))).toBe(true);

    const bindingFile = path.join(root, ".rph", "agents", "lane-bindings.json");
    const bindingText = fs.readFileSync(bindingFile, "utf8");
    expect(bindingText).toContain("\"profileSlug\": \"qa-expert\"");
    expect(bindingText).toContain("\"profileSlug\": \"test-automator\"");
    expect(bindingText).toContain("\"profileFingerprint\"");
    expect(bindingText).not.toContain("/Users/king/Desktop/awesome-codex-subagents");

    const stageRun = startAgentLaneRun(root, {
      sessionId: "session-bound-stage",
      handoffId: "handoff-bound-stage",
      packet: {
        fromAgent: "Orchestrator",
        toAgent: "QA",
        stage: "QA_REVIEW",
        summary: "Stage binding should win over role binding.",
        acceptanceCriteria: ["stage binding wins"],
        artifactRefs: [],
        createdAt: "2026-01-01T00:00:00.000Z"
      },
      command: "/qa review"
    });
    expect(stageRun.executionProfile).toMatchObject({
      name: "test-automator",
      slug: "test-automator",
      binding: {
        id: "lane:*:QA_REVIEW",
        stage: "QA_REVIEW"
      }
    });
    expect(stageRun.systemPrompt).toContain("Own test automation engineering work");
    expect(stageRun.systemPrompt).not.toContain("Own quality assurance planning work");

    const roleRun = startAgentLaneRun(root, {
      sessionId: "session-bound-role",
      handoffId: "handoff-bound-role",
      packet: {
        fromAgent: "Orchestrator",
        toAgent: "QA",
        stage: "RELEASE_REVIEW",
        summary: "Role binding should win when no stage binding exists.",
        acceptanceCriteria: ["role binding wins"],
        artifactRefs: [],
        createdAt: "2026-01-01T00:00:00.000Z"
      },
      command: "/qa review"
    });
    expect(roleRun.executionProfile).toMatchObject({
      name: "qa-expert",
      slug: "qa-expert",
      sandboxMode: "read-only",
      binding: {
        id: "lane:QA:*",
        role: "QA"
      }
    });
    expect(roleRun.systemPrompt).toContain("Own quality assurance planning work");

    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body ?? "{}")) as { input?: string; model?: string; reasoning?: { effort?: string } };
      expect(payload.model).toBe("gpt-5.4");
      expect(payload.reasoning?.effort).toBe("high");
      expect(payload.input).toContain("Custom TOML execution profile:");
      expect(payload.input).toContain("bound lane:QA:*");
      expect(payload.input).toContain("Own quality assurance planning work");
      return new Response(JSON.stringify({
        output: [{
          type: "message",
          content: [{ type: "output_text", text: JSON.stringify({ action: { type: "respond", message: "qa lane ready" } }) }]
        }]
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const turnResult = await executeAgentTurn({
      projectRoot: root,
      sessionId: "session-bound-role-turn",
      userInput: "Run this QA lane as the bound profile.",
      config: createHarnessConfig({ OPENAI_API_KEY: "test-openai" } as NodeJS.ProcessEnv),
      executionProfile: roleRun.executionProfile,
      env: { OPENAI_API_KEY: "test-openai" } as NodeJS.ProcessEnv
    });
    expect(turnResult.text).toBe("qa lane ready");
    expect(turnResult.result.executionProfile).toMatchObject({
      name: "qa-expert",
      slug: "qa-expert",
      model: "gpt-5.4",
      modelReasoningEffort: "high",
      binding: {
        id: "lane:QA:*"
      }
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const fallbackRun = startAgentLaneRun(root, {
      sessionId: "session-bound-fallback",
      handoffId: "handoff-bound-fallback",
      packet: {
        fromAgent: "Orchestrator",
        toAgent: "FE",
        stage: "FE_SPEC",
        summary: "Unbound lanes should use active project default.",
        acceptanceCriteria: ["active fallback"],
        artifactRefs: [],
        createdAt: "2026-01-01T00:00:00.000Z"
      },
      command: "/fe spec"
    });
    expect(fallbackRun.executionProfile).toMatchObject({
      name: "cli-developer",
      slug: "cli-developer"
    });
    expect(fallbackRun.executionProfile?.binding).toBeUndefined();

    const output = logSpy.mock.calls.flat().join("\n");
    expect(output).toContain("agent binding saved: lane role=QA stage=* profile=qa-expert");
    expect(output).toContain("agent binding saved: lane role=* stage=QA_REVIEW profile=test-automator");
    expect(output).toContain("Custom agent lane bindings");
  });

  it("fails closed when a lane binding points at a missing or changed profile", async () => {
    expect(await runParsedCommand(root, parseCli(["agent", "import", QA_EXPERT_TOML]))).toBe(true);
    expect(await runParsedCommand(root, parseCli(parseCommandLine("/agent bind qa-expert --role QA")), false)).toBe(true);

    const bindingFile = path.join(root, ".rph", "agents", "lane-bindings.json");
    const registry = JSON.parse(fs.readFileSync(bindingFile, "utf8")) as { bindings: Array<Record<string, unknown>> };
    delete registry.bindings[0].profileFingerprint;
    fs.writeFileSync(bindingFile, `${JSON.stringify(registry, null, 2)}\n`);
    expect(() => startAgentLaneRun(root, {
      sessionId: "session-missing-fingerprint",
      handoffId: "handoff-missing-fingerprint",
      packet: {
        fromAgent: "Orchestrator",
        toAgent: "QA",
        stage: "QA_REVIEW",
        summary: "Missing binding fingerprint must not silently run.",
        acceptanceCriteria: ["fail closed"],
        artifactRefs: [],
        createdAt: "2026-01-01T00:00:00.000Z"
      },
      command: "/qa review"
    })).toThrow(/missing a fingerprint/);

    expect(await runParsedCommand(root, parseCli(parseCommandLine("/agent bind qa-expert --role QA")), false)).toBe(true);
    const qaProfileFile = path.join(root, ".rph", "agents", "qa-expert.json");
    const stored = JSON.parse(fs.readFileSync(qaProfileFile, "utf8")) as { developerInstructions: string };
    stored.developerInstructions = `${stored.developerInstructions}\nChanged after binding.`;
    fs.writeFileSync(qaProfileFile, `${JSON.stringify(stored, null, 2)}\n`);
    expect(() => startAgentLaneRun(root, {
      sessionId: "session-stale-binding",
      handoffId: "handoff-stale-binding",
      packet: {
        fromAgent: "Orchestrator",
        toAgent: "QA",
        stage: "QA_REVIEW",
        summary: "Changed binding target must not silently run.",
        acceptanceCriteria: ["fail closed"],
        artifactRefs: [],
        createdAt: "2026-01-01T00:00:00.000Z"
      },
      command: "/qa review"
    })).toThrow(/binding is stale/);

    fs.unlinkSync(qaProfileFile);
    expect(() => startAgentLaneRun(root, {
      sessionId: "session-broken-binding",
      handoffId: "handoff-broken-binding",
      packet: {
        fromAgent: "Orchestrator",
        toAgent: "QA",
        stage: "QA_REVIEW",
        summary: "Broken binding must not silently fall back.",
        acceptanceCriteria: ["fail closed"],
        artifactRefs: [],
        createdAt: "2026-01-01T00:00:00.000Z"
      },
      command: "/qa review"
    })).toThrow(/binding is broken/);
  });

  it("blocks bound read-only lane fallback commands with the same sandbox gate", async () => {
    expect(await runParsedCommand(root, parseCli(["agent", "import", QA_EXPERT_TOML]))).toBe(true);
    expect(await runParsedCommand(root, parseCli(parseCommandLine("/agent bind qa-expert --role QA")), false)).toBe(true);

    const run = startAgentLaneRun(root, {
      sessionId: "session-bound-read-only-fallback",
      handoffId: "handoff-bound-read-only-fallback",
      packet: {
        fromAgent: "Orchestrator",
        toAgent: "QA",
        stage: "SETUP",
        summary: "Providerless fallback must still obey bound QA sandbox.",
        acceptanceCriteria: ["read-only bound profile blocks mutating fallback"],
        blockers: [],
        artifactRefs: [],
        nextCommand: "/qa review",
        createdAt: "2026-01-01T00:00:00.000Z"
      },
      command: "/qa review"
    });
    expect(run.executionProfile).toMatchObject({
      slug: "qa-expert",
      sandboxMode: "read-only",
      binding: {
        id: "lane:QA:*"
      }
    });
    expect(executionProfileSandboxCommandBlocker(run.executionProfile, "/qa review")).toBe(
      "qa-expert sandbox_mode=read-only allows read-only commands only; proposed command was /qa review"
    );
    expect(executionProfileSandboxCommandBlocker(run.executionProfile, "/status")).toBeUndefined();
  });

  it("fails safely for missing files and malformed TOML imports", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const missingPath = path.join(root, "missing-agent.toml");
    const malformedPath = path.join(root, "broken-agent.toml");
    fs.writeFileSync(malformedPath, "name = \nmodel = [");

    const missingOk = await runParsedCommand(root, parseCli(["agent", "import", missingPath]));
    expect(missingOk).toBe(false);
    expect(process.exitCode).toBe(1);

    process.exitCode = 0;
    const malformedOk = await runParsedCommand(root, parseCli(["agent", "import", malformedPath]));
    expect(malformedOk).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(errorSpy.mock.calls.flat().join("\n")).toMatch(/missing|not found|toml|parse/i);
  });

  it("fails safely when importing an unknown library agent name", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const ok = await runParsedCommand(root, parseCli(["agent", "import", "not-a-real-awesome-agent"]));

    expect(ok).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(fs.existsSync(path.join(root, ".rph", "agents", "not-a-real-awesome-agent.json"))).toBe(false);
    expect(errorSpy.mock.calls.flat().join("\n")).toContain("agent not found in Awesome Codex Subagents library");
  });
});
