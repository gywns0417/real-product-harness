import { afterEach, describe, expect, it, vi } from "vitest";
import { testAiConnection } from "../packages/core/src/connections";
import { createHarnessConfig } from "../packages/core/src/settings";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AI readiness", () => {
  it("proves OpenAI readiness with a real generation smoke step", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const endpoint = String(url);
      if (endpoint.endsWith("/models")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: "OK"
              }
            ]
          }
        ]
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      OPENAI_API_KEY: "openai-secret"
    } as NodeJS.ProcessEnv;
    const config = createHarnessConfig(env);

    const result = await testAiConnection(config, "openai", env);

    expect(result.status).toBe("passed");
    expect(result.endpoint).toBe("https://api.openai.com/v1/responses");
    expect(result.message).toContain("generation: smoke passed");
    expect(result.readiness?.provenStage).toBe("protocol-tool-call");
    expect(result.readiness?.stages).toMatchObject([
      {
        stage: "transport",
        status: "passed"
      },
      {
        stage: "credential-probe",
        status: "passed",
        endpoint: "https://api.openai.com/v1/models"
      },
      {
        stage: "protocol-tool-call",
        status: "passed",
        endpoint: "https://api.openai.com/v1/responses"
      }
    ]);
  });

  it("fails readiness when the model catalog works but generation fails", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const endpoint = String(url);
      if (endpoint.endsWith("/models")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ output: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const env = {
      OPENAI_API_KEY: "openai-secret"
    } as NodeJS.ProcessEnv;
    const config = createHarnessConfig(env);

    const result = await testAiConnection(config, "openai", env);

    expect(result.status).toBe("failed");
    expect(result.readiness?.provenStage).toBe("credential-probe");
    expect(result.readiness?.stages.find((stage) => stage.stage === "protocol-tool-call")?.status).toBe("failed");
  });
});
