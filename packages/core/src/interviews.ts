import path from "node:path";
import { interviewsDir } from "./paths";
import { ensureDir, listFiles, writeJson } from "./fs";
import { DocumentId, InterviewSession } from "./types";
import { nowIso } from "./time";

export function createInterviewSession(projectRoot: string, docId: DocumentId): InterviewSession {
  const dir = interviewsDir(projectRoot, docId);
  ensureDir(dir);
  const count = listFiles(dir).filter((file) => file.endsWith(".json")).length + 1;
  const session: InterviewSession = {
    id: `session-${String(count).padStart(3, "0")}`,
    docId,
    status: "draft",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    stages: [
      {
        id: "intent-discovery",
        title: "Interview Stage 1: Intent Discovery",
        goal: "제품 의도, 사용자, 문제, 가치 검증",
        questions: [
          "이 제품이 반드시 해결해야 하는 가장 비싼 문제는 무엇입니까?",
          "첫 번째 유료 사용자 또는 내부 사용자는 누구입니까?",
          "사용자가 지금 쓰는 대안은 무엇이며 어디서 막힙니까?",
          "성공했다는 것을 어떤 행동/지표로 확인합니까?",
          "이번 버전에서 의도적으로 하지 않을 일은 무엇입니까?"
        ],
        summary: null
      },
      {
        id: "scenario-deepening",
        title: "Interview Stage 2: Scenario Deepening",
        goal: "사용 흐름, 예외 상황, 우선순위 구체화",
        questions: [
          "사용자가 처음 제품을 여는 순간부터 결과를 얻는 흐름을 순서대로 설명해 주세요.",
          "실패하거나 중단되는 대표 예외 상황은 무엇입니까?",
          "반드시 자동화해야 하는 단계와 사람이 승인해야 하는 단계는 무엇입니까?",
          "MVP에서 P0/P1/P2로 나눌 기능은 무엇입니까?",
          "데이터, 권한, 보안상 민감한 경계는 어디입니까?"
        ],
        summary: null
      },
      {
        id: "confirmation",
        title: "Interview Stage 3: Confirmation",
        goal: "문서 반영 내용 최종 확인",
        questions: [
          "문서에 반드시 포함해야 하는 표현이나 금지할 표현이 있습니까?",
          "승인 기준으로 삼을 체크리스트는 무엇입니까?",
          "초안 작성 전에 정정할 사실이나 우선순위가 있습니까?"
        ],
        summary: null
      }
    ]
  };
  writeJson(path.join(dir, `${session.id}.json`), session);
  return session;
}

export function renderInterview(session: InterviewSession): string {
  const lines = [`${session.docId} ${session.id}`];
  for (const stage of session.stages) {
    lines.push("", stage.title, `목표: ${stage.goal}`);
    stage.questions.forEach((question, index) => {
      lines.push(`${index + 1}. ${question}`);
    });
  }
  return lines.join("\n");
}
