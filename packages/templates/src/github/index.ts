import { DEFAULT_GITHUB_LABELS } from "../../../core/src/github";

export function labelMarkdown(): string {
  return DEFAULT_GITHUB_LABELS.map((label) => `- ${label.name}: ${label.description}`).join("\n");
}
