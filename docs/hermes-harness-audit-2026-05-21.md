# Hermes-Like Harness Audit - 2026-05-21

## 요약

현재 RPH는 "Hermes Agents처럼 최상위 레이어에서 제품 개발 흐름을 잡는 하네스"의 골격은 갖췄다. 하지만 아직 Hermes Agents급 운영체제는 아니다.

판정: 6/10 수준의 control-plane alpha.

이미 있는 것:
- `rph` 단일 명령 진입점
- slash command 기반 PM/PD/FE/BE/QA/GitHub/Notion 흐름
- `/setup auto` 기반 AI, MCP, GitHub, Notion, Stitch 연결 안내 및 일부 live probe
- OpenAI/Gemini/Notion/GitHub/Stitch read-only live 확인 경로
- `.rph` 로컬 상태, 승인, 문서, 실행 기록 저장 구조
- AI provider를 통한 대화형 shell
- GitHub repo 생성/라벨/이슈/PR 계획 경로
- 테스트, 린트, 빌드 통과 상태

부족한 것:
- 자연어 대화를 실제 작업 실행 계획과 실행으로 연결하는 agent loop
- MCP client transport/tool invocation 계층
- PM/PD/FE/BE 역할별 독립 agent contract
- 세션 resume/checkpoint/recovery graph
- stage별 delegated execution/subagent lifecycle
- live write/action 검증과 provider failover
- Figma/Stitch를 실제 제품 플로우에 쓰는 경로

## 이번에 가져온 subagent TOML

바탕화면의 `/Users/king/Desktop/awesome-codex-subagents/categories`에서 아래 TOML을 선별해 repo에 복사했다.

- `.codex/agents/workflow-orchestrator.toml`
- `.codex/agents/context-manager.toml`
- `.codex/agents/cli-developer.toml`
- `.codex/agents/mcp-developer.toml`
- `.codex/agents/llm-architect.toml`
- `.codex/agents/product-manager.toml`

선별 기준은 Hermes-like harness 판단에 직접 필요한 영역이다: workflow orchestration, context/state, CLI UX, MCP/provider 연결, LLM agent architecture, product fit.

## Subagent 감사 결과

### Workflow Orchestrator

판정: 6.4/10, watch.

RPH는 control plane, local state, approval gates, chat/slash separation이 있어 Hermes-like skeleton은 맞다. 하지만 executable delegation, session continuation, recovery graph가 없다.

핵심 개선:
- `.rph/runtime/current-session.json` 세션 manifest
- paused/cancelled/blocked 전역 guard
- stage별 delegation contract
- retry/rollback/replay recovery graph
- CLI router와 orchestration engine 분리

### Context Manager

repo 구조와 상태 저장 경로는 비교적 명확하다.

확인된 핵심 구조:
- `apps/cli/src/index.ts`: CLI runtime, command dispatch
- `packages/core/src/*`: state, docs, approvals, settings, AI, workflow
- `packages/integrations/src/*`: Notion, MCP config 등 외부 연결
- `.rph/*`: project/state/config/documents/approvals/runtime/ai records

리스크:
- runtime context는 존재하지만, 장기 세션 기억과 재수화가 약하다.
- role별 agent가 같은 state summary에 의존하고, 이전 승인 문서 전문을 충분히 읽지 않는다.

### CLI Developer

가장 큰 CLI 문제:
- unknown command가 실패가 아니라 help + exit 0으로 끝난다.
- `/setup auto --from-env`가 detect/check/apply 의미를 섞고 side effect를 만든다.
- help가 너무 넓고 topic별 안내가 없다.

개선:
- `rph --version`, `rph help <topic>`, `rph status --json`
- unknown command exit 2 + suggestion
- `setup detect`, `setup apply`, `setup check --live` 분리
- `rph ask`, `rph chat --stdin` 같은 대화형 진입점 강화

### MCP Developer

가장 위험한 부분:
- 현재 `MCP`라는 이름이 실제 구현과 섞여 있다. Notion/GitHub/Figma는 상당 부분 REST/API adapter인데 MCP client config처럼 표현된다.
- Stitch URL이 `packages/integrations/src/mcp.ts`와 `packages/core/src/settings.ts`, `connections.ts`에서 다르다.
- env가 있으면 기본적으로 server enabled가 되는 구조라 least privilege가 약하다.
- GitHub repo 입력값 URL/slug 정규화 검증이 없다.
- Notion live write에 timeout/retry/JSON parse 보호가 없다.

확인된 live 상태:
- OpenAI 200
- Gemini 200
- Notion 200
- GitHub 200
- Stitch 200
- Anthropic/Figma는 미설정

주의: 이 확인은 대부분 read-only/auth/protocol probe다. 실제 provider별 write/action 성공까지 완전 검증된 상태는 아니다.

### LLM Architect

판정: 현재는 "single model call + state machine + approval gates"에 가깝다. agent operating system은 아니다.

핵심 결함:
- PM/PD/FE/BE 생성이 이전 승인 문서 본문을 충분히 읽지 않는다.
- 역할별 system prompt, required input, allowed tools, output schema가 분리돼 있지 않다.
- MCP tool loop가 없다.
- provider retry/failover가 없다.
- prompt/output/usage/latency/approval outcome tracing이 약하다.
- LLM 품질 eval이 없다.

필요한 구조:
- Context Assembler
- Role Agent Contract
- Tool/retrieval layer
- Trace + Eval
- Provider failover

### Product Manager

제품 판정:
- 지금 당장 팔 수 있는 것은 "문서/승인 게이트 중심의 로컬 product ops CLI alpha"다.
- 사용자가 원한 "Hermes Agents 같은 최상위 agent harness"는 아직 아니다.

Hermes-like로 인정받으려면:
- 사용자가 `/pm`, `/pd`, `/fe`, `/be`를 몰라도 되어야 한다.
- 자연어 한 문장이 plan -> execution -> artifact로 이어져야 한다.
- 최소 하나의 live external path가 실제로 성공해야 한다.
- idea -> PM doc -> spec -> issue/PR -> QA report까지 golden path가 한 번에 돌아야 한다.

## 현재 전체 진행상황

완료:
- repo 초기화 및 GitHub public repo 연결
- `rph` CLI 설치/실행 경로
- `/setup auto` wizard 1차 구현
- AI provider 설정/대화 shell 구현
- MCP/provider 설정 저장 및 secret 비저장 테스트
- GitHub/Notion/Stitch 일부 live probe
- PM/PD/FE/BE/QA/GitHub/Notion slash command surface
- 테스트, 린트, 빌드 통과
- selected subagent TOML 복사 및 6개 감사 subagent 실행

부분 완료:
- AI agent 연결: provider call은 가능하지만, 대화가 아직 작업 실행 agent loop는 아니다.
- MCP 연결: config/probe는 있지만 실제 MCP client tool loop는 없다.
- custom setting: env/config 저장은 되지만 masked input, validation, migration, profile 관리가 약하다.
- GitHub: repo/label/issue/PR 계획 경로는 있지만 자연어 agent가 자동으로 end-to-end 실행하는 형태는 아니다.

미완료:
- Hermes-like autonomous runtime
- multi-agent delegation runtime
- session resume/checkpoint/recovery
- natural language task execution
- real MCP tool invocation
- provider별 신규 credential 입력부터 live write/action 성공까지의 전수 검증
- Figma/Stitch 실사용 workflow

## 우선순위 로드맵

### P0

1. Natural-language agent loop
   - 사용자가 `rph`에서 그냥 말하면 intent를 분석한다.
   - 필요한 slash command를 내부 계획으로 변환한다.
   - 실행 전/후 artifact와 다음 action을 보여준다.

2. Context Assembler
   - 최신 승인 PM/PD/FE/BE 문서 본문을 읽는다.
   - approvals, blockers, GitHub/Notion state, recent run records를 prompt bundle에 넣는다.

3. Setup 분리
   - `setup detect`
   - `setup apply`
   - `setup check --live`
   - secret masked input
   - GitHub repo URL 정규화

4. CLI failure contract
   - unknown command exit 2
   - topic help
   - JSON status/check output

### P1

5. MCP contract 재정의
   - real MCP server와 REST adapter를 이름부터 분리한다.
   - Stitch endpoint 단일화
   - MCP handshake/tools/list/tool call 검증

6. Runtime session manifest
   - `.rph/runtime/current-session.json`
   - stage, owner, pending action, checkpoint, blocker, retry count
   - `resume`, `pause`, `cancel`, `rollback` 실동작

7. Role Agent Contract
   - PM/PD/FE/BE/QA/GitHub/Notion 역할별 prompt/input/tool/output schema
   - 각 role의 success check

### P2

8. Provider failover
   - same-provider retry
   - secondary provider fallback
   - deterministic template fallback

9. Live external workflows
   - GitHub issue/PR 실제 생성
   - Notion 실제 페이지 작성
   - Stitch/Figma 실제 tool/action 사용

10. Golden path eval
   - idea -> PM -> PD -> FE/BE spec -> GitHub issue/PR -> QA -> Notion sync
   - fixture 기반 회귀 테스트

## 결론

이 프로젝트는 사용자가 말한 방향을 향해 가고 있지만, 지금 상태를 Hermes Agents처럼 "최상위 agent harness"라고 부르기에는 이르다.

정확한 현재 명칭은:

> Real Product Harness: AI-assisted product workflow CLI with approval gates and early provider setup.

다음 목표 명칭은:

> Real Product Harness: natural-language agent control plane for product execution.

가장 먼저 해야 할 일은 slash command를 늘리는 것이 아니라, 자연어 대화를 실행 계획과 artifact 생성으로 연결하는 agent loop를 넣는 것이다.
