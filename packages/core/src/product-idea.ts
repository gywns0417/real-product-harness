const PRODUCTIZE_PREFIX_HINTS = [
  "아이디어",
  "idea",
  "mvp",
  "제품화",
  "productize",
  "스펙",
  "spec",
  "fe/be",
  "frontend",
  "backend",
  "프론트",
  "백엔드",
  "작업",
  "만들",
  "생성",
  "바꿔"
];

export function extractProductIdea(input: string): string {
  const normalized = stripWrappingQuotes(input.replace(/\s+/g, " ").trim());
  if (!normalized) {
    return "";
  }

  const delimiterIndex = normalized.search(/[:：]/);
  if (delimiterIndex > -1) {
    const prefix = normalized.slice(0, delimiterIndex);
    const candidate = stripWrappingQuotes(normalized.slice(delimiterIndex + 1).trim());
    if (candidate && looksLikeProductizeInstruction(prefix)) {
      return candidate;
    }
  }

  return normalized;
}

function looksLikeProductizeInstruction(text: string): boolean {
  const normalized = text.toLowerCase();
  return PRODUCTIZE_PREFIX_HINTS.some((hint) => normalized.includes(hint.toLowerCase()));
}

function stripWrappingQuotes(text: string): string {
  let next = text.trim();
  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ["`", "`"],
    ["“", "”"],
    ["‘", "’"]
  ];
  let changed = true;
  while (changed && next.length >= 2) {
    changed = false;
    for (const [open, close] of pairs) {
      if (next.startsWith(open) && next.endsWith(close)) {
        next = next.slice(open.length, next.length - close.length).trim();
        changed = true;
      }
    }
  }
  return next;
}
