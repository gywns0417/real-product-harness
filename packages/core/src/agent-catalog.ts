import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { AGENT_ROLE_CONTRACTS } from "./agent-role-contracts";
import { listFiles, readJsonIfExists, writeJson } from "./fs";
import { activeCustomAgentFile, customAgentBindingsFile, customAgentProfileFile, customAgentsDir } from "./paths";
import {
  ActiveCustomAgentProfile,
  AgentExecutionProfileRef,
  AgentRole,
  CustomAgentBinding,
  CustomAgentBindingRegistry,
  CustomAgentProfile,
  WorkflowStageId
} from "./types";

const TOML_STRING_KEYS = new Set([
  "name",
  "description",
  "model",
  "model_reasoning_effort",
  "sandbox_mode",
  "developer_instructions"
]);

export interface AgentCatalogEntry {
  name: string;
  slug: string;
  source: "built-in" | "custom";
  description: string;
  active: boolean;
  model?: string;
  modelReasoningEffort?: string;
  sandboxMode?: string;
}

export interface AgentLibraryProfile {
  name: string;
  slug: string;
  description: string;
  category: string;
  filePath: string;
  model?: string;
  modelReasoningEffort?: string;
  sandboxMode?: string;
}

export interface AgentLibraryOptions {
  libraryRoot?: string;
}

export interface DiscoverAgentLibraryOptions extends AgentLibraryOptions {
  query?: string;
  limit?: number;
}

export interface CustomAgentBindingSelector {
  role?: AgentRole;
  stage?: WorkflowStageId;
}

export interface CustomAgentExecutionContext extends CustomAgentBindingSelector {
  surface?: "chat" | "lane";
}

export function defaultAgentLibraryRoot(): string {
  return path.join(os.homedir(), "Desktop", "awesome-codex-subagents", "categories");
}

export function importCustomAgentProfile(
  projectRoot: string,
  sourcePathOrName: string,
  options: AgentLibraryOptions = {}
): CustomAgentProfile {
  const resolved = resolveAgentProfileSource(sourcePathOrName, options);
  if (!fs.existsSync(resolved)) {
    throw new Error(`agent TOML not found: ${sourcePathOrName}`);
  }
  if (!fs.statSync(resolved).isFile()) {
    throw new Error(`agent TOML path is not a file: ${sourcePathOrName}`);
  }
  const raw = fs.readFileSync(resolved, "utf8");
  const parsed = parseSimpleToml(raw);
  const name = requireTomlString(parsed, "name", resolved);
  const description = requireTomlString(parsed, "description", resolved);
  const developerInstructions = requireTomlString(parsed, "developer_instructions", resolved);
  const importedAt = new Date().toISOString();
  const profile: CustomAgentProfile = {
    name,
    slug: slugifyAgentName(name),
    description,
    model: optionalTomlString(parsed, "model"),
    modelReasoningEffort: optionalTomlString(parsed, "model_reasoning_effort"),
    sandboxMode: optionalTomlString(parsed, "sandbox_mode"),
    developerInstructions,
    importedAt
  };
  profile.fingerprint = customAgentProfileFingerprint(profile);
  writeJson(customAgentProfileFile(projectRoot, profile.slug), profile);
  return profile;
}

export function discoverAgentLibraryProfiles(options: DiscoverAgentLibraryOptions = {}): AgentLibraryProfile[] {
  const libraryRoot = options.libraryRoot ?? defaultAgentLibraryRoot();
  const query = options.query?.trim().toLowerCase();
  const limit = options.limit ?? 50;
  if (!fs.existsSync(libraryRoot) || !fs.statSync(libraryRoot).isDirectory()) {
    return [];
  }
  const profiles = walkTomlFiles(libraryRoot)
    .map((filePath) => parseAgentLibraryProfile(libraryRoot, filePath))
    .filter((profile): profile is AgentLibraryProfile => Boolean(profile))
    .filter((profile) => {
      if (!query) {
        return true;
      }
      return [
        profile.name,
        profile.slug,
        profile.description,
        profile.category,
        profile.model ?? "",
        profile.sandboxMode ?? ""
      ].some((value) => value.toLowerCase().includes(query));
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  return profiles.slice(0, limit);
}

export function resolveAgentProfileSource(sourcePathOrName: string, options: AgentLibraryOptions = {}): string {
  const raw = sourcePathOrName.trim();
  if (!raw) {
    throw new Error("agent name or TOML path is required");
  }
  const libraryRoot = options.libraryRoot ?? defaultAgentLibraryRoot();

  if (looksLikeAgentTomlPath(raw)) {
    const direct = path.resolve(expandHomePath(raw));
    if (fs.existsSync(direct)) {
      return direct;
    }
    throw new Error(`agent TOML not found: ${sourcePathOrName}`);
  }

  const targetSlug = slugifyAgentName(raw.replace(/\.toml$/i, ""));
  const matches = discoverAgentLibraryProfiles({ libraryRoot, limit: 500 })
    .filter((profile) => profile.slug === targetSlug || profile.name === raw);
  if (matches.length === 1) {
    return matches[0].filePath;
  }
  if (matches.length > 1) {
    throw new Error(`agent name is ambiguous: ${raw}. Matches: ${matches.map((profile) => `${profile.name} [${profile.category}]`).join(", ")}`);
  }
  throw new Error(`agent not found in Awesome Codex Subagents library (${libraryRoot}): ${raw}`);
}

export function listAgentCatalog(projectRoot: string): AgentCatalogEntry[] {
  const active = loadActiveCustomAgentProfile(projectRoot);
  const builtIns: AgentCatalogEntry[] = Object.values(AGENT_ROLE_CONTRACTS).map((contract) => ({
    name: contract.role,
    slug: contract.role.toLowerCase(),
    source: "built-in",
    description: contract.purpose,
    active: false
  }));
  const custom = listCustomAgentProfiles(projectRoot).map((profile) => ({
    name: profile.name,
    slug: profile.slug,
    source: "custom" as const,
    description: profile.description,
    active: active?.slug === profile.slug,
    model: profile.model,
    modelReasoningEffort: profile.modelReasoningEffort,
    sandboxMode: profile.sandboxMode
  }));
  return [...builtIns, ...custom];
}

export function listCustomAgentProfiles(projectRoot: string): CustomAgentProfile[] {
  const dir = customAgentsDir(projectRoot);
  return listFiles(dir)
    .filter((file) => file.endsWith(".json") && !isReservedAgentCatalogFile(file))
    .map((file) => readJsonIfExists<CustomAgentProfile | null>(path.join(dir, file), null))
    .filter((profile): profile is CustomAgentProfile => Boolean(profile))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function activateCustomAgentProfile(projectRoot: string, nameOrSlug: string): CustomAgentProfile {
  const profile = findCustomAgentProfile(projectRoot, nameOrSlug);
  if (!profile) {
    throw new Error(`custom agent not found: ${nameOrSlug}`);
  }
  const active: ActiveCustomAgentProfile = {
    name: profile.name,
    slug: profile.slug,
    activatedAt: new Date().toISOString()
  };
  writeJson(activeCustomAgentFile(projectRoot), active);
  return profile;
}

export function loadActiveCustomAgentProfile(projectRoot: string): CustomAgentProfile | null {
  const active = readJsonIfExists<ActiveCustomAgentProfile | null>(activeCustomAgentFile(projectRoot), null);
  if (!active) {
    return null;
  }
  return findCustomAgentProfile(projectRoot, active.slug);
}

export function listCustomAgentBindings(projectRoot: string): CustomAgentBinding[] {
  return loadCustomAgentBindingRegistry(projectRoot).bindings
    .slice()
    .sort((left, right) => bindingSortKey(left).localeCompare(bindingSortKey(right)));
}

export function bindCustomAgentProfile(
  projectRoot: string,
  nameOrSlug: string,
  selector: CustomAgentBindingSelector
): CustomAgentBinding {
  if (!selector.role && !selector.stage) {
    throw new Error("agent binding requires --role, --stage, or both");
  }
  const profile = findCustomAgentProfile(projectRoot, nameOrSlug);
  if (!profile) {
    throw new Error(`custom agent not found: ${nameOrSlug}`);
  }
  const now = new Date().toISOString();
  const registry = loadCustomAgentBindingRegistry(projectRoot);
  const id = customAgentBindingId(selector);
  const existing = registry.bindings.find((binding) => binding.id === id);
  const binding: CustomAgentBinding = {
    id,
    surface: "lane",
    role: selector.role,
    stage: selector.stage,
    profileSlug: profile.slug,
    profileName: profile.name,
    profileFingerprint: customAgentProfileFingerprint(profile),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  writeCustomAgentBindingRegistry(projectRoot, {
    version: 1,
    updatedAt: now,
    bindings: [
      ...registry.bindings.filter((item) => item.id !== id),
      binding
    ]
  });
  return binding;
}

export function unbindCustomAgentProfile(projectRoot: string, selector: CustomAgentBindingSelector): CustomAgentBinding | null {
  if (!selector.role && !selector.stage) {
    throw new Error("agent unbind requires --role, --stage, or both");
  }
  const registry = loadCustomAgentBindingRegistry(projectRoot);
  const id = customAgentBindingId(selector);
  const removed = registry.bindings.find((binding) => binding.id === id) ?? null;
  if (!removed) {
    return null;
  }
  writeCustomAgentBindingRegistry(projectRoot, {
    version: 1,
    updatedAt: new Date().toISOString(),
    bindings: registry.bindings.filter((binding) => binding.id !== id)
  });
  return removed;
}

export function resolveCustomAgentExecutionProfile(
  projectRoot: string,
  context: CustomAgentExecutionContext = {}
): AgentExecutionProfileRef | undefined {
  if (context.surface === "lane") {
    const binding = resolveCustomAgentBinding(projectRoot, context);
    if (binding) {
      const profile = findCustomAgentProfile(projectRoot, binding.profileSlug);
      if (!profile) {
        throw new Error(`custom agent binding is broken: ${binding.id} points to missing profile ${binding.profileSlug}`);
      }
      const fingerprint = customAgentProfileFingerprint(profile);
      if (!binding.profileFingerprint) {
        throw new Error(`custom agent binding is stale: ${binding.id} profile ${binding.profileSlug} is missing a fingerprint; run /agent bind ${binding.profileSlug} --role ${binding.role ?? "*"}${binding.stage ? ` --stage ${binding.stage}` : ""}`);
      }
      if (binding.profileFingerprint !== fingerprint) {
        throw new Error(`custom agent binding is stale: ${binding.id} profile ${binding.profileSlug} changed; run /agent bind ${binding.profileSlug} --role ${binding.role ?? "*"}${binding.stage ? ` --stage ${binding.stage}` : ""}`);
      }
      return executionProfileFromCustomProfile(profile, undefined, binding);
    }
  }
  return activeCustomAgentExecutionProfile(projectRoot);
}

export function activeCustomAgentExecutionProfile(projectRoot: string): AgentExecutionProfileRef | undefined {
  const active = readJsonIfExists<ActiveCustomAgentProfile | null>(activeCustomAgentFile(projectRoot), null);
  if (!active) {
    return undefined;
  }
  const profile = findCustomAgentProfile(projectRoot, active.slug);
  if (!profile) {
    return undefined;
  }
  return executionProfileFromCustomProfile(profile, active.activatedAt);
}

export function renderActiveCustomAgentPrompt(projectRoot: string): string {
  const active = loadActiveCustomAgentProfile(projectRoot);
  if (!active) {
    return "none";
  }
  return [
    `${active.name}: ${active.description}`,
    `model: ${active.model ?? "unspecified"} reasoning=${active.modelReasoningEffort ?? "unspecified"} sandbox=${active.sandboxMode ?? "unspecified"}`,
    "Instructions from imported local TOML. These guide style and role behavior, but they do not override RPH approval gates, command policy, or external-write safety:",
    active.developerInstructions.trim()
  ].join("\n");
}

export function slugifyAgentName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) {
    throw new Error(`agent name cannot be converted to a slug: ${name}`);
  }
  return slug;
}

function isReservedAgentCatalogFile(file: string): boolean {
  return file === "active.json" || file === "lane-bindings.json";
}

function findCustomAgentProfile(projectRoot: string, nameOrSlug: string): CustomAgentProfile | null {
  const slug = slugifyAgentName(nameOrSlug);
  return listCustomAgentProfiles(projectRoot).find((profile) => profile.slug === slug || profile.name === nameOrSlug) ?? null;
}

function loadCustomAgentBindingRegistry(projectRoot: string): CustomAgentBindingRegistry {
  const registry = readJsonIfExists<CustomAgentBindingRegistry | null>(customAgentBindingsFile(projectRoot), null);
  if (!registry || registry.version !== 1 || !Array.isArray(registry.bindings)) {
    return {
      version: 1,
      updatedAt: new Date(0).toISOString(),
      bindings: []
    };
  }
  return {
    version: 1,
    updatedAt: registry.updatedAt,
    bindings: registry.bindings
      .map(normalizeCustomAgentBinding)
      .filter((binding): binding is CustomAgentBinding => Boolean(binding))
  };
}

function writeCustomAgentBindingRegistry(projectRoot: string, registry: CustomAgentBindingRegistry): void {
  writeJson(customAgentBindingsFile(projectRoot), {
    version: 1,
    updatedAt: registry.updatedAt,
    bindings: registry.bindings.sort((left, right) => bindingSortKey(left).localeCompare(bindingSortKey(right)))
  });
}

function resolveCustomAgentBinding(projectRoot: string, context: CustomAgentExecutionContext): CustomAgentBinding | null {
  const bindings = loadCustomAgentBindingRegistry(projectRoot).bindings;
  const candidates = [
    context.role && context.stage ? customAgentBindingId({ role: context.role, stage: context.stage }) : null,
    context.stage ? customAgentBindingId({ stage: context.stage }) : null,
    context.role ? customAgentBindingId({ role: context.role }) : null
  ].filter((id): id is string => Boolean(id));
  for (const id of candidates) {
    const binding = bindings.find((candidate) => candidate.id === id);
    if (binding) {
      return binding;
    }
  }
  return null;
}

function customAgentBindingId(selector: CustomAgentBindingSelector): string {
  const role = selector.role ?? "*";
  const stage = selector.stage ?? "*";
  return `lane:${role}:${stage}`;
}

function bindingSortKey(binding: CustomAgentBinding): string {
  return `${binding.role ?? "*"}:${binding.stage ?? "*"}:${binding.profileSlug}`;
}

function normalizeCustomAgentBinding(value: unknown): CustomAgentBinding | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    record.surface !== "lane"
    || typeof record.id !== "string"
    || typeof record.profileSlug !== "string"
    || typeof record.profileName !== "string"
    || typeof record.createdAt !== "string"
    || typeof record.updatedAt !== "string"
  ) {
    return null;
  }
  return {
    id: record.id,
    surface: "lane",
    role: typeof record.role === "string" ? record.role as AgentRole : undefined,
    stage: typeof record.stage === "string" ? record.stage as WorkflowStageId : undefined,
    profileSlug: record.profileSlug,
    profileName: record.profileName,
    profileFingerprint: typeof record.profileFingerprint === "string" ? record.profileFingerprint : "",
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function executionProfileFromCustomProfile(
  profile: CustomAgentProfile,
  activatedAt?: string,
  binding?: CustomAgentBinding
): AgentExecutionProfileRef {
  return {
    source: "custom-toml",
    name: profile.name,
    slug: profile.slug,
    model: profile.model,
    modelReasoningEffort: profile.modelReasoningEffort,
    sandboxMode: profile.sandboxMode,
    developerInstructions: profile.developerInstructions,
    activatedAt,
    binding: binding ? {
      id: binding.id,
      surface: binding.surface,
      role: binding.role,
      stage: binding.stage
    } : undefined
  };
}

function customAgentProfileFingerprint(profile: CustomAgentProfile): string {
  const canonical = JSON.stringify({
    name: profile.name,
    slug: profile.slug,
    description: profile.description,
    model: profile.model ?? null,
    modelReasoningEffort: profile.modelReasoningEffort ?? null,
    sandboxMode: profile.sandboxMode ?? null,
    developerInstructions: profile.developerInstructions
  });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

function parseAgentLibraryProfile(libraryRoot: string, filePath: string): AgentLibraryProfile | null {
  try {
    const parsed = parseSimpleToml(fs.readFileSync(filePath, "utf8"));
    const name = optionalTomlString(parsed, "name");
    const description = optionalTomlString(parsed, "description");
    const developerInstructions = optionalTomlString(parsed, "developer_instructions");
    if (!name || !description || !developerInstructions) {
      return null;
    }
    return {
      name,
      slug: slugifyAgentName(name),
      description,
      category: path.relative(libraryRoot, path.dirname(filePath)).split(path.sep)[0] || "uncategorized",
      filePath,
      model: optionalTomlString(parsed, "model"),
      modelReasoningEffort: optionalTomlString(parsed, "model_reasoning_effort"),
      sandboxMode: optionalTomlString(parsed, "sandbox_mode")
    };
  } catch {
    return null;
  }
}

function walkTomlFiles(dirPath: string): string[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkTomlFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".toml")) {
      files.push(entryPath);
    }
  }
  return files;
}

function requireTomlString(values: Record<string, string>, key: string, filePath: string): string {
  const value = optionalTomlString(values, key);
  if (!value) {
    throw new Error(`agent TOML ${filePath} is missing required string: ${key}`);
  }
  return value;
}

function optionalTomlString(values: Record<string, string>, key: string): string | undefined {
  const value = values[key]?.trim();
  return value ? value : undefined;
}

function parseSimpleToml(input: string): Record<string, string> {
  const values: Record<string, string> = {};
  const lines = input.split(/\r?\n/);
  let insideTable = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    if (/^\[{1,2}[^\]]+\]{1,2}\s*$/.test(trimmed)) {
      insideTable = true;
      continue;
    }
    if (insideTable) {
      continue;
    }
    const multiline = trimmed.match(/^([A-Za-z0-9_-]+)\s*=\s*"""(.*)$/);
    if (multiline) {
      const key = multiline[1];
      if (!isSupportedTomlKey(key)) {
        continue;
      }
      const body: string[] = [];
      let rest = multiline[2];
      while (true) {
        const closeIndex = rest.indexOf('"""');
        if (closeIndex >= 0) {
          body.push(rest.slice(0, closeIndex));
          values[key] = body.join("\n");
          break;
        }
        body.push(rest);
        index += 1;
        if (index >= lines.length) {
          throw new Error(`unterminated multiline TOML string: ${key}`);
        }
        rest = lines[index];
      }
      continue;
    }
    const simple = trimmed.match(/^([A-Za-z0-9_-]+)\s*=\s*"((?:\\"|[^"])*)"\s*$/);
    if (simple) {
      const key = simple[1];
      if (!isSupportedTomlKey(key)) {
        continue;
      }
      values[key] = simple[2].replace(/\\"/g, "\"");
      continue;
    }
    throw new Error(`unsupported agent TOML line: ${line}`);
  }
  return values;
}

function isSupportedTomlKey(key: string): boolean {
  return TOML_STRING_KEYS.has(key);
}

function looksLikeAgentTomlPath(value: string): boolean {
  return value.endsWith(".toml")
    || value.startsWith("/")
    || value.startsWith("./")
    || value.startsWith("../")
    || value.startsWith("~")
    || value.includes("/")
    || value.includes("\\");
}

function expandHomePath(value: string): string {
  if (value === "~") {
    return os.homedir();
  }
  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }
  return value;
}
