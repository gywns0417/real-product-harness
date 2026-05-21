export interface ParsedCommand {
  command: string;
  subcommand?: string;
  args: string[];
  options: Record<string, string | boolean>;
}

export const TOP_LEVEL_COMMANDS = [
  "help",
  "version",
  "shell",
  "runtime",
  "init",
  "status",
  "next",
  "pause",
  "resume",
  "cancel",
  "setup",
  "settings",
  "ask",
  "agent",
  "chat",
  "ai",
  "mcp",
  "doctor",
  "productize",
  "pm",
  "pd",
  "fe",
  "be",
  "qa",
  "notion",
  "docs",
  "github"
] as const;

const COMMAND_ALIASES: Record<string, string> = {
  "-h": "help",
  "--help": "help",
  "-v": "version",
  "--version": "version"
};

export function parseCli(argv: string[]): ParsedCommand {
  const normalizedArgv = normalizeCliArgv(argv);
  const [command = "help", subcommandCandidate, ...rest] = normalizedArgv;
  const hasSubcommand = subcommandCandidate !== undefined && !subcommandCandidate.startsWith("-");
  const subcommand = hasSubcommand ? subcommandCandidate : undefined;
  const argsAndOptions = hasSubcommand ? rest : [subcommandCandidate, ...rest].filter((value): value is string => Boolean(value));
  const args: string[] = [];
  const options: Record<string, string | boolean> = {};
  for (let index = 0; index < argsAndOptions.length; index += 1) {
    const token = argsAndOptions[index];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argsAndOptions[index + 1];
      if (next && !next.startsWith("--")) {
        options[key] = next;
        index += 1;
      } else {
        options[key] = true;
      }
    } else {
      args.push(token);
    }
  }
  return { command, subcommand, args, options };
}

export function normalizeCliArgv(argv: string[]): string[] {
  const normalizedArgv = normalizeSlashArgv(argv[0] === "--" ? argv.slice(1) : argv);
  if (normalizedArgv.length === 0) {
    return normalizedArgv;
  }
  const [first, ...rest] = normalizedArgv;
  const alias = COMMAND_ALIASES[first];
  return alias ? [alias, ...rest] : normalizedArgv;
}

export function normalizeSlashArgv(argv: string[]): string[] {
  if (argv.length === 0) {
    return argv;
  }
  const [first, ...rest] = argv;
  if (first === "/") {
    return ["help", ...rest];
  }
  if (first.startsWith("/") && first.length > 1) {
    return [first.slice(1), ...rest];
  }
  return argv;
}

export function parseCommandLine(input: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: "\"" | "'" | null = null;
  let escaping = false;

  for (const char of input.trim()) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current.length > 0) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (escaping) {
    current += "\\";
  }
  if (quote) {
    throw new Error("unterminated quote in command line");
  }
  if (current.length > 0) {
    args.push(current);
  }
  return args;
}

export function optionString(options: Record<string, string | boolean>, key: string): string | undefined {
  const value = options[key];
  return typeof value === "string" ? value : undefined;
}

export function optionBool(options: Record<string, string | boolean>, key: string): boolean {
  return options[key] === true || options[key] === "true";
}

export function isKnownTopLevelCommand(command: string): boolean {
  return TOP_LEVEL_COMMANDS.includes(command as (typeof TOP_LEVEL_COMMANDS)[number]);
}

export function suggestCommand(input: string, candidates: readonly string[] = TOP_LEVEL_COMMANDS): string | undefined {
  const normalizedInput = input.replace(/^\//, "").trim().toLowerCase();
  if (!normalizedInput) {
    return undefined;
  }

  let bestCandidate: string | undefined;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const score = levenshteinDistance(normalizedInput, candidate.toLowerCase());
    if (score < bestScore) {
      bestCandidate = candidate;
      bestScore = score;
    }
  }

  if (!bestCandidate) {
    return undefined;
  }

  const threshold = normalizedInput.length <= 4 ? 2 : 3;
  return bestScore <= threshold ? bestCandidate : undefined;
}

function levenshteinDistance(left: string, right: string): number {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row;
  }
  for (let col = 0; col < cols; col += 1) {
    matrix[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost
      );
    }
  }

  return matrix[left.length][right.length];
}
