import { afterEach, describe, expect, it, vi } from "vitest";
import { testMcpConnection } from "../packages/core/src/connections";
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
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ resources: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      GITHUB_TOKEN: "github-secret",
      GITHUB_OWNER: "openai",
      GITHUB_REPO: "real-product-harness"
    } as NodeJS.ProcessEnv;
    const config = createHarnessConfig(env);

    const result = await testMcpConnection(config, "github", env);

    expect(result.status).toBe("passed");
    expect(result.message).toContain("credential: credential probe passed (200)");
    expect(result.message).toContain("protocol: not applicable");
    expect(result.readiness).toMatchObject({
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
          stage: "protocol-tools-list",
          status: "not-applicable"
        }
      ]
    });
    expect(fetchMock).toHaveBeenCalledWith("https://api.github.com/repos/openai/real-product-harness", expect.objectContaining({
      method: "GET"
    }));
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
    expect(fetchMock).toHaveBeenCalledWith("https://api.notion.com/v1/pages/12345678-90ab-cdef-1234-567890abcdef", expect.objectContaining({
      method: "GET"
    }));

    const figmaEnv = {
      FIGMA_TOKEN: "figma-secret",
      FIGMA_FILE_ID: "https://www.figma.com/design/file_123/Product?node-id=1-2"
    } as NodeJS.ProcessEnv;
    const figma = await testMcpConnection(createHarnessConfig(figmaEnv), "figma", figmaEnv);
    expect(figma.status).toBe("passed");
    expect(fetchMock).toHaveBeenCalledWith("https://api.figma.com/v1/files/file_123?depth=1", expect.objectContaining({
      method: "GET"
    }));
  });

  it("proves Stitch readiness with tools/list", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: "rph-connection-check",
      result: {
        tools: [
          {
            name: "render-ui"
          }
        ]
      }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      STITCH_API_KEY: "stitch-secret"
    } as NodeJS.ProcessEnv;
    const config = createHarnessConfig(env);

    const result = await testMcpConnection(config, "stitch", env);

    expect(result.status).toBe("passed");
    expect(result.message).toContain("credential: authenticated MCP request accepted (200)");
    expect(result.message).toContain("protocol: tools/list passed (200; 1 tools)");
    expect(result.readiness).toMatchObject({
      provenStage: "protocol-tools-list",
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
        }
      ]
    });
    expect(fetchMock).toHaveBeenCalledWith("https://stitch.googleapis.com/mcp", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "rph-connection-check",
        method: "tools/list",
        params: {}
      })
    }));
  });

  it("fails Stitch when tools/list does not return an MCP tool list", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: "rph-connection-check",
      result: {}
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      STITCH_API_KEY: "stitch-secret"
    } as NodeJS.ProcessEnv;
    const config = createHarnessConfig(env);

    const result = await testMcpConnection(config, "stitch", env);

    expect(result.status).toBe("failed");
    expect(result.readiness).toMatchObject({
      provenStage: "transport",
      stages: [
        {
          stage: "transport",
          status: "passed"
        },
        {
          stage: "credential-probe",
          status: "failed"
        },
        {
          stage: "protocol-tools-list",
          status: "failed"
        }
      ]
    });
    expect(result.message).toContain("tools/list did not return an MCP tool list");
  });
});
