import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { testMcpConnection } from "../packages/core/src/connections";
import { callMcpTool, listMcpTools } from "../packages/core/src/mcp-client";
import { createHarnessConfig } from "../packages/core/src/settings";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MCP readiness", () => {
  it("marks config failures at the transport stage", async () => {
    const config = createHarnessConfig({
      GITHUB_TOKEN: "github-secret"
    } as NodeJS.ProcessEnv);

    const result = await testMcpConnection(config, "github", {
      GITHUB_TOKEN: "github-secret"
    } as NodeJS.ProcessEnv);

    expect(result.status).toBe("skipped");
    expect(result.readiness).toMatchObject({
      mode: "unverified",
      provenStage: "none",
      stages: [
        {
          stage: "transport",
          status: "skipped"
        },
        {
          stage: "credential-probe",
          status: "skipped"
        },
        {
          stage: "protocol-tools-list",
          status: "skipped"
        }
      ]
    });
  });

  it("marks REST adapters as credential-ready but protocol not applicable", async () => {
    const ghBin = writeFakeGh("openai/real-product-harness", "WRITE");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      id: 987654,
      full_name: "openai/real-product-harness"
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      GITHUB_TOKEN: "github-secret",
      GITHUB_OWNER: "openai",
      GITHUB_REPO: "real-product-harness",
      RPH_GH_BIN: ghBin
    } as NodeJS.ProcessEnv;
    const config = createHarnessConfig(env);

    const result = await testMcpConnection(config, "github", env);

    expect(result.status).toBe("passed");
    expect(result.message).toContain("credential: credential probe passed (200)");
    expect(result.message).toContain("protocol: not applicable");
    expect(result.identity).toMatchObject({
      type: "github-repo",
      label: "openai/real-product-harness",
      targetId: "openai/real-product-harness",
      verifiedBy: "credential-probe",
      source: "configuration"
    });
    expect(result.firstActionProof).toMatchObject({
      action: "github.target_read",
      targetId: "openai/real-product-harness",
      verifiedBy: "credential-probe",
      endpoint: "https://api.github.com/repos/openai/real-product-harness"
    });
    expect(result.readiness).toMatchObject({
      mode: "adapter-write-ready",
      provenStage: "credential-probe",
      stages: [
        {
          stage: "transport",
          status: "passed"
        },
        {
          stage: "credential-probe",
          status: "passed",
          endpoint: "https://api.github.com/repos/openai/real-product-harness"
        },
        {
          stage: "external-write",
          status: "passed"
        },
        {
          stage: "protocol-tools-list",
          status: "not-applicable"
        }
      ]
    });
    expect(result.policy).toMatchObject({
      kind: "rest-adapter-readback",
      state: "proved-now",
      satisfied: true,
      requiredTrust: "adapter-ready:credential-probe",
      actualTrust: "adapter-write-ready:credential-probe",
      allowReadOnlyToolCall: false,
      agentReadOnlyTools: []
    });
    expect(fetchMock).toHaveBeenCalledWith("https://api.github.com/repos/openai/real-product-harness", expect.objectContaining({
      method: "GET"
    }));
  });

  it("uses a gh-cli token source for GitHub REST and write readiness without persisting GITHUB_TOKEN", async () => {
    const ghBin = writeFakeGh("openai/real-product-harness", "WRITE");
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      if (headers.Authorization !== "Bearer github-secret") {
        return new Response(JSON.stringify({ message: "bad credentials" }), { status: 401 });
      }
      return new Response(JSON.stringify({
        id: 987654,
        full_name: "openai/real-product-harness"
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      GITHUB_TOKEN_SOURCE: "gh-cli",
      GITHUB_OWNER: "openai",
      GITHUB_REPO: "real-product-harness",
      RPH_GH_BIN: ghBin
    } as NodeJS.ProcessEnv;
    const config = createHarnessConfig(env);

    expect(config.mcpServers.github.configured).toBe(true);
    expect(config.mcpServers.github.missingEnv).not.toContain("GITHUB_TOKEN");
    const result = await testMcpConnection(config, "github", env);

    expect(result.status).toBe("passed");
    expect(result.readiness?.mode).toBe("adapter-write-ready");
    expect(fetchMock).toHaveBeenCalledWith("https://api.github.com/repos/openai/real-product-harness", expect.objectContaining({
      method: "GET"
    }));
  });

  it("fails GitHub readiness when REST read passes but gh write permission is read-only", async () => {
    const ghBin = writeFakeGh("openai/real-product-harness", "READ");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      id: 987654,
      full_name: "openai/real-product-harness"
    }), { status: 200 })));
    const env = {
      GITHUB_TOKEN: "github-secret",
      GITHUB_OWNER: "openai",
      GITHUB_REPO: "real-product-harness",
      RPH_GH_BIN: ghBin
    } as NodeJS.ProcessEnv;

    const result = await testMcpConnection(createHarnessConfig(env), "github", env);

    expect(result.status).toBe("failed");
    expect(result.message).toContain("github-cli: gh repo permission READ is not write-capable");
    expect(result.readiness).toMatchObject({
      mode: "adapter-partial",
      provenStage: "credential-probe"
    });
    expect(result.readiness?.stages).toEqual(expect.arrayContaining([
      expect.objectContaining({ stage: "credential-probe", status: "passed" }),
      expect.objectContaining({ stage: "external-write", status: "failed" }),
      expect.objectContaining({ stage: "protocol-tools-list", status: "not-applicable" })
    ]));
    expect(result.policy).toMatchObject({
      state: "allowed-now",
      satisfied: false,
      actualTrust: "adapter-partial:credential-probe"
    });
  });

  it("probes Notion and Figma target resources instead of only account identity", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "target" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const notionEnv = {
      NOTION_TOKEN: "notion-secret",
      NOTION_PARENT_PAGE_ID: "https://www.notion.so/workspace/Page-1234567890abcdef1234567890abcdef?pvs=4"
    } as NodeJS.ProcessEnv;
    const notion = await testMcpConnection(createHarnessConfig(notionEnv), "notion", notionEnv);
    expect(notion.status).toBe("passed");
    expect(notion.identity).toMatchObject({
      type: "notion-page",
      label: "Notion page 123456...abcdef",
      targetId: "12345678-90ab-cdef-1234-567890abcdef",
      verifiedBy: "credential-probe"
    });
    expect(notion.firstActionProof).toMatchObject({
      action: "notion.target_read",
      targetId: "12345678-90ab-cdef-1234-567890abcdef",
      verifiedBy: "credential-probe",
      endpoint: "https://api.notion.com/v1/pages/12345678-90ab-cdef-1234-567890abcdef"
    });
    expect(fetchMock).toHaveBeenCalledWith("https://api.notion.com/v1/pages/12345678-90ab-cdef-1234-567890abcdef", expect.objectContaining({
      method: "GET"
    }));

    const figmaEnv = {
      FIGMA_TOKEN: "figma-secret",
      FIGMA_FILE_ID: "https://www.figma.com/design/file_123/Product?node-id=1-2"
    } as NodeJS.ProcessEnv;
    const figma = await testMcpConnection(createHarnessConfig(figmaEnv), "figma", figmaEnv);
    expect(figma.status).toBe("passed");
    expect(figma.identity).toMatchObject({
      type: "figma-file",
      label: "Figma file file_123",
      targetId: "file_123",
      verifiedBy: "credential-probe"
    });
    expect(figma.firstActionProof).toMatchObject({
      action: "figma.target_read",
      targetId: "file_123",
      verifiedBy: "credential-probe",
      endpoint: "https://api.figma.com/v1/files/file_123?depth=1"
    });
    expect(fetchMock).toHaveBeenCalledWith("https://api.figma.com/v1/files/file_123?depth=1", expect.objectContaining({
      method: "GET"
    }));
  });

  it("proves Stitch readiness with a read-only tools/call canary", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        method?: string;
        id?: string;
        params?: { arguments?: Record<string, unknown> };
      };
      if (body.method === "initialize") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: { listChanged: true } },
            serverInfo: { name: "stitch", version: "test" }
          }
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "Mcp-Session-Id": "session-123"
          }
        });
      }
      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      if (body.method === "tools/list") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [
              {
                name: "echo",
                annotations: { readOnlyHint: true }
              }
            ]
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (body.method === "tools/call") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            content: [{ type: "text", text: `echo:${body.params?.arguments?.text ?? ""}` }],
            isError: false
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, error: { code: -32601, message: "method not found" } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      STITCH_API_KEY: "stitch-secret"
    } as NodeJS.ProcessEnv;
    const config = createHarnessConfig(env);

    const result = await testMcpConnection(config, "stitch", env);

    expect(result.status).toBe("passed");
    expect(result.message).toContain("credential: MCP initialize accepted");
    expect(result.message).toContain("protocol: tools/list passed (1 tools); tools/call passed (echo)");
    expect(result.identity).toMatchObject({
      type: "mcp-server",
      label: "stitch",
      targetId: "stitch",
      verifiedBy: "protocol-tool-call",
      source: "configuration"
    });
    expect(result.firstActionProof).toMatchObject({
      action: "mcp.tools.call",
      targetId: "stitch:echo",
      verifiedBy: "protocol-tool-call",
      endpoint: "https://stitch.googleapis.com/mcp"
    });
    expect(result.readiness).toMatchObject({
      mode: "protocol-ready",
      provenStage: "protocol-tool-call",
      stages: [
        {
          stage: "transport",
          status: "passed"
        },
        {
          stage: "credential-probe",
          status: "passed"
        },
        {
          stage: "protocol-tools-list",
          status: "passed",
          endpoint: "https://stitch.googleapis.com/mcp"
        },
        {
          stage: "protocol-tool-call",
          status: "passed",
          endpoint: "https://stitch.googleapis.com/mcp"
        }
      ]
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(fetchMock).toHaveBeenLastCalledWith("https://stitch.googleapis.com/mcp", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "rph-tools-call",
        method: "tools/call",
        params: {
          name: "echo",
          arguments: {
            text: "rph-readiness-probe"
          }
        }
      })
    }));
    expect(fetchMock.mock.calls[5][1]?.headers).toMatchObject({
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18",
      "Mcp-Session-Id": "session-123",
      "X-Goog-Api-Key": "stitch-secret"
    });
  });

  it.each([
    ["omits readOnlyHint", undefined, "stitch MCP tool is not explicitly verified read-only by current tools/list metadata: echo"],
    ["marks destructiveHint", { readOnlyHint: true, destructiveHint: true }, "stitch MCP tool is marked destructive by current tools/list metadata: echo"]
  ])("fails Stitch read-only canary when probe metadata %s", async (_label, annotations, expectedMessage) => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        method?: string;
        id?: string;
      };
      if (body.method === "initialize") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: { listChanged: true } },
            serverInfo: { name: "stitch", version: "test" }
          }
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "Mcp-Session-Id": "session-unsafe"
          }
        });
      }
      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      if (body.method === "tools/list") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [{
              name: "echo",
              ...(annotations ? { annotations } : {})
            }]
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`tools/call must not run when readiness metadata is unsafe; got ${body.method ?? "unknown"}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      STITCH_API_KEY: "stitch-secret"
    } as NodeJS.ProcessEnv;
    const config = createHarnessConfig(env);

    const result = await testMcpConnection(config, "stitch", env);

    expect(result.status).toBe("failed");
    expect(result.message).toContain(expectedMessage);
    expect(result.firstActionProof).toBeUndefined();
    expect(result.readiness).toMatchObject({
      mode: "protocol-partial",
      provenStage: "protocol-tools-list",
      stages: [
        { stage: "transport", status: "passed" },
        { stage: "credential-probe", status: "passed" },
        { stage: "protocol-tools-list", status: "passed" },
        { stage: "protocol-tool-call", status: "failed", message: expectedMessage }
      ]
    });
  });

  it("sends Authorization bearer auth for custom protocol MCP readiness checks", async () => {
    const methods: string[] = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string; id?: string };
      if (body.method) {
        methods.push(body.method);
      }
      expect(init?.headers).toMatchObject({ Authorization: "Bearer custom-secret" });
      expect(init?.headers).not.toMatchObject({ "X-Goog-Api-Key": expect.any(String) });
      if (body.method === "initialize") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "custom-echo", version: "test" }
          }
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "Mcp-Session-Id": "session-custom"
          }
        });
      }
      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          tools: [{ name: "custom.echo" }]
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = { CUSTOM_ECHO_MCP_TOKEN: "custom-secret" } as NodeJS.ProcessEnv;
    const config = createHarnessConfig(env);
    config.mcpServers["custom-echo"] = {
      id: "custom-echo",
      name: "Custom Echo",
      kind: "mcp-server",
      enabled: true,
      configured: true,
      transport: "http",
      url: "https://mcp.example.test/echo",
      authMode: "bearer",
      authEnvKey: "CUSTOM_ECHO_MCP_TOKEN",
      protocolReadiness: "tools/list",
      custom: true,
      envKeys: ["CUSTOM_ECHO_MCP_TOKEN"],
      missingEnv: [],
      warnings: [],
      notes: "Custom echo protocol server."
    };

    const result = await testMcpConnection(config, "custom-echo", env);

    expect(result.status).toBe("passed");
    expect(result.readiness?.provenStage).toBe("protocol-tools-list");
    expect(methods).toEqual(["initialize", "notifications/initialized", "tools/list"]);
    expect(fetchMock).toHaveBeenCalledWith("https://mcp.example.test/echo", expect.objectContaining({
      method: "POST"
    }));
  });

  it("proves opt-in custom protocol MCP readiness with a read-only tools/call probe", async () => {
    const methods: string[] = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        method?: string;
        id?: string;
        params?: { name?: string; arguments?: Record<string, unknown> };
      };
      if (body.method) {
        methods.push(body.method);
      }
      expect(init?.headers).toMatchObject({ Authorization: "Bearer custom-secret" });
      if (body.method === "initialize") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "custom-echo", version: "test" }
          }
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "Mcp-Session-Id": "session-custom"
          }
        });
      }
      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      if (body.method === "tools/list") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [{ name: "custom.echo", annotations: { readOnlyHint: true } }]
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      expect(body.method).toBe("tools/call");
      expect(body.params).toEqual({
        name: "custom.echo",
        arguments: { text: "hello" }
      });
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          content: [{ type: "text", text: "hello" }],
          isError: false
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = { CUSTOM_ECHO_MCP_TOKEN: "custom-secret" } as NodeJS.ProcessEnv;
    const config = createHarnessConfig(env);
    config.mcpServers["custom-echo"] = {
      id: "custom-echo",
      name: "Custom Echo",
      kind: "mcp-server",
      enabled: true,
      configured: true,
      transport: "http",
      url: "https://mcp.example.test/echo",
      authMode: "bearer",
      authEnvKey: "CUSTOM_ECHO_MCP_TOKEN",
      protocolReadiness: "tools/call",
      protocolToolCallProbe: {
        toolName: "custom.echo",
        arguments: { text: "hello" }
      },
      agentReadOnlyTools: ["custom.echo"],
      custom: true,
      envKeys: ["CUSTOM_ECHO_MCP_TOKEN"],
      missingEnv: [],
      warnings: [],
      notes: "Custom echo protocol server."
    };

    const result = await testMcpConnection(config, "custom-echo", env);

    expect(result.status).toBe("passed");
    expect(result.message).toContain("tools/call passed (custom.echo)");
    expect(result.identity).toMatchObject({
      verifiedBy: "protocol-tool-call"
    });
    expect(result.firstActionProof).toMatchObject({
      action: "mcp.tools.call",
      targetId: "custom-echo:custom.echo",
      verifiedBy: "protocol-tool-call"
    });
    expect(result.readiness).toMatchObject({
      mode: "protocol-ready",
      provenStage: "protocol-tool-call",
      stages: [
        { stage: "transport", status: "passed" },
        { stage: "credential-probe", status: "passed" },
        { stage: "protocol-tools-list", status: "passed" },
        { stage: "protocol-tool-call", status: "passed" }
      ]
    });
    expect(result.policy).toMatchObject({
      kind: "read-only-probe",
      state: "proved-now",
      satisfied: true,
      requiredTrust: "protocol-ready:protocol-tool-call",
      actualTrust: "protocol-ready:protocol-tool-call",
      allowReadOnlyToolCall: true,
      agentReadOnlyTools: ["custom.echo"],
      requiredTools: ["custom.echo"],
      missingTools: []
    });
    expect(methods).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/list",
      "initialize",
      "notifications/initialized",
      "tools/call"
    ]);
  });

  it("fails custom tools/call readiness when the probe is not allowlisted", async () => {
    const methods: string[] = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string; id?: string };
      if (body.method) {
        methods.push(body.method);
      }
      if (body.method === "initialize") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "custom-echo", version: "test" }
          }
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "Mcp-Session-Id": "session-custom"
          }
        });
      }
      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      if (body.method === "tools/list") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: { tools: [{ name: "custom.echo" }] }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: { message: "unexpected tools/call" } }), { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = { CUSTOM_ECHO_MCP_TOKEN: "custom-secret" } as NodeJS.ProcessEnv;
    const config = createHarnessConfig(env);
    config.mcpServers["custom-echo"] = {
      id: "custom-echo",
      name: "Custom Echo",
      kind: "mcp-server",
      enabled: true,
      configured: true,
      transport: "http",
      url: "https://mcp.example.test/echo",
      authMode: "bearer",
      authEnvKey: "CUSTOM_ECHO_MCP_TOKEN",
      protocolReadiness: "tools/call",
      protocolToolCallProbe: {
        toolName: "custom.echo",
        arguments: { text: "hello" }
      },
      agentReadOnlyTools: [],
      custom: true,
      envKeys: ["CUSTOM_ECHO_MCP_TOKEN"],
      missingEnv: [],
      warnings: [],
      notes: "Custom echo protocol server."
    };

    const result = await testMcpConnection(config, "custom-echo", env);

    expect(result.status).toBe("failed");
    expect(result.message).toContain("custom.echo is not in the agent read-only allowlist");
    expect(result.policy).toMatchObject({
      kind: "read-only-probe",
      state: "blocked-by-policy",
      satisfied: false,
      requiredTools: ["custom.echo"],
      missingTools: ["custom.echo"],
      allowReadOnlyToolCall: false
    });
    expect(methods).toEqual(["initialize", "notifications/initialized", "tools/list"]);
  });

  it("fails Stitch when tools/list does not return an MCP tool list", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string; id?: string };
      if (body.method === "initialize") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: {},
            serverInfo: { name: "stitch", version: "test" }
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 202 });
      }
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result: {}
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      STITCH_API_KEY: "stitch-secret"
    } as NodeJS.ProcessEnv;
    const config = createHarnessConfig(env);

    const result = await testMcpConnection(config, "stitch", env);

    expect(result.status).toBe("failed");
    expect(result.readiness).toMatchObject({
      mode: "protocol-partial",
      provenStage: "credential-probe",
      stages: [
        {
          stage: "transport",
          status: "passed"
        },
        {
          stage: "credential-probe",
          status: "passed"
        },
        {
          stage: "protocol-tools-list",
          status: "failed"
        }
      ]
    });
    expect(result.message).toContain("tools/list did not return an MCP tool list");
  });

  it("runs MCP initialize, initialized notification, tools/list, and tools/call with session headers", async () => {
    const seenMethods: string[] = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        method?: string;
        id?: string;
        params?: { name?: string; arguments?: Record<string, unknown> };
      };
      seenMethods.push(String(body.method));
      if (body.method === "initialize") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            protocolVersion: "2025-06-18",
            capabilities: { tools: {} },
            serverInfo: { name: "demo", version: "1" }
          }
        }), {
          status: 200,
          headers: {
            "content-type": "application/json",
            "Mcp-Session-Id": "session-abc"
          }
        });
      }
      if (body.method === "notifications/initialized") {
        expect(init?.headers).toMatchObject({ "Mcp-Session-Id": "session-abc" });
        return new Response(null, { status: 202 });
      }
      if (body.method === "tools/list") {
        expect(init?.headers).toMatchObject({ "Mcp-Session-Id": "session-abc" });
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: {
            tools: [{ name: "echo", description: "Echo input" }]
          }
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      expect(body.params).toEqual({
        name: "echo",
        arguments: { text: "hello" }
      });
      expect(init?.headers).toMatchObject({ "Mcp-Session-Id": "session-abc" });
      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          content: [{ type: "text", text: "hello" }],
          structuredContent: { text: "hello" },
          isError: false
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    });

    const list = await listMcpTools({
      endpoint: "https://example.test/mcp",
      apiKey: "secret",
      fetchImpl: fetchMock as unknown as typeof fetch
    });
    const call = await callMcpTool({
      endpoint: "https://example.test/mcp",
      apiKey: "secret",
      fetchImpl: fetchMock as unknown as typeof fetch
    }, "echo", { text: "hello" });

    expect(list.tools).toEqual([{ name: "echo", description: "Echo input", inputSchema: undefined }]);
    expect(call.structuredContent).toEqual({ text: "hello" });
    expect(seenMethods).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/list",
      "initialize",
      "notifications/initialized",
      "tools/call"
    ]);
  });
});

function writeFakeGh(repoName: string, viewerPermission: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rph-fake-gh-"));
  const filePath = path.join(dir, "gh");
  fs.writeFileSync(filePath, [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    "if [[ \"${1:-}\" == \"--version\" ]]; then",
    "  echo \"gh version 2.0.0\"",
    "  exit 0",
    "fi",
    "if [[ \"${1:-}\" == \"auth\" && \"${2:-}\" == \"status\" ]]; then",
    "  if [[ -z \"${GH_TOKEN:-}\" ]]; then",
    "    echo \"GH_TOKEN missing\" >&2",
    "    exit 1",
    "  fi",
    "  exit 0",
    "fi",
    "if [[ \"${1:-}\" == \"auth\" && \"${2:-}\" == \"token\" ]]; then",
    "  echo github-secret",
    "  exit 0",
    "fi",
    "if [[ \"${1:-}\" == \"repo\" && \"${2:-}\" == \"view\" && \"${3:-}\" == \"" + repoName + "\" ]]; then",
    "  cat <<'JSON'",
    JSON.stringify({ nameWithOwner: repoName, viewerPermission }),
    "JSON",
    "  exit 0",
    "fi",
    "echo \"unexpected gh args: $*\" >&2",
    "exit 1",
    ""
  ].join("\n"));
  fs.chmodSync(filePath, 0o755);
  return filePath;
}
