# Hermes-Like Progress Report - 2026-05-22

## 판정

현재 RPH는 단순 CLI 묶음이 아니라 `rph` 최상위 런타임, AI 대화, stage graph, approval gate, handoff queue, role lane lifecycle, fan-out/fan-in reducer, setup/live gate를 가진 control-plane alpha다.

다만 강한 의미의 Hermes Agents급 multi-agent OS는 아직 완성이라고 보지 않는다. PM/PD/FE/BE lane은 durable lifecycle, role prompt, 독립 memory, 강제 tool budget, child process worker, batch concurrency, fan-in reducer handoff, claim token 기반 attempt ownership, dead-worker recovery, heartbeat lease renewal, worker-pool supervision surface, foreground/background persistent worker pool, macOS LaunchAgent service surface까지 갖기 시작했다. GitHub issue/PR artifact snapshot binding, MCP read-only tool contract binding, approval-scoped mutable MCP write/readback rail은 닫혔고, 남은 큰 축은 slot별 worker state, full durable DAG queue, provider별 실계정 live write canary coverage, 더 깊은 session hydration/recovery hardening이다.

현재 점수:
- top-level product harness: 8.6/10
- Hermes-like autonomous multi-agent runtime: 8.6/10

서브에이전트 감사의 평균 판정은 `Hermes-like shell/runtime`은 맞고, `Hermes-like agent fabric`은 병렬 scheduler, budget enforcement, fan-in reducer, persistent foreground worker pool이 들어가면서 alpha+ 수준으로 올라왔지만 아직 장기 autonomous OS는 아니라는 쪽이다.

## 2026-05-26 top-layer install/DX audit update

이번 추가 감사는 바탕화면 `awesome-codex-subagents`의 `dx-optimizer.toml`과 `test-automator.toml` 관점으로 진행했다. 두 감사 모두 읽기 전용으로 수행했고, 공통 결론은 다음과 같다.

- 현재 소스는 Hermes-like runtime 쪽으로 많이 진전됐지만, 사용자가 실제로 치는 전역 `rph`가 낡으면 `/workspace`, `status --json`, slash helper가 깨진다.
- 따라서 Hermes Agents 느낌의 핵심은 feature 수보다 "설치된 top-layer command가 현재 계약을 만족하는지 즉시 진단하고 한 줄로 복구하는 UX"다.
- 전역 wrapper가 JSON을 출력하더라도 현재 install dir 밖의 오래된 target을 가리키면 stale 설치로 간주해야 한다.

반영한 변경:

- `rph doctor install` 추가. 프로젝트 초기화 없이 wrapper, wrapper target, install dir, init file, completion, profile hook, `workspace --json`, `status --json`을 검사한다.
- `rph doctor shell` 추가. 프로젝트 초기화 없이 PATH, init file, slash helpers, zsh/bash `/workspace --json` probe를 검사한다.
- `rph update --dry-run`/`rph update` 표면 추가. 사용자가 repo/pnpm 내부를 몰라도 installer를 재실행할 수 있게 한다.
- install completion과 설치 완료 메시지에 `update`, `doctor install`, `doctor shell`, `workspace --json`을 노출했다.
- install smoke와 install E2E smoke가 `doctor install`, `doctor shell`, `update --dry-run`, JSON probes, 중복 profile hook 방지를 검증한다.
- core test에 healthy install, stale wrapper target, update dry-run parser/runtime coverage를 추가했다.

검증:

- `pnpm exec tsc --noEmit` passed
- `bash -n install.sh` passed
- targeted core/install tests passed: `pnpm exec vitest run tests/core.test.ts -t "operator workspace|command parser|diagnoses a healthy top-level install|stale wrappers|update dry-run"` and `pnpm run check:install`
- `pnpm run smoke:install-e2e` passed
- `pnpm test` passed, 6 files / 322 tests
- `pnpm run release:check` passed, including lint/build/test and all smoke gates through install E2E

현재 남은 실제 운영 차이:

- `/Users/king/.local/bin/rph`는 아직 낡은 전역 설치본이다. 현재 소스의 `doctor install/shell`, `/workspace --json`, `status --json` 계약은 release gate로 검증됐지만, 전역 command는 아직 업데이트되지 않았다.
- configured live gate는 2026-05-26 재확인 기준 complete green이 아니다. Gemini, Notion, GitHub, Stitch `tools/list`는 통과했고 Stitch read-only contract bind는 현재 live `tools/list`에서 실제 bind 가능한 tool만 남기도록 수정했다. 남은 live blocker는 OpenAI credential 401이다.

## 2026-05-26 live proof / release gate update

바탕화면 `awesome-codex-subagents`의 `mcp-developer.toml`, `test-automator.toml`, `product-manager.toml`/`workflow-orchestrator.toml` 관점 감사 결과를 반영했다. 결론은 "top-layer harness 방향은 맞지만, 판매 가능한 제품이 되려면 release gate가 실제 live proof를 fail-closed로 요구해야 한다"였다.

반영한 변경:

- `WorkflowEvidence.liveVerification`을 추가했다. 최신 live report의 source, passed/failed/skipped targets, report path, config fingerprint, checkedAt을 project state에 남긴다.
- `rph setup auto --live`, setup selected check, `/doctor --live`, `/ai test`, `/mcp test`, `rph live <target>`가 connection report를 쓸 때 live verification evidence도 함께 기록한다.
- `RELEASE_REVIEW`와 `RELEASE_APPROVED`는 current live proof 없이는 진행하지 못한다. missing, failed, skipped-only, mock/imported proof는 모두 release blocker로 남는다.
- release transition 실행 시 저장된 state snapshot만 믿지 않고 최신 connection report trust를 다시 확인한다. report가 stale/config mismatch/non-live/source 불일치가 되면 state에 `current`가 남아 있어도 `/next --execute`는 차단된다.
- Stitch MCP contract binding은 missing allowlisted tool을 fatal로 처리하는 대신 현재 `tools/list`에서 bind 가능한 read-only contract만 남긴다. missing tool은 agent `mcp.tools.call` 권한에서 빠진다.
- `doctor shell`은 PATH에 install bin dir가 포함됐는지만 보지 않고, 실제 `command rph` 해석 결과가 설치 wrapper를 shadowing하는지도 출력한다.
- `rph update` non-dry-run 경로가 실제 `install.sh`를 실행하는지 core test로 잠갔다.
- installer에 `RPH_LOCAL_SOURCE_DIR=<path>` 모드를 추가했다. 원격 main에 아직 push되지 않은 현재 작업트리도 전역 install dir로 동기화해 빌드/설치할 수 있다.
- `/Users/king/.local/bin/rph`를 현재 작업트리 기준으로 재설치했다. `rph doctor install`, `rph doctor shell`, `rph workspace --json` 모두 최신 계약을 통과한다.

검증:

- `pnpm exec tsc --noEmit` passed
- `pnpm exec vitest run tests/core.test.ts -t "late-stage|live verification|revalidates the latest live report|doctor shell|update"` passed, 7 tests
- `pnpm exec vitest run tests/core.test.ts -t "MCP tools/call|binds read-only|shrinks read-only|Stitch MCP-compatible|preserves custom protocol"` passed, 10 tests
- `pnpm test` passed, 6 files / 327 tests
- `pnpm run release:check` passed after the release-gate and installer changes
- global `rph doctor install` passed: wrapper target current, `workspace-json=ok`, `status-json=ok`, `next=none`
- global `rph doctor shell` passed: PATH shadowing `no`, zsh/bash workspace JSON probes `ok`, `next=none`

남은 작업:

- `pnpm run live:configured`는 현재 OpenAI credential 401 때문에 green이 아니다. 최신 재검증 기준 Gemini, Notion, GitHub, Stitch는 passed이며 Stitch는 `tools/list` 14개 tool을 확인했다. Anthropic/local/Figma는 configured env가 없어 skipped다.
- 원격 GitHub main에는 아직 현재 작업트리 변경이 push되지 않았다. public repo 설치 사용자를 위해서는 변경분 commit/push가 필요하다.

## 2026-05-26 runtime chat intent update

사용자 피드백 기준으로 다시 보면, 이전 상태의 가장 큰 UX 결함은 "AI agent와 대화는 되지만, agent가 제안한 slash/control이 stdout 안내로만 남고 durable하게 이어지지 않는다"는 점이었다. 명령어는 Codex/Claude Code의 slash command처럼 명시 제어여야 하지만, 대화형 agent가 다음 제어를 제안하면 사용자가 그 제안을 나중에 확인/실행/폐기할 수 있어야 한다.

반영한 변경:

- AI chat이 제안한 control command를 `.rph/runtime/intents.json`에 durable intent로 저장한다.
- `/agent intents`로 pending/confirmed/dismissed intent를 조회한다.
- `/agent confirm-intent <id>`가 사용자가 명시 확인한 intent만 실행한다.
- `/agent dismiss-intent <id>`가 제안을 폐기한다.
- read-only/local mutation/external live write/user approval command를 risk로 분리해 기록한다.
- intent 생성 당시 stage, graph digest, active TOML profile slug를 함께 저장하고, confirm 시 drift가 있으면 차단한다.
- external live write는 confirm 후에도 바로 실행하지 않고 기존 action approval gate로 넘어간다.
- user approval command는 intent confirm으로 대리 승인하지 못하게 막고, 사용자가 원래 approval slash command를 직접 입력하도록 분리한다.
- `/status` digest가 현재 세션의 pending intent count와 다음 confirm command를 보여준다.
- `/setup auto --live` 성공 후 `Connected` handoff block을 출력해 AI/MCP 연결, secret 저장 위치, chat 시작 방식, `/pm start` 시작 명령을 한 번에 보여준다.

검증:

- runtime chat의 `/status` 제안이 실행되지 않고 `read_only` pending intent로 저장되는 acceptance를 추가했다.
- `/agent confirm-intent <id>`가 read-only intent를 명시 실행하고 runtime session을 잃지 않는 acceptance를 추가했다.
- workflow stage가 바뀐 stale intent는 confirm되지 않고 pending으로 남는 acceptance를 추가했다.
- user approval intent는 confirm으로 대리 실행되지 않는 acceptance를 추가했다.
- 반복 제안은 pending intent가 중복되지 않고 dismiss 가능한 acceptance를 추가했다.
- external live write 제안이 plain chat에서 action approval을 만들지 않고, confirm 후에만 external action approval로 넘어가는 acceptance를 추가했다.
- interactive `/setup auto --live` 성공 출력이 `Connected`, AI/MCP 요약, chat handoff, `/pm start` 시작 명령을 포함하는 acceptance를 추가했다.

현재 판정:

- top-level product harness: 8.8/10
- Hermes-like autonomous multi-agent runtime: 8.7/10

아직 부족한 점:

- provider별 "신규 실계정 credential 입력부터 성공 연결까지" live green은 아직 전체 통과 상태가 아니다. 2026-05-26 최신 `live:configured` 기준 Gemini, Notion, GitHub, Stitch는 통과했고 OpenAI credential 401이 남은 live blocker다. Anthropic/local/Figma는 configured target이 아니라 skipped다.
- runtime intent가 단일 JSON 배열 파일이라 장기 운영에서는 append-only journal/compaction 구조가 더 낫다.
- custom TOML agent가 "profile/sandbox/model hint"를 넘어 실제 독립 process worker와 장기 memory lane으로 동작하는 수준은 더 보강해야 한다.
- MCP setup은 connected proof와 tool contract는 갖췄지만, provider별 repair wizard와 first successful tool-call UX를 더 촘촘히 만들어야 한다.
- intent lifecycle은 `/agent replay` timeline의 1급 event로 더 올릴 여지가 남아 있다.

## Continuation update

추가로 닫은 갭:

- `/agent run --steps <n> --concurrency <n>`가 여러 claimable handoff를 batch로 dispatch한다.
- handoff worker가 `spawnSync` 직렬 실행에서 async child process 실행으로 바뀌었다.
- concurrent child workers가 `.rph/runtime/handoffs.json`을 덮어쓰지 않도록 최신 파일 기준 replace와 supervisor reconciliation을 적용했다.
- lane `toolBudget.remainingToolCalls`가 표시 전용이 아니라 실제 실행 전 차감/차단된다.
- `--max-tool-calls 0`인 lane은 command 실행 전에 실패하고 dead-letter 처리된다.
- `rph start`와 bare multi-word natural language entrypoint를 추가했다.
- `/productize` 산출물이 아이디어별 profile을 반영한다. 회의록 SaaS와 고객 인터뷰 SaaS의 `product-definition`, `api-contract` 본문이 더 이상 동일하지 않다.
- `ask --execute`가 AI-proposed approval command를 자동 실행하지 못하도록 막았다. `/pm approve ...`, `/docs approve ...`, `/pd approve ...`는 사용자 직접 slash command만 허용한다.
- 런타임 chat/ask가 `.env` overlay를 읽을 때 `.rph/config.json`과 `.mcp/config.json`을 조용히 재작성하지 않도록 read-only config snapshot 경로를 분리했다.
- request-time provider failover를 추가했다. 자동 provider 선택은 active provider 호출 실패 시 다음 configured provider로 넘어가고, 명시 provider 요청은 strict failure로 유지한다.
- provider failover observability를 추가했다. provider attempt chain과 실패 사유가 `AiGenerationResult`, `.rph/ai/chat/*.jsonl`, `.rph/ai/runs/*.json`, `.rph/runtime/current-session.json`의 active turn에 남고, CLI는 `ai provider fallback: ...` notice를 출력한다.
- `/ai status`, `/agent status`, read-only `provider.status` agent tool에서 최신 provider outcome과 fallback summary를 조회할 수 있다.
- interactive runtime 안에서 `/setup auto --ai openai --mcp none --live`가 fresh workspace 초기화, credential 입력, `.env` 저장, selected provider live check, runtime 복귀까지 이어지는 acceptance test를 추가했다.
- `/setup auto --live` 실패 시 connection check 아래에 `Recovery hints`를 출력한다. missing env, credential/protocol/generation stage 실패를 원인/다음 액션/재시도 명령으로 보여준다.
- `/doctor --live`, `/ai test`, `/mcp test`도 같은 `Recovery hints` 계약을 공유한다. setup wizard 밖의 live probe도 원인/다음 액션/재시도 명령을 노출한다.
- 자연어 runtime control alias를 추가했다. `시작해`, `계속 진행해`, `승인해`, `거절해`는 CLI preflight를 통과할 때만 기존 slash command로 내려가고, negated text와 다중 pending target은 실행하지 않는다.
- bare English exact intent도 같은 preflight로 통합했다. `rph continue`, `rph approve`, `rph reject`는 unknown command가 아니라 자연어 control alias로 처리된다.
- `adapter-ready`를 REST adapter credential/target readiness로 좁히고, AI/MCP protocol 경로가 credential/handshake만 통과한 상태는 `protocol-partial`로 분리했다.
- GitHub readiness를 REST read proof와 `gh` write-channel proof로 분리했다. GitHub는 REST repo read만으로 `/github setup-labels` ready action을 띄우지 않고, `gh auth status --hostname github.com`과 `gh repo view`가 write-capable permission을 증명해야 `adapter-write-ready`가 된다.
- GitHub setup은 기존 `gh auth` 세션을 감지해도 token 값을 프로젝트 `.env`에 복사하지 않는다. 대신 `GITHUB_TOKEN_SOURCE=gh-cli`만 저장하고, REST/readback과 `gh` live write 시점에 임시 token으로 사용한다.
- `/github setup-labels`, `/github create-issue --live`, `/github create-pr --live`는 실행 직전에도 같은 owner/repo에 대해 `gh` write-channel readiness를 다시 확인한다.
- session recovery brief를 추가했다. runtime startup과 `/agent status`는 blocked/paused/external action/handoff 상태에서 wait condition, pending external action, claimable handoff, resume cursor, next safe command를 함께 보여준다.
- `live-matrix`의 provider/connector 기대 목록을 하드코딩에서 runtime definition 기반으로 바꿨다. 새 AI provider나 MCP/adapter가 추가되면 report와 onboarding proof 양쪽에 포함되지 않는 경우 실패한다.
- setup guide의 `[ready]` 라벨을 `[configured]`로 바꿨다. env/config capture와 live verification을 분리해, live probe 전 상태가 과장되어 보이지 않게 했다.
- `stageQueue`의 order/lifecycle을 session durable state로 1차 승격했다. load 시 completed/active queue ledger를 보존하고, `/next --execute`는 static graph 첫 child보다 persisted queue head를 우선한다.
- 자연어 `승인해/거절해`가 내부 approval target 여러 개를 임의 승인하지 않는 acceptance를 추가했다.
- OpenAI credential probe는 통과하지만 generation smoke가 실패하는 경우 `protocol-partial:credential-probe`로 리포트되는 acceptance를 추가했다.
- passed live check 후 `Ready actions`를 출력한다. 이제 `/setup auto --live`, `/doctor --live`, `/ai test`, `/mcp test`는 연결 상태뿐 아니라 첫 chat/write/readback/tool-surface 명령까지 보여준다.
- interactive `/setup auto --live`가 missing/bad credential 실패 후 같은 wizard 안에서 실패 connection 값을 다시 입력받고, `.env`를 덮어쓴 뒤 originally selected checks만 즉시 재검증한다. `--from-env`는 자동화용 fail-fast로 유지했다.
- live check 출력에 `Proof steps`를 추가했다. `trust=mode:stage`를 그대로 믿으라고 하지 않고 transport, credential-probe, protocol-tool-call/tools-list가 각각 어떤 상태인지 사람에게 보여준다.
- passed live check 후 `First action verified`를 출력한다. AI는 generation smoke, REST adapter는 target resource read, Stitch는 MCP `tools/list`를 non-secret proof로 저장하고 status 계열 명령에서도 다시 보여준다.
- `/status` 상단에 `Harness readiness`를 추가했다. ready/configured/degraded/blocked/needs-setup, chat/tool readiness, next command를 먼저 보여준다.
- plain chat에서 agent가 외부 read tool을 실제로 사용한 뒤 `/status`와 `/agent status`가 `Latest agent tool proof`를 출력한다. `mcp.tools.call` 같은 protocol MCP read 결과를 세션 JSON을 열지 않고도 확인할 수 있다.
- latest connection proof가 agent context prompt로 승격됐다. plain chat은 `/setup auto --live`가 실제로 증명한 target, first action, available read tools를 보고 MCP 도구를 선택한다.
- protocol MCP runtime tool call이 `mcp.tools.call` canonical 경로로 일반화됐다. `stitch.tools.call`은 현재 Stitch 서버용 호환 alias로 유지된다.
- protocol MCP auth가 contract-driven으로 이동했다. Stitch는 `x-goog-api-key`/`STITCH_API_KEY` 계약으로 표현되고, future protocol MCP 서버는 bearer/none auth mode를 같은 fabric으로 통과시킬 수 있다.
- `mcp.tools.call`은 protocol MCP 서버가 하나만 configured일 때만 server 생략을 허용하고, 없거나 여러 개면 명시적인 `args.server` 오류를 낸다.
- protocol MCP readiness proof의 first action은 Stitch alias가 아니라 canonical `mcp.tools.list`로 저장된다.
- `/setup auto --live` 성공 후 같은 runtime shell에서 곧바로 일반 텍스트 chat으로 이어지는 handoff 문구와 acceptance test를 추가했다.
- fresh interactive `rph start`가 runtime shell에서 안내만 하는 대신 setup-first entrypoint로 동작한다. 이제 fresh TTY에서 `rph start`는 `rph setup auto --live`를 직접 실행하고, 검증 성공 후 연결된 chat/runtime으로 이어진다.
- GitHub onboarding smoke를 추가했다. `setup auto --from-env --live --ai openai --mcp github`가 기존 `gh auth`를 `GITHUB_TOKEN_SOURCE=gh-cli`로 저장하고, AI-proposed `/github setup-labels`가 approval gate와 label readback proof까지 이어지는지 한 fresh temp project에서 검증한다.
- runtime session append-only snapshot journal을 추가했다. `.rph/runtime/current-session.json` head 외에 `.rph/runtime/sessions/<session-id>.jsonl`과 `<session-id>.latest.json`을 저장하고, `/agent session`과 `/agent replay`로 세션 tail/replay를 볼 수 있다. current head가 깨진 경우 per-session snapshot, 마지막 valid journal record 순서로 recovery한다.
- command-first 체감을 줄이기 위해 deterministic natural controls를 확장했다. `현재 상태 보여줘`, `제품 정의 시작해줘`, `이어서 진행해`, `세션 타임라인` 같은 표현이 각각 `/status`, PM product-definition path, `/agent run`/`recover`, `/agent replay`로 안전하게 preflight된다.
- `/agent replay`가 snapshot inspector에만 머물지 않도록 `Session timeline`을 추가했다. 최신 replay manifest의 history를 바탕으로 start/plan/checkpoint/executed/blocker/error 흐름을 먼저 보여주고, 기존 `Replay snapshots` tail은 진단용으로 유지한다.
- imported TOML agent를 prompt skin에서 실행 증거로 한 단계 승격했다. active custom profile의 name/slug/model/reasoning/sandbox/activation snapshot이 agent turn state와 lane run record에 남고, lane prompt와 `/agent lanes` 출력에서도 확인된다.
- imported TOML profile을 실제 실행 제어까지 연결했다. active profile의 `model`/`model_reasoning_effort`는 provider-backed runtime turn과 autonomous lane generation body에 반영되고, `gpt-*`/`claude*`/`gemini*`처럼 provider가 명확한 모델은 다른 provider fallback으로 실패를 숨기지 않는다. `sandbox_mode=read-only`는 autonomous lane의 mutating command와 `/next --execute` 같은 상태 전진 명령을 실행 전에 차단한다.
- active lane supervision을 보강했다. `/agent recover`와 `/agent run`은 claimed/running handoff의 lane worker pid가 죽어 있으면 stale lease 만료를 기다리지 않고 해당 attempt/lane을 failed로 닫은 뒤 handoff를 requeue 또는 dead-letter 처리한다.
- 장기 실행 handoff worker가 lease를 잃지 않도록 periodic heartbeat를 추가했다. worker는 실행 중 handoff와 lane run heartbeat를 주기적으로 갱신하고, claim token이 stale해지면 heartbeat를 멈춘다.
- `/status`의 trust UX를 제품 언어로 정리했다. stale/mock/config-drifted connection report는 `live_verification=not-current`와 `Last known verification (not current)`로 보이고, shell에서는 `rph doctor --live`, runtime shell에서는 `/doctor --live`를 다음 명령으로 안내한다.
- `/agent workers`를 추가했다. handoff/lane/proof/recovery 상태를 worker-pool 관점으로 집계해 active/healthy/dead/reclaimable/completed-pending-merge counts, safe next command, active worker rows를 보여준다.
- `/agent workers` 기본 출력은 보안 감사 결과를 반영해 raw worker session id, claim token, pid를 노출하지 않는다. deep debug가 필요할 때만 `--debug`로 pid/session 정보를 볼 수 있게 분리했다.
- direct `/agent worker run`으로 완료됐지만 아직 merge되지 않은 lane result를 `/agent run`/`/agent recover`가 reattach해서 control-plane merge할 수 있게 했다. 이제 direct worker completion이 orphaned pending merge로 남지 않는다.
- `/setup repair --live`를 추가했다. 최신 live report의 failed AI/MCP target만 읽어 다시 검증하고, interactive TTY에서는 실패 연결 값만 재입력받으며, `--from-env`에서는 현재 shell env로 non-echo 재검증한다. Recovery hints도 이제 이 one-command repair path를 먼저 보여준다.
- install completion parity를 맞췄다. `/setup repair`와 runtime recovery/action 명령들이 bash/zsh completion에 들어가고, install smoke가 zsh와 bash slash helper 양쪽을 검증한다.
- custom protocol MCP URL을 HTTPS 기본으로 잠갔다. 원격 `http://` endpoint는 거절하고, `http://127.0.0.1`/`localhost`/`::1`만 로컬 개발 예외로 허용한다.
- `/agent pool run|status|stop`을 추가했다. pool은 foreground persistent supervisor loop로 `.rph/runtime/worker-pool.json`에 pool id, pid, heartbeat, cycles, dispatched, stop request, stop reason을 저장한다.
- pool loop는 handoff mailbox만 소비한다. `handoffsOnly` 모드로 `/agent run`의 stage fallback command를 실행하지 않기 때문에, 상주 supervisor가 의도치 않게 workflow stage command를 직접 밀지 않는다.
- `/agent pool stop --reason ...`은 durable stop request를 기록하고, pool process는 다음 poll boundary에서 요청을 읽어 `stopped`와 `stopReason`을 남긴다.
- `/agent pool status`와 `/agent workers` 기본 출력은 raw pool pid를 숨기고, `--debug`일 때만 pid/session 계열 디버그 식별자를 보여준다.
- `/agent pool start`와 `/agent pool logs`를 추가했다. `start`는 detached background supervisor를 띄우고 즉시 반환하며, `.rph/runtime/worker-pool.json`에는 `mode=background`와 log path를, `.rph/runtime/worker-pool.log`에는 cycle/dispatch/stop 로그를 남긴다. `run`은 foreground/debug 경로로 유지한다.
- install completion parity도 맞췄다. bash/zsh `/agent` completion에 `pool`이 포함되고, install smoke가 이 surface를 검증한다.
- pool identity hardening을 추가했다. pool record는 `pidStartedAt` fingerprint와 `poolToken`을 저장하고, status/stop/start는 PID가 살아 있어도 fingerprint가 다르면 identity mismatch로 처리한다.
- pool state fail-closed 처리를 강화했다. malformed/non-file `worker-pool.json`은 `status=unreadable`로 보이고, start/stop/force-stop은 조용히 `none`으로 취급하지 않고 차단한다.
- `pool stop`은 기본 drain mode를 명시하고, `pool stop --force`는 `SIGTERM` 후 실제 process exit이 확인되어야 `stopped`를 기록한다. 종료 확인 실패는 `failed`로 남긴다.
- pool ownership을 handoff/lane까지 전파했다. pool이 dispatch한 lane은 `poolId`, `slotId`, `slotIndex`를 durable record에 남기며, worker id도 `lane-worker:<poolId>:slot-<n>:<role>` 형태로 slot-stable하게 기록된다.
- macOS LaunchAgent service surface를 추가했다. `/agent pool service install|status|uninstall|plist`는 기존 queue/scheduler를 새로 만들지 않고 launchd가 `agent pool run`을 직접 소유하게 만드는 얇은 wrapper로 동작한다.
- service plist는 per-project label과 `WorkingDirectory`를 고정하고, `RPH_WORKER_POOL_MODE=service`/project-local log만 환경에 넣는다. provider credential은 plist에 쓰지 않고 기존 project `.env` load path를 그대로 사용한다.
- `/agent handoffs`, `/agent lanes`, child worker startup log도 같은 redaction 정책으로 맞췄다. 기본 출력은 worker session/pid를 노출하지 않고, `/agent lanes --debug`에서만 raw worker pid를 확인한다.
- runtime `handoffPacket`과 ready `stageQueue` branch가 `/agent run` work selection 전에 `.rph/runtime/handoffs.json`으로 자동 물질화된다. `PD_APPROVED -> FE_SPEC + BE_SPEC` 같은 fan-out은 이제 수동 handoff seed나 AI handoff 제안 없이도 worker mailbox에 들어가며, resume cursor/command 기준으로 중복 생성이 차단된다.
- FE/BE fan-out sibling lane이 같은 전역 `currentStage`를 선형 단계처럼 경쟁하던 문제를 고쳤다. `PD_APPROVED`, `FE_SPEC`, `BE_SPEC` 사이에서는 engineering draft 준비가 병렬 자식 단계로 동작하므로 FE/BE lane을 같은 batch에서 실행할 수 있다.
- latest live connection proof promotion을 freshness/config-bound로 잠갔다. `.rph/connections/latest.json`은 `source=live`, 30분 이내, current harness config의 non-secret fingerprint와 일치할 때만 agent context/status의 current proof로 승격된다. stale/mock/imported/config-drifted proof는 proof ledger 감사 기록에는 남지만 read tool authority로 보이지 않는다.
- fan-in queue reconciliation을 구현했다. `SPRINT_PLANNING` 같은 reducer stage는 prerequisite lane이 accepted/completed/merged proof를 갖고, 필요한 FE/BE/API 문서가 승인된 경우에만 ready가 된다.
- ready fan-in은 synthetic Orchestrator handoff로 `.rph/runtime/handoffs.json`에 물질화된다. resume cursor는 `fan-in:<stage>`, command는 `/agent reduce <stage>`이며 source handoff/lane/artifact refs가 packet에 보존된다.
- detached `stage-queue:` branch worker가 전역 `currentStage`를 FE/BE로 밀어버리던 문제를 고쳤다. branch worker의 문서/evidence는 보존하되 global stage/history는 parent stage로 복원하고, fan-in reducer만 global stage를 전진시킨다.
- external action approval을 handoff와 같은 신뢰 모델에 가깝게 강화했다. approval store는 전용 lock을 사용하고 stale lockfile을 복구하며, `/agent approve-action`은 `pending -> running`을 하나의 locked transition으로 처리한다.
- approval execution은 current runtime session의 `external_live_write` wait condition에 묶인다. 다른 session의 stale action id를 직접 넘기거나 자연어 `승인해`로 우회 실행할 수 없다.
- Notion live setup/sync도 승인 시점의 target을 고정한다. `NOTION_PARENT_PAGE_ID`나 workspace dashboard가 approval 이후 바뀌면 실행 전에 drift로 실패한다.
- GitHub issue/PR live approval도 승인 시점의 local artifact snapshot에 묶였다. issue/PR local record, rendered body/body file hash, owner/repo, local issue/PR number, branch/target 정보가 `approvedSnapshot` fingerprint에 들어가며, 승인 후 body/record가 바뀌면 live write 전에 fail-closed된다.
- GitHub issue/PR readback completion은 이제 shared `latest` pointer가 아니라 `live-issue-<localIssueNumber>-readback.json`, `live-pr-<localPrNumber>-readback.json` per-artifact proof를 authoritative로 읽는다. `latest`는 UX pointer로만 유지된다.
- `/setup auto --live`와 `/setup mcp add ... --live`는 allowlisted protocol MCP read-only tool의 current `tools/list` contract를 `.rph/config.json`에 bind한다. endpoint/auth mode/serverInfo/protocolVersion/inputSchema hash/annotations hash가 저장되고, 이후 bound `mcp.tools.call`은 live metadata fingerprint가 drift하면 `tools/call` 전에 차단된다.
- MCP contract binding 후 connection report를 다시 써서 latest live proof의 config fingerprint가 stale 처리되지 않도록 했다.
- mutable MCP write는 read-only registry를 넓히지 않고 approval-local snapshot/readback rail로 닫았다. `/mcp call`은 일반 직접 실행에서는 여전히 `--read-only`를 요구하고, `/agent approve-action` 실행 중 `RPH_ACTION_APPROVAL_ID`/fingerprint/runningAt가 주입된 경우에만 승인된 server/tool/args snapshot과 현재 `tools/list` metadata fingerprint가 일치해야 `tools/call`로 넘어간다.
- MCP mutable approval snapshot은 `mcp.tool-call` / `mcp-tool-call-v1`로 저장된다. serverId, toolName, endpoint identity, auth mode/env key, protocolVersion, serverInfo, inputSchema hash, annotations hash, arguments hash가 fingerprint에 들어간다.
- MCP mutable readback은 `.rph/mcp/live-tool-call-<actionApprovalId>-readback.json` per-approval file을 authoritative로 읽는다. readback file의 actionApprovalId, approvedFingerprint, actionVerifiedAt, approvedSnapshotFingerprint, server/tool match가 모두 맞아야 action이 completed가 된다.
- dotted command 호환성도 보강했다. agent가 `/mcp call stitch.create_project`를 제안하더라도 approval classification이 잡히고, 실행 표면은 `/mcp call stitch create_project --args-json ...`와 dotted form을 모두 해석한다.
- fan-in reducer packet에 materialization key를 추가했다. source lane-run set이 바뀐 오래된 reducer handoff는 completed 상태여도 현재 fan-in completion으로 인정하지 않고, 새 epoch reducer를 다시 물질화한다.
- handoff claim token/attempt ownership을 강화했다. claim마다 `workerSessionId`와 `claimToken`을 새로 발급하고, worker start/heartbeat/fail/complete 및 lane merge는 현재 handoff의 worker session, attempt, claim token, laneRunId가 모두 일치해야만 기록된다. lease 만료 후 재claim된 handoff는 이전 worker가 늦게 끝나도 현재 attempt를 완료시키거나 실패로 되돌릴 수 없다.
- 동일 handoff에 두 OS worker process가 동시에 붙는 경합 smoke를 추가했다. `agent worker run handoff-race --worker-id race-a/b`를 병렬로 실행하고, 최종 `.rph/runtime/handoffs.json`과 `lanes/*.json`에 단일 claim, 단일 lane, 단일 completion만 남는지 검증한다.
- top-level golden path smoke를 추가했다. fresh project에서 `rph start --from-env --live --ai openai --mcp stitch <자연어>`가 setup live, plain chat, `mcp.tools.call` read proof, agent-proposed PM handoff, `/agent run` worker consume, autonomous lane merge, 다음 PM handoff까지 이어지는지 한 흐름으로 검증한다.
- first-run/recovery 안내의 primary command를 `rph ...`로 맞췄다. `/setup`, `/pm`, `/mcp` shell helper는 선택적 보조 표면이고, 복붙 가능한 기본 안내는 `rph setup auto --live`, `rph pm start`, `rph mcp tools/call ...`로 출력된다.
- imported TOML agent profile을 advisory prompt에서 실행 profile로 승격했다. active profile의 `model`과 `model_reasoning_effort`가 provider-backed runtime turn 및 autonomous worker lane의 실제 AI request에 들어가고, `sandbox_mode=read-only`는 mutating local command 자동 실행을 차단한다. RPH approval/readback gate는 그대로 우선한다.

새 검증:

- core + Hermes acceptance: 2 files, 122 tests passed
- 추가 acceptance: parallel lane scheduler, budget exhaustion block, bare chat entrypoint, `rph start`
- 추가 productize regression: 서로 다른 아이디어의 product-definition/API contract가 달라지는지 검증
- latest targeted verification: `pnpm run build` passed
- latest targeted verification: `pnpm vitest run tests/hermes-acceptance.test.ts -t "runtime shell from credential input"` passed
- latest targeted verification: `pnpm vitest run tests/hermes-acceptance.test.ts -t "natural-language|conversational continue|ask --execute start|ask --execute continue|negated continue|queues external write"` passed, 11 tests
- latest targeted verification: `pnpm vitest run tests/core.test.ts tests/hermes-acceptance.test.ts tests/mcp-readiness.test.ts` passed, 139 tests
- latest full local gate: `pnpm run release:check` passed, including 4 test files / 141 tests plus all smoke gates
- latest full local gate after queue/trust hardening: `pnpm run release:check` passed, including 5 test files / 159 tests plus productize, Hermes e2e, setup-chat, provider-onboarding, MCP-runtime, Notion/GitHub readback, mutable-action, install, and install-E2E smoke gates
- latest full local gate after first-value action output: `pnpm run release:check` passed, including 5 test files / 159 tests plus productize, Hermes e2e, setup-chat, provider-onboarding, MCP-runtime, Notion/GitHub readback, mutable-action, install, and install-E2E smoke gates
- latest full local gate after in-wizard setup recovery: `pnpm run release:check` passed, including 5 test files / 161 tests plus productize, Hermes e2e, setup-chat, provider-onboarding, MCP-runtime, Notion/GitHub readback, mutable-action, install, and install-E2E smoke gates
- latest full local gate after proof-step output: `pnpm run release:check` passed, including 5 test files / 161 tests plus productize, Hermes e2e, setup-chat, provider-onboarding, MCP-runtime, Notion/GitHub readback, mutable-action, install, and install-E2E smoke gates
- latest full local gate after first-action proof output: `pnpm run release:check` passed, including 5 test files / 163 tests plus productize, Hermes e2e, setup-chat, provider-onboarding, MCP-runtime, Notion/GitHub readback, mutable-action, install, and install-E2E smoke gates
- latest full local gate after MCP chat proof/status/context output: `pnpm run release:check` passed, including 5 test files / 165 tests plus productize, Hermes e2e, setup-chat, provider-onboarding, MCP-runtime, Notion/GitHub readback, mutable-action, install, and install-E2E smoke gates
- latest full local gate after protocol MCP auth/default/proof and setup conversational handoff: `pnpm run release:check` passed, including 5 test files / 172 tests plus productize, Hermes e2e, setup-chat, provider-onboarding, MCP-runtime, Notion/GitHub readback, mutable-action, install, and install-E2E smoke gates
- latest full local gate after GitHub `gh` write-channel readiness hardening: `pnpm run release:check` passed, including 6 test files / 233 tests plus productize, Hermes e2e, setup-chat, provider-onboarding, MCP-runtime, Notion/GitHub readback, mutable-action, install, and install-E2E smoke gates
- latest targeted verification after setup-first `rph start` and GitHub onboarding smoke: `pnpm run build && pnpm vitest run tests/core.test.ts tests/hermes-acceptance.test.ts -t "rph start|GitHub CLI auth" && pnpm run smoke:github-onboarding` passed
- latest targeted verification after runtime session journal/replay: `pnpm run build && pnpm vitest run tests/core.test.ts -t "runtime session manifest" && pnpm vitest run tests/hermes-acceptance.test.ts -t "runtime session manifest|runtime journal|one-shot /agent session"` passed
- latest targeted verification after natural control/replay timeline UX: `pnpm run build && pnpm vitest run tests/hermes-acceptance.test.ts -t "status intent|product-definition natural|expanded continue|session and replay"` passed, 4 tests
- latest targeted verification after TOML execution-profile evidence: `pnpm run build && pnpm vitest run tests/agent-role-catalog.test.ts tests/hermes-acceptance.test.ts -t "active imported TOML|custom profile|agent roles|role runner|agent lanes"` passed, 4 tests
- latest full local gate after natural control/TOML evidence work: `pnpm run release:check` passed, including 6 test files / 244 tests plus productize, Hermes e2e, setup-chat, provider-onboarding, MCP-runtime, Notion/GitHub readback, mutable-action, GitHub onboarding, install, and install-E2E smoke gates
- latest targeted verification after setup repair path: `pnpm run build && pnpm vitest run tests/hermes-acceptance.test.ts -t "setup live|setup repair|Recovery hints|runtime shell from credential input|retries failed setup auto"` passed, 3 tests
- latest install verification after completion parity and bash helper coverage: `pnpm run check:install` passed
- latest targeted verification after stageQueue mailbox materialization: `pnpm run build && pnpm vitest run tests/hermes-acceptance.test.ts -t "materializes fan-out|parallel lane scheduler|stage mismatch"` passed, 2 tests
- latest targeted verification after connection proof freshness/config drift gate: `pnpm run build && pnpm vitest run tests/core.test.ts -t "connection proofs|stale live connection|config-mismatched|latest failed connection proof"` passed, 4 tests
- latest full local gate after setup repair, install completion, protocol MCP HTTPS guard, and stageQueue mailbox materialization: `pnpm run release:check` passed, including 6 test files / 250 tests plus productize, Hermes e2e, setup-chat, provider-onboarding, MCP-runtime, Notion/GitHub readback, mutable-action, GitHub onboarding, install, and install-E2E smoke gates
- latest full local gate after connection proof freshness/config drift gate: `pnpm run release:check` passed, including 6 test files / 252 tests plus productize, Hermes e2e, setup-chat, provider-onboarding, MCP-runtime, Notion/GitHub readback, mutable-action, GitHub onboarding, install, and install-E2E smoke gates
- latest targeted verification after fan-in reducer work: `pnpm run build && pnpm vitest run tests/hermes-acceptance.test.ts -t "fan-in reducer|fan-in queue|fan-out stage queue"` passed, 3 tests
- latest full local gate after fan-in reducer work: `pnpm run release:check` passed, including 6 test files / 261 tests plus productize, Hermes e2e, setup-chat, provider-onboarding, MCP-runtime, Notion/GitHub readback, mutable-action, GitHub onboarding, install, and install-E2E smoke gates
- latest targeted verification after approval CAS/session/Notion drift and fan-in epoch hardening: `pnpm run build && pnpm vitest run tests/core.test.ts -t "external actions|one-shot|stale action approval lock|fan-in|fan-out stage queue|stage queue" && pnpm vitest run tests/hermes-acceptance.test.ts -t "external action|Notion live setup approval|approve-action|natural-language ask|fan-in reducer|fan-in queue|fan-out stage queue"` passed, 25 tests
- latest local test suite after approval CAS/session/Notion drift and fan-in epoch hardening: `pnpm test` passed, 6 test files / 266 tests
- latest full local gate after approval CAS/session/Notion drift and fan-in epoch hardening: `pnpm run release:check` passed, including 6 test files / 266 tests plus productize, Hermes e2e, setup-chat, provider-onboarding, MCP-runtime, Notion/GitHub readback, mutable-action, GitHub onboarding, install, and install-E2E smoke gates
- latest targeted verification after handoff claim token/attempt ownership hardening: `pnpm exec tsc -p tsconfig.json --noEmit && pnpm vitest run tests/core.test.ts -t "release readiness|proof ledger|fresh handoff claim token|stale heartbeat|stale lane binding|fan-in|fan-out stage queue" && pnpm vitest run tests/hermes-acceptance.test.ts -t "parallel lane|stale lease|active lease|direct worker|failed lane|agent run|agent worker|fan-in reducer"` passed, 18 tests
- latest local test suite after handoff claim token/attempt ownership hardening: `pnpm test` passed, 6 test files / 269 tests
- latest full local gate after handoff claim token/attempt ownership hardening: `pnpm run release:check` passed, including 6 test files / 269 tests plus productize, Hermes e2e, setup-chat, provider-onboarding, MCP-runtime, Notion/GitHub readback, mutable-action, GitHub onboarding, install, and install-E2E smoke gates
- latest targeted verification after GitHub approval snapshot and MCP read-only contract binding: `pnpm run build && pnpm vitest run tests/hermes-acceptance.test.ts -t "connects setup auto --live to plain chat|surfaces built-in MCP live proof" && pnpm run smoke:mcp-runtime` passed
- latest local test suite after GitHub approval snapshot and MCP read-only contract binding: `pnpm test` passed, 6 test files / 273 tests
- latest full local gate after GitHub approval snapshot and MCP read-only contract binding: `pnpm run release:check` passed, including 6 test files / 273 tests plus productize, Hermes e2e, setup-chat, provider-onboarding, MCP-runtime, Notion/GitHub readback, mutable-action, GitHub onboarding, install, and install-E2E smoke gates
- latest targeted verification after mutable MCP write approval/readback rail: `pnpm run build && pnpm vitest run tests/hermes-acceptance.test.ts -t "mutable MCP|mutable action" && pnpm vitest run tests/core.test.ts -t "mutable operator MCP|explicit read-only intent|requires readOnly=true|blocks unallowlisted MCP" && pnpm run smoke:mutable-action` passed
- latest local test suite after mutable MCP write approval/readback rail: `pnpm test` passed, 6 test files / 276 tests
- latest full local gate after mutable MCP write approval/readback rail: `pnpm run release:check` passed, including 6 test files / 276 tests plus productize, Hermes e2e, setup-chat, provider-onboarding, MCP-runtime, Notion/GitHub readback, mutable-action with Notion+MCP write/readback, GitHub onboarding, install, and install-E2E smoke gates
- latest targeted verification after OS-level handoff worker race smoke: `pnpm run build && pnpm run smoke:handoff-worker-race` passed
- latest full local gate after OS-level handoff worker race smoke: `pnpm run release:check` passed, including 6 test files / 276 tests plus productize, Hermes e2e, setup-chat, provider-onboarding, MCP-runtime, Notion/GitHub readback, mutable-action with Notion+MCP write/readback, handoff-worker-race, GitHub onboarding, install, and install-E2E smoke gates
- latest targeted verification after top-level golden path smoke: `pnpm run smoke:top-level-golden-path` passed
- latest targeted verification after primary `rph ...` command rendering: `pnpm run build && pnpm exec vitest run tests/core.test.ts -t "rph start|Setup Assistant|general help" && pnpm exec vitest run tests/hermes-acceptance.test.ts -t "setup live|recovery hints|doctor --live|direct ai and mcp|runtime shell from credential input|rph start" && pnpm run smoke:top-level-golden-path` passed
- latest full local gate after top-level golden path and primary `rph ...` command rendering: `pnpm run release:check` passed, including 6 test files / 276 tests plus productize, Hermes e2e, setup-chat, provider-onboarding, MCP-runtime, Notion/GitHub readback, mutable-action with Notion+MCP write/readback, handoff-worker-race, top-level-golden-path, GitHub onboarding, install, and install-E2E smoke gates
- latest targeted verification after execution-active TOML profile work: `pnpm run build && pnpm exec vitest run tests/agent-role-catalog.test.ts tests/hermes-acceptance.test.ts -t "active imported TOML|read-only TOML sandbox|provider-backed autonomous lane"` passed, 5 tests
- latest targeted verification after strict TOML provider binding and read-only `/next --execute` sandboxing: `pnpm run build && pnpm exec vitest run tests/core.test.ts tests/hermes-acceptance.test.ts tests/agent-role-catalog.test.ts -t "imported TOML model provider binding|/next --execute|active imported TOML|read-only TOML sandbox"` passed, 6 tests
- latest local test suite after strict TOML execution control: `pnpm test` passed, 6 test files / 279 tests
- latest full local gate after strict TOML execution control: `pnpm run release:check` passed, including 6 test files / 279 tests plus productize, Hermes e2e, setup-chat, provider-onboarding, MCP-runtime, Notion/GitHub readback, mutable-action, handoff-worker-race, top-level-golden-path, GitHub onboarding, install, and install-E2E smoke gates
- latest targeted verification after active lane recovery and status trust UX: `pnpm run build && pnpm exec vitest run tests/hermes-acceptance.test.ts -t "non-current connection proof|runtime /status guidance|dead worker lease|long-running worker lease"` passed, 4 tests
- latest local test suite after active lane recovery and status trust UX: `pnpm test` passed, 6 test files / 283 tests
- latest full local gate after active lane recovery and status trust UX: `pnpm run release:check` passed, including 6 test files / 283 tests plus productize, Hermes e2e, setup-chat, provider-onboarding, MCP-runtime, Notion/GitHub readback, mutable-action, handoff-worker-race, top-level-golden-path, GitHub onboarding, install, and install-E2E smoke gates
- latest targeted verification after worker-pool supervision UI and pending-merge reattach: `pnpm run build && pnpm exec vitest run tests/hermes-acceptance.test.ts -t "worker-pool|long-running worker lease|direct worker completion"` passed, 3 tests
- latest local test suite after worker-pool supervision UI and pending-merge reattach: `pnpm test` passed, 6 test files / 284 tests
- latest full local gate after worker-pool supervision UI and pending-merge reattach: `pnpm run release:check` passed, including 6 test files / 284 tests plus productize, Hermes e2e, setup-chat, provider-onboarding, MCP-runtime, Notion/GitHub readback, mutable-action, handoff-worker-race, top-level-golden-path, GitHub onboarding, install, and install-E2E smoke gates
- latest targeted verification after foreground persistent worker pool and redaction parity: `pnpm run build && pnpm exec vitest run tests/hermes-acceptance.test.ts -t "runtime handoff queue|foreground worker pool|worker pool stop|durable pool state|worker-pool|direct worker completion|long-running worker lease"` passed, 6 tests
- latest local test suite after foreground persistent worker pool and redaction parity: `pnpm test` passed, 6 test files / 286 tests
- latest full local gate after foreground persistent worker pool and redaction parity: `pnpm run release:check` passed, including 6 test files / 286 tests plus productize, Hermes e2e, setup-chat, provider-onboarding, MCP-runtime, Notion/GitHub readback, mutable-action, handoff-worker-race, top-level-golden-path, GitHub onboarding, install, and install-E2E smoke gates
- latest configured live gate after fan-in reducer work: `pnpm run live:configured` fails on OpenAI credential 401; Gemini, Notion, GitHub, and Stitch pass; Anthropic, Local, and Figma are skipped because env is absent
- latest configured live gate prints non-secret `target=... action=...` summaries for passed Notion, GitHub, and Stitch checks; Stitch proof action is canonical `mcp.tools.list`

## 이번 서브에이전트 감사

바탕화면 `awesome-codex-subagents`의 TOML을 기준으로 세 관점의 감사 에이전트를 돌렸다.

- meta-orchestration: `workflow-orchestrator`, `multi-agent-coordinator`, `task-distributor`
- QA: `qa-expert`, `test-automator`
- DX/MCP/CLI: `cli-developer`, `mcp-developer`, `dx-optimizer`
- follow-up safety/runtime audit: `security-auditor`, `risk-manager`, `error-coordinator`
- follow-up reducer/test audit: `test-automator`, `cli-developer`, `task-distributor`
- follow-up architecture audit: `workflow-orchestrator`, `multi-agent-coordinator`, `architect-reviewer`
- active-supervision audit: `multi-agent-coordinator`, `workflow-orchestrator`, `test-automator`, `error-coordinator`, `product-manager`, `dx-optimizer`, `task-distributor`
- worker-supervision follow-up audit: `workflow-orchestrator`, `multi-agent-coordinator`, `task-distributor`, `test-automator`, `security-auditor`, `risk-manager`, `error-coordinator`
- persistent-pool audit: `workflow-orchestrator`, `multi-agent-coordinator`, `task-distributor`, `test-automator`, `security-auditor`, `risk-manager`, `error-coordinator`

공통 결론:
- 로컬 orchestration mechanics는 강해졌다.
- `rph` top-level runtime, slash helper, setup auto, AI chat, handoff queue, lane record는 실제 코드와 테스트가 있다.
- 가장 큰 갭이던 handoff inline 실행은 줄었다. `/agent run`은 이제 child CLI worker인 `/agent worker run <handoff-id>`를 띄우고, worker가 claim/heartbeat/attempt/dead-letter를 기록한다.
- QA 관점에서는 alpha 내부 검증은 조건부 Go지만, public repo에서 Hermes-like라고 강하게 내세우기에는 live/real-install 증거가 부족하다.
- MCP/DX 관점에서는 설치와 대화 UX는 강하지만 REST adapter와 true MCP server가 사용자 경험에서 섞여 보인다.
- follow-up 감사에서는 fan-in을 상태/currentStage만 보고 통과시키지 말고 accepted merged lane proof set 기준으로 계산해야 한다고 지적했다. 이 지적을 반영해 laneRunId, attempt, stage, handoffId, merge status가 일치해야 completed prerequisite으로 본다.
- stale branch merge와 reducer bypass 위험도 지적됐다. 이 지적을 반영해 branch worker는 detached stageQueue 실행 후 global stage를 복원하고, reducer handoff만 workflow transition을 수행한다.
- active-supervision 감사에서는 `handoff claim`과 `lane run`이 저장돼도 죽은 OS worker를 즉시 회수하지 못하면 Hermes Agents식 control plane이라고 보기 어렵다고 지적했다. 이 지적을 반영해 dead worker pid reaping과 periodic heartbeat lease renewal을 추가했다.
- product/DX 감사에서는 `status`가 내부 inventory처럼 보이면 사용자가 현재 연결이 진짜 current live proof인지 판단하기 어렵다고 지적했다. 이 지적을 반영해 non-current proof, last-known proof, 다음 명령 표면을 제품 언어로 분리했다.
- worker-supervision 감사에서는 ownership truth가 `handoffs.json`, `lanes/*.json`, proof ledger, recovery brief에 흩어져 있어 operator가 "누가 지금 일을 소유하는지, 죽은 worker를 왜 회수하는지, 어떤 완료 결과가 merge됐는지"를 한 화면에서 보기 어렵다고 지적했다. 이 지적을 반영해 `/agent workers` supervisor surface와 pending-merge reattach를 추가했다.
- 보안 감사에서는 worker UI가 raw runtime JSON을 그대로 비추면 `workerSessionId`, pid, raw provider error, prompt preview, absolute path가 노출될 수 있다고 지적했다. 이 지적을 반영해 `/agent workers` 기본 출력은 safe summary만 보여주고 pid/session은 `--debug`로 분리했다.
- persistent-pool 감사에서는 기존 durable handoff/lease/lane 구조를 버리고 새 queue를 만들 필요는 없고, 그 위에 resident supervisor를 얹는 것이 최소 변경이라고 판단했다. 이 지적을 반영해 foreground persistent pool을 추가했다.
- QA 감사에서는 pool run/status/stop의 foreground daemon contract, heartbeat persistence, stop-request state를 acceptance로 고정해야 한다고 지적했다. 이 지적을 반영해 idle timeout pool run, durable stop request, status redaction 테스트를 추가했다.
- 보안 follow-up 감사에서는 `/agent handoffs`, `/agent lanes`, worker startup log가 `/agent workers`보다 raw pid/session을 더 많이 노출한다고 지적했다. 이 지적을 반영해 기본 출력은 redacted, `--debug` 출력은 explicit debug로 분리했다.
- 여전히 남은 위험은 실계정 mutable MCP provider canary, deploy 계열 readback, slot별 worker state, full durable DAG queue, provider별 live credential coverage다.

서브에이전트별 판정:
- orchestration auditor: Hermes-like control plane 6/10. real multi-agent runtime은 아직 아님.
- QA auditor: confidence medium. local fail-closed는 강하지만 public Hermes-like claim은 No-Go에 가까움.
- DX/MCP auditor: DX 8/10, MCP fidelity 6/10, Hermes-like 종합 6.5/10.
- active-supervision auditor: Hermes-like agent fabric 8/10. 죽은 worker 회수와 heartbeat renewal이 들어가면서 "worker process를 실제로 관리하는 runtime"에 가까워졌고, 이후 persistent pool/service surface까지 추가됐다.
- worker-supervision auditor: Hermes-like operator surface 8/10. worker ownership/recovery/merge truth가 한 화면에 올라왔지만, worker 실행 자체는 아직 long-lived daemon이 아니라 child process dispatch다.
- persistent-pool auditor: Hermes-like agent fabric 8.5/10. foreground/background supervisor와 launchd service surface가 들어가면서 “명령 실행 묶음”에서는 벗어났다. 다만 slot file, deeper recovery, full DAG queue가 남아 있어 Hermes Agents급 OS라고 강하게 말하기에는 이르다.

## 이번에 닫은 갭

### Setup/live 선택 범위

`setup auto --from-env --live --ai openai --mcp none`이 이제 선택한 OpenAI만 검증한다. `--live`라는 이유로 다른 configured provider까지 끌어와 실패하지 않는다.

추가 증거:
- 선택 provider 성공 테스트
- 선택 provider 실패 테스트
- live matrix 실패 시에도 connection report를 읽어 provider별 실패 사유 출력

### Setup -> live -> chat smoke

새 smoke:

```bash
pnpm run smoke:setup-chat
```

fresh temp dir에서 다음을 한 번에 검증한다.

1. `setup auto --from-env --live --ai openai --mcp none`
2. OpenAI readiness report 생성
3. 같은 프로젝트에서 `ask` agent turn 실행
4. `.rph/runtime/current-session.json`에 complete turn 기록

`release:check`에 포함됐다.

### Setup -> live -> MCP runtime smoke

새 smoke:

```bash
pnpm run smoke:mcp-runtime
```

fresh temp dir에서 다음을 한 번에 검증한다.

1. `setup auto --from-env --live --ai openai --mcp stitch`
2. OpenAI generation readiness와 protocol MCP `initialize`/`tools/list` readiness report 생성
3. 같은 프로젝트에서 `ask` agent turn 실행
4. AI가 `mcp.tools.call` read-only tool call을 요청
5. runtime tool fabric이 MCP `tools/call`을 실행하고 `.rph/runtime/current-session.json`에 성공 tool observation을 기록
6. `/agent status`가 `Latest agent tool proof`로 방금 실행한 MCP read result를 출력

`release:check`에 포함됐다.

### Notion write/readback smoke

새 smoke:

```bash
pnpm run smoke:notion-readback
```

fresh temp dir에서 다음을 한 번에 검증한다.

1. `notion setup --live`가 dashboard page와 tracking databases를 생성하는 write path를 실행
2. 생성된 dashboard page를 `GET /v1/pages/{id}`로 다시 읽어 `.rph/notion/live-workspace.json`에 readback proof 저장
3. `notion sync --live`가 sync summary page를 생성
4. 생성된 sync page를 `GET /v1/pages/{id}`로 다시 읽어 `.rph/notion/live-sync-readback.json`에 readback proof 저장
5. 저장 파일에 `NOTION_TOKEN` 값이 섞이지 않는지 확인

실외부 credential을 쓰는 gate는 여전히 `live:configured`/`release:live`로 분리하고, 이 smoke는 release gate에서 CLI write/readback 계약을 재현 가능하게 고정한다.

### Mutable external action approval fabric

새 파일:
- `packages/core/src/agent-action-approvals.ts`
- `.rph/runtime/action-approvals.json`

새 runtime 명령:
- `/agent actions`
- `/agent approve-action <action-id> [--by <name>]`
- `/agent reject-action <action-id> [--reason <reason>] [--by <name>]`

동작:
1. AI agent가 `/notion setup --live`, `/notion sync --live`, `/github create-repo`, `/github setup-labels`, `/github create-issue --live`, `/github create-pr --live` 같은 외부 write 명령을 제안한다.
2. RPH는 명령을 바로 실행하지 않고 `RuntimeActionApprovalRecord`로 저장한다.
3. session은 `blocked`가 되고 `waitCondition.kind=external_live_write`가 된다.
4. 사용자가 `/agent approve-action <id>`를 실행해야 실제 외부 write가 수행된다.
5. 실행 성공 후에도 provider별 readback proof가 있어야 action status는 `completed`가 되고 pending external action은 session에서 해제된다.

GitHub issue/PR은 local-first로 분리됐다. bare `/github create-issue`와 `/github create-pr`는 `.rph` 로컬 기록만 만들고, 실제 GitHub write는 `--live`가 붙은 경우만 approval gate에 들어간다. 승인 실행 후에는 각각 `gh issue view`, `gh pr view` 결과가 `.rph/github/live-issue-*-readback.json`, `.rph/github/live-pr-*-readback.json`에 저장되어야 완료된다.

새 smoke:

```bash
pnpm run smoke:mutable-action
```

검증 범위:
- AI가 Notion live write 명령을 제안
- live write가 즉시 실행되지 않음
- `.rph/runtime/action-approvals.json`에 pending action 생성
- runtime wait condition이 `external_live_write`
- `/agent approve-action <id>` 후 Notion write/readback 실행
- 저장 proof에 token이 섞이지 않음

### ask --execute --loop 경로

`rph ask --execute --loop "<idea>"` 경로가 실제로 productize를 실행하고 orchestration loop로 이어진 뒤 approval gate에서 멈추는 acceptance test가 추가됐다.

### 설치 후 slash helper smoke

install smoke가 이제 wrapper와 sourced shell helper를 더 직접 검증한다.

- `rph /status`
- `rph /pm start`
- sourced zsh helper `/agent status`
- sourced zsh helper `/status`
- sourced zsh helper `/pm start`

### Clean HOME install E2E smoke

새 smoke:

```bash
pnpm run smoke:install-e2e
```

현재 작업트리를 임시 git repo로 패키징한 뒤 `install.sh`가 그 repo를 실제 clone해서 clean HOME에 설치한다.

검증 범위:
- real `git clone`
- real `pnpm install --frozen-lockfile`
- real `pnpm build`
- `~/.local/bin/rph` wrapper
- `~/.config/rph/init.sh`
- guarded shell profile block
- 설치된 CLI의 `rph version`
- fresh product dir의 `rph /pm start`
- fresh product dir의 `rph /status`
- sourced zsh helper `/pm start`
- sourced zsh helper `/status`

이제 release gate에서 stub install smoke와 real install E2E smoke를 둘 다 실행한다.

### Handoff contract 강화

invalid handoff는 queue에 들어가기 전에 거절된다.

예:
- `toAgent=FE`
- `nextCommand=/be spec --ai`

결과:
- `handoff rejected`
- `handoffs.json` 미생성
- runtime session status `blocked`

queued invalid handoff도 orchestration loop에서 실행되지 않고 `blocked`로 남는다.

### Role lane lifecycle

handoff 실행 시 이제 `.rph/runtime/lanes/*.json`에 lane run record가 남는다. `/agent run`은 같은 프로세스에서 바로 command를 호출하지 않고 child CLI worker를 실행한다.

기록 항목:
- role
- stage
- handoffId
- workerId
- workerSessionId
- workerPid
- attempt
- command
- roleContract
- systemPrompt
- allowed command prefixes
- artifact refs
- acceptance criteria
- heartbeat / lease
- result / merge status
- lane memory ref
- tool budget
- status/result

`/agent lanes`로 조회할 수 있다.

### Lane memory / tool budget

각 role lane은 이제 독립 memory 파일을 가진다.

경로:

```text
.rph/runtime/lanes/memory/<role>.jsonl
```

lane run JSON에는 다음이 들어간다.

- `memory.scope`
- `memory.filePath`
- `memory.entriesBefore`
- `memory.entriesAfter`
- `toolBudget.maxToolCalls`
- `toolBudget.remainingToolCalls`
- `toolBudget.maxOutputTokens`
- `toolBudget.externalWriteBudget=0`

검증된 동작:
- lane 시작 시 `started` memory entry 기록
- lane 성공 시 `completed` memory entry 기록
- control-plane merge 시 `merged` memory entry 기록
- lane 실패 시 `failed` memory entry 기록
- `/agent lanes` 출력에 memory entry count와 tool budget 표시

AI-backed handoff 작업은 active lane prompt를 system prompt에 주입한다. 예를 들어 PM handoff에서 `/pm draft product-definition --ai`가 실행되면 `PM lane runner` prompt, lane acceptance, artifact refs가 AI generation prompt에 포함된다.

### Runtime blocked lifecycle

approval gate, unsafe command, handoff contract violation, failed agent action은 이제 단순 blocker 문자열이 아니라 session status `blocked`로 남는다.

blocked session은 `waitCondition.kind=blocked`를 갖고, 다음 안전 실행이나 resume 경로에서 회복된다.

### Handoff mailbox lifecycle

`handoffs.json`은 이제 단순 pending/completed queue가 아니라 mailbox lifecycle을 갖는다.

상태:
- `pending`
- `acknowledged`
- `claimed`
- `running`
- `completed`
- `rejected`
- `dead_letter`

추적 필드:
- `attempts`
- `maxAttempts`
- `claimedBy`
- `workerSessionId`
- `leaseExpiresAt`
- `heartbeatAt`
- `laneRunId`
- `lastFailureReason`
- `deadLetterReason`

검증된 동작:
- active lease가 있으면 다른 worker가 같은 handoff를 가져가지 않는다.
- stale lease는 재claim되어 새 worker가 처리한다.
- 실패한 lane은 maxAttempts 초과 시 dead-letter로 이동하고 state merge를 막는다.
- direct `/agent worker run`은 worker result까지만 만들고, control-plane merge는 `/agent run` parent가 별도로 수행한다.

### MCP readiness 명확화

connection readiness에 `mode`가 추가됐다.

- `adapter-ready`: REST adapter credential/target probe까지 검증됨
- `adapter-write-ready`: GitHub처럼 external write channel이 별도로 있는 adapter에서 target read와 write-capable `gh` permission까지 검증됨
- `adapter-partial`: REST target read는 통과했지만 external write channel preflight가 실패함
- `protocol-partial`: AI/provider protocol 또는 MCP protocol 경로에서 credential/handshake 일부는 통과했지만 최종 generation/tools 단계는 실패함
- `protocol-ready`: AI generation smoke 또는 MCP protocol handshake/tools readiness까지 검증됨
- `unverified`: 필수 env 누락 또는 transport 미검증

출력 예:

```text
trust=adapter-ready:credential-probe
trust=protocol-partial:credential-probe
trust=protocol-ready:protocol-tools-list
```

Notion/Figma는 REST adapter 계열이고, GitHub는 REST target read 위에 `gh` write-channel preflight가 붙은 adapter다. Stitch는 protocol MCP server로 구분된다. `.rph/connections/latest.json`의 `onboardingProof`도 같은 `trustCategory`를 저장한다.

### Provider fallback policy

명시 provider 요청은 엄격하게 유지하고, 자동 provider 선택에서는 active provider가 준비되지 않았거나 request-time 호출이 실패했을 때 다음 configured provider로 넘어간다.

예:
- `activeAiProvider=openai`
- OpenAI env 누락 또는 OpenAI request-time 실패
- Gemini env 정상

결과:
- `generateAiText()`는 Gemini provider를 선택한다.
- 단, 사용자가 `providerId=openai`를 명시하면 fallback하지 않고 실패한다.

추가 증거:
- fallback 성공 테스트
- explicit provider strict failure 테스트
- `pnpm run build` 통과

## 현재 검증 상태

로컬 release gate:

```bash
pnpm run release:check
```

통과 항목:
- lint
- build
- tests: 6 files, 283 tests
- productize smoke
- Hermes e2e smoke
- setup-live-chat smoke
- MCP-runtime smoke
- Notion write/readback smoke
- GitHub repo/label/issue/PR readback smoke
- mutable-action approval smoke
- handoff-worker-race smoke
- top-level golden path smoke
- GitHub onboarding smoke
- install smoke
- clean HOME install E2E smoke

외부 live gate:

```bash
pnpm run live:configured
```

현재 결과:
- Notion: passed, adapter-ready credential-probe
- GitHub: passed only when REST repo read and `gh` write-channel permission both pass (`adapter-write-ready:credential-probe`)
- Stitch: passed, protocol-ready tools-list
- OpenAI: failed, 401 credential
- Gemini: passed, protocol-ready generation smoke
- Anthropic/local/Figma: skipped due missing env

즉 코드가 live 실패를 통과로 포장하지 않고, 실계정/쿼터 문제를 release gate 밖의 live gate에서 명확히 실패시킨다.

## 2026-05-26 추가 진행

Awesome Codex Subagents의 `security-auditor`, `mcp-developer`, `test-automator`, `cli-developer` 관점을 반영해 MCP/approval 신뢰 경계를 강화했다.

- MCP `tools/call`은 이제 local read-only allowlist만으로 충분하지 않다. agent와 operator 경로 모두 현재 `tools/list` metadata의 `annotations.readOnlyHint=true`가 없으면 실패한다.
- `/mcp call --read-only`는 operator intent일 뿐 authority가 아니다. allowlist가 없거나 metadata가 ambiguous하면 `tools/call` 전에 차단된다.
- 승인된 외부 live write는 실행 시점에 `RPH_ACTION_APPROVAL_ID`, approval fingerprint, running timestamp를 readback writer에 주입한다. Notion/GitHub readback artifact가 이 binding을 갖지 않거나 stale이면 approval completion이 실패한다.
- unknown approval-gated action은 더 이상 `not_required` readback으로 완료되지 않는다. readback contract가 없으면 failed readback으로 남는다.
- `.rph` 내부 durable state는 directory `0700`, file `0600`으로 강제된다. chat/proof/runtime/lane JSONL append 경로도 같은 helper를 사용한다.
- acceptance/smoke fake MCP servers도 read-only tool metadata를 명시하도록 갱신했다.

최신 local gate:

```bash
pnpm run release:check
```

현재 결과: passed. `lint`, `build`, 6 test files / 286 tests, productize, Hermes E2E, setup-chat, provider-onboarding, MCP-runtime, Notion/GitHub readback, mutable-action, handoff-worker-race, top-level golden path, GitHub onboarding, install, clean HOME install E2E smoke가 모두 통과했다.

현재 추가 local suite:

```bash
pnpm test
```

결과: passed. 6 test files / 286 tests.

추가 targeted suite:

```bash
pnpm exec vitest run tests/hermes-acceptance.test.ts -t "non-current connection proof|runtime /status guidance|dead worker lease|long-running worker lease"
```

결과: passed. 4 tests.

추가 targeted suite:

```bash
pnpm exec vitest run tests/hermes-acceptance.test.ts -t "worker-pool|long-running worker lease|direct worker completion"
```

결과: passed. 3 tests.

추가 targeted suite:

```bash
pnpm run build && pnpm exec vitest run tests/hermes-acceptance.test.ts -t "runtime handoff queue|foreground worker pool|worker pool stop|durable pool state|worker-pool|direct worker completion|long-running worker lease"
```

결과: passed. 6 tests.

최신 configured live gate:

```bash
pnpm run live:configured
```

결과: failed, 하지만 실패 원인은 코드 gate가 아니라 현재 계정/credential 상태다.

- Notion: passed, `adapter-ready:credential-probe`, target `Notion page 2b84a2...57ad14`
- GitHub: passed, `adapter-write-ready:credential-probe`, target `gywns0417/real-product-harness`
- Stitch: passed, `protocol-ready:protocol-tools-list`
- OpenAI: failed, credential probe 401
- Gemini: passed, `protocol-ready:protocol-tool-call`, target `gemini gemini-2.5-flash`
- Anthropic/local/Figma: skipped due missing env

## 남은 핵심 부족분

### P0

1. 독립 lane 실행
   - child CLI worker boundary, worker pid, claim/lease/heartbeat/dead-letter, result merge boundary는 구현됐다.
   - lane별 독립 memory와 tool budget 기록이 추가됐다.
   - async child process dispatch와 `--concurrency` 기반 batch scheduler가 추가됐다.
   - tool budget은 실행 전 차감/차단된다.
   - ready `stageQueue` fan-out branch는 handoff mailbox로 자동 물질화된다.
   - ready fan-in은 `/agent reduce <stage>` Orchestrator handoff로 물질화되고, merged lane proof와 approved engineering artifacts 없이는 blocked 상태로 남는다.
   - reducer packet은 source lane-run materialization key를 갖고, stale reducer epoch는 completion으로 인정하지 않는다.
   - claim token/attempt ownership이 추가되어 stale worker가 재claim 이후 현재 handoff를 완료/실패/heartbeat로 덮어쓸 수 없다.
   - dead worker pid reaping이 추가되어 `/agent recover`와 `/agent run`이 죽은 claimed/running worker를 즉시 실패 처리하고 handoff를 requeue/dead-letter로 복구한다.
   - long-running worker heartbeat renewal이 추가되어 정상 실행 중인 worker는 짧은 lease에서도 중간에 다른 worker에게 steal되지 않는다.
   - `/agent workers`가 추가되어 worker-pool health, dead/reclaimable lease, completed-pending-merge, safe next command를 한 화면에서 볼 수 있다.
   - direct worker가 완료만 하고 merge하지 않은 lane result는 `/agent run`/`/agent recover`가 reattach해 control-plane merge한다.
   - `/agent pool run|status|stop` foreground persistent supervisor가 추가되어 handoff mailbox polling, pool heartbeat, idle timeout, durable stop request, status redaction을 갖는다.
   - launchd service surface와 drain/force-stop semantics는 1차로 닫혔다. 남은 단계는 slot별 worker state, deeper recovery, full durable DAG queue다.

2. Mutable tool fabric
   - agent tool fabric은 read-only 중심으로 유지한다.
   - 외부 write action approval record, `/agent actions`, `/agent approve-action`, `/agent reject-action`이 추가됐다.
   - Notion live write/readback CLI smoke와 GitHub repo/label readback smoke는 추가됐다.
   - approval mutation은 lock/stale-lock recovery/one-shot `pending -> running` 전환을 갖는다.
   - approval execution은 current runtime session의 pending external-write gate에 묶이고, Notion/GitHub target drift는 실행 전에 차단된다.
   - GitHub issue/PR의 local artifact snapshot binding은 닫혔다.
   - mutable MCP tools/call의 첫 approval/readback rail은 닫혔다. 남은 단계는 이를 실계정 provider canary와 더 넓은 tool-specific verifier로 확대하는 것이다.

### P1

1. Interactive setup recovery
   - live fail 시 원인/다음 액션/재시도 명령을 출력한다.
   - live pass 시 첫 value action을 출력한다. AI는 첫 chat command, Notion은 첫 write/readback command, GitHub는 `gh` write channel까지 verified된 경우에만 첫 label readback command를 보여주고, Figma/Stitch는 agent tool-surface proof를 보여준다.
   - missing/bad credential은 같은 runtime wizard 안에서 수정 후 즉시 재시도할 수 있다.
   - provider identity echo가 추가됐다. passed live check는 `Verified targets`로 AI provider/model, GitHub owner/repo, Notion page UUID, Figma file id, Stitch server id를 보여주고 `.rph/connections/latest.json`의 non-secret identity sibling으로 남긴다.
   - first-action proof가 추가됐다. passed live check는 `First action verified`로 AI generation smoke, REST adapter target read, protocol MCP `tools/list`를 non-secret sibling으로 남긴다.
   - `/status`가 제품형 readiness headline을 갖는다. inventory 출력 전에 harness 상태, chat/tool readiness, next command를 먼저 보여준다.
   - `/status`는 latest connection proof가 current인지 아닌지를 구분한다. stale/mock/config-drifted report는 `live_verification=not-current`와 `Last known verification (not current)`로 표시하고, shell/runtime 표면별 다음 명령을 다르게 출력한다.
   - plain chat 이후 latest agent tool proof가 추가됐다. setup/live 이후 `ask`가 실제 MCP read tool call을 수행하면 `/status`와 `/agent status`가 tool name과 non-secret result summary를 보여준다.
   - live connection proof가 agent context로 들어간다. agent는 verified target, first action, available read tools를 prompt에서 보고 도구를 고른다.
   - protocol MCP tool call은 canonical `mcp.tools.call`로 실행된다. Stitch 전용 alias는 backward compatibility용으로만 남긴다.
   - 남은 단계는 이 proof를 Stitch뿐 아니라 GitHub/Notion/Figma read tool까지 같은 customer-facing 형태로 넓히고, live 실계정 환경에서 provider별로 반복 검증하는 것이다.

2. Work queue ownership
   - handoff mailbox는 claim/lease/heartbeat/dead-letter/result merge를 갖는다.
   - `stageQueue`는 더 이상 순수 preview가 아니다. session reload 이후 completed/active queue lifecycle을 보존하고 `/next --execute`가 persisted queue head를 따른다.
   - ready `stageQueue` branch는 handoff mailbox로 자동 물질화되어 `/agent run --concurrency`에서 병렬 lane으로 dispatch된다.
   - ready fan-in reducer는 first-class handoff로 실행되고, branch completion aggregation은 accepted/merged lane proof와 approved artifact set을 기준으로 계산된다.
   - handoff claim token/attempt ownership이 merge proof까지 관통한다.
   - dead worker lease reaping과 long-running worker heartbeat renewal은 들어갔다.
   - worker supervision surface와 completed lane result reattach가 들어갔다.
   - foreground persistent worker pool은 들어갔다.
   - 아직 full DAG task queue는 아니다. slot별 worker state와 deeper recovery reattach는 별도 과제로 남아 있다.

3. External write readback
   - Notion setup/sync와 GitHub repo/label write 후 readback 검증은 smoke로 고정됐다.
   - GitHub issue/PR readback은 local approval snapshot과 per-artifact proof에 묶였다.
   - mutable MCP write의 approval-local readback rail은 들어갔고, deploy 계열 readback과 실계정 mutable MCP canary는 아직 확대가 필요하다.

4. Runtime chat/control boundary
   - 이전에 구현했던 command-like 자연어 alias는 기본 실행 경로에서 제거됐다.
   - 일반 텍스트는 `계속 진행해`, `현재 상태 보여줘`, `승인해`, `continue`처럼 command-like로 보여도 chat으로 들어간다.
   - chat에서 나온 command proposal도 기본적으로 `suggested control`로만 출력되고, read-only/status/local-next/external approval queue 모두 자동 실행하지 않는다.
   - control은 slash command 또는 명시 실행 표면으로만 확정된다.
   - top-level bare text는 one-shot chat으로 라우팅되고, `statsu`처럼 실제 command typo로 보이는 단일 토큰만 suggestion을 유지한다.
   - 남은 단계는 setup/start/status/help의 모든 fallback copy를 같은 runtime-first 언어로 계속 압축하는 것이다.

4. Runtime generation fallback
   - 준비 상태 fallback과 request-time generation failover가 구현됐다.
   - fallback 발생 사실은 session/chat/run record와 사용자-facing copy에 남는다.
   - `/ai status`, `/agent status`, agent tool fabric의 `provider.status`에서 최근 fallback summary를 조회할 수 있다.

## 다음 구현 순서

1. 실계정 mutable MCP canary: approval-local `mcp.tool-call` snapshot/readback rail을 fake MCP smoke에서 실제 provider sandbox write/readback까지 올리기
2. live trust loop 정리: `doctor --live`, `scripts/live-matrix.mjs`까지 setup auto와 같은 MCP contract/readiness/report refresh 계약으로 맞추기
3. stageQueue canonical contract를 reducer epoch/attempt invalidation과 full DAG task queue로 확장
4. slot별 worker state와 session hydration/recovery
5. deploy 계열 external write도 approval/readback rail에 편입
