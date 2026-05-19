import fs from "node:fs";
import path from "node:path";

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
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
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeText(filePath: string, value: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, value.endsWith("\n") ? value : `${value}\n`);
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
