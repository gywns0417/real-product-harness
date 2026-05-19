export interface ParsedCommand {
  command: string;
  subcommand?: string;
  args: string[];
  options: Record<string, string | boolean>;
}

export function parseCli(argv: string[]): ParsedCommand {
  const normalizedArgv = normalizeSlashArgv(argv[0] === "--" ? argv.slice(1) : argv);
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
