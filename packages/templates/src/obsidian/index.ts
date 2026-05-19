import { OBSIDIAN_STRUCTURE } from "../../../core/src/obsidian";

export function obsidianStructureMarkdown(): string {
  return OBSIDIAN_STRUCTURE.map((folder) => `- ${folder}`).join("\n");
}
