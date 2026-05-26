import fs from "node:fs";
import path from "node:path";

export function ensureDir(dirPath: string): void {
  const secure = isSecureWorkspacePath(dirPath);
  fs.mkdirSync(dirPath, secure ? { recursive: true, mode: 0o700 } : { recursive: true });
  if (secure) {
    secureExistingWorkspaceDirs(dirPath);
  }
}

export function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

export function readJsonIfExists<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return readJson<T>(filePath);
}

export function writeJson(filePath: string, value: unknown): void {
  ensureDir(path.dirname(filePath));
  writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeText(filePath: string, value: string): void {
  ensureDir(path.dirname(filePath));
  writeFile(filePath, value.endsWith("\n") ? value : `${value}\n`);
}

export function appendText(filePath: string, value: string): void {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, value);
  secureExistingWorkspaceFile(filePath);
}

export function fileExists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function listDirs(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function listFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

function writeFile(filePath: string, value: string): void {
  const secure = isSecureWorkspacePath(filePath);
  fs.writeFileSync(filePath, value, secure ? { mode: 0o600 } : undefined);
  if (secure) {
    secureExistingWorkspaceFile(filePath);
  }
}

function isSecureWorkspacePath(targetPath: string): boolean {
  return secureSegmentIndex(targetPath) >= 0;
}

function secureExistingWorkspaceFile(filePath: string): void {
  if (!isSecureWorkspacePath(filePath) || !fs.existsSync(filePath)) {
    return;
  }
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best-effort hardening; write success should not depend on chmod support.
  }
}

function secureExistingWorkspaceDirs(targetPath: string): void {
  const resolved = path.resolve(targetPath);
  const parsed = path.parse(resolved);
  const parts = resolved.slice(parsed.root.length).split(path.sep).filter(Boolean);
  const secureIndex = parts.indexOf(".rph");
  if (secureIndex < 0) {
    return;
  }
  let current = parsed.root;
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]);
    if (index < secureIndex || !fs.existsSync(current)) {
      continue;
    }
    try {
      if (fs.statSync(current).isDirectory()) {
        fs.chmodSync(current, 0o700);
      }
    } catch {
      // Best-effort hardening; some filesystems may not support chmod.
    }
  }
}

function secureSegmentIndex(targetPath: string): number {
  const resolved = path.resolve(targetPath);
  const parsed = path.parse(resolved);
  const parts = resolved.slice(parsed.root.length).split(path.sep).filter(Boolean);
  return parts.indexOf(".rph");
}
