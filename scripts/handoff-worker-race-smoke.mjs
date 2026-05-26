#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const repoRoot = path.resolve(new URL("..", import.meta.url).pathname);
const cliEntry = path.join(repoRoot, "dist", "apps", "cli", "src", "index.js");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "rph-handoff-worker-race-"));

if (!fs.existsSync(cliEntry)) {
  fail(`CLI dist entry not found: ${cliEntry}. Run pnpm run build first.`);
}

const now = new Date().toISOString();
const env = { ...process.env, NO_COLOR: "1" };

runSync(["init", "--yes", "--project-name", "Handoff Worker Race Smoke"], "init");

const runtimeDir = path.join(tmpRoot, ".rph", "runtime");
const handoffsPath = path.join(runtimeDir, "handoffs.json");
fs.mkdirSync(runtimeDir, { recursive: true });
fs.writeFileSync(handoffsPath, JSON.stringify([
  {
    id: "handoff-race",
    sessionId: "session-race",
    status: "pending",
    attempts: 0,
    maxAttempts: 3,
    createdAt: now,
    updatedAt: now,
    packet: {
      fromAgent: "Orchestrator",
      toAgent: "PM",
      stage: "SETUP",
      summary: "Two OS workers race for the same handoff.",
      artifactRefs: [],
      acceptanceCriteria: ["exactly one worker claims and completes the handoff"],
      blockers: [],
      nextCommand: "/status",
      resumeCursor: "stage:SETUP",
      createdAt: now
    }
  }
], null, 2));

const results = await Promise.all([
  runWorker("race-a"),
  runWorker("race-b")
]);

const statuses = results.map((result) => result.status).sort((a, b) => a - b);
if (statuses[0] !== 0 || statuses[1] !== 1) {
  fail(`expected one winning worker and one losing worker, got statuses ${JSON.stringify(statuses)}\n${formatResults(results)}`);
}

const winnerLogs = results.filter((result) => result.status === 0);
if (winnerLogs.length !== 1 || !winnerLogs[0].stdout.includes("role runner: PM (SETUP) lane=lane-")) {
  fail(`expected exactly one role runner log from the winner\n${formatResults(results)}`);
}

const handoffs = readJson(handoffsPath);
if (!Array.isArray(handoffs) || handoffs.length !== 1) {
  fail(`expected one handoff record, got ${JSON.stringify(handoffs)}`);
}

const handoff = handoffs[0];
if (handoff.status !== "completed") {
  fail(`expected completed handoff, got ${JSON.stringify(handoff)}`);
}
if (!["race-a", "race-b"].includes(handoff.claimedBy)) {
  fail(`expected winner race-a or race-b, got ${handoff.claimedBy ?? "missing"}`);
}
if (handoff.attempts !== 1) {
  fail(`expected exactly one claim attempt, got ${handoff.attempts ?? "missing"}`);
}
if (!handoff.claimToken || !handoff.workerSessionId || !handoff.completedAt || !handoff.laneRunId) {
  fail(`expected completed handoff to preserve claim token, worker session, completedAt, and laneRunId: ${JSON.stringify(handoff)}`);
}

const laneDir = path.join(runtimeDir, "lanes");
const laneFiles = fs.readdirSync(laneDir).filter((file) => file.endsWith(".json"));
if (laneFiles.length !== 1) {
  fail(`expected exactly one lane file, got ${laneFiles.length}: ${laneFiles.join(", ")}`);
}
if (laneFiles[0] !== `${handoff.laneRunId}.json`) {
  fail(`expected lane file to match handoff laneRunId ${handoff.laneRunId}, got ${laneFiles[0]}`);
}

const lane = readJson(path.join(laneDir, laneFiles[0]));
if (lane.status !== "completed" || lane.exitOk !== true || lane.merge?.status !== "pending") {
  fail(`expected completed direct worker lane with pending merge, got ${JSON.stringify(lane)}`);
}
if (lane.handoffId !== "handoff-race" || lane.workerId !== handoff.claimedBy || lane.attempt !== 1) {
  fail(`expected lane to be bound to winning handoff claim, got ${JSON.stringify(lane)}`);
}
if (lane.workerSessionId !== handoff.workerSessionId || lane.claimToken !== handoff.claimToken) {
  fail(`expected lane claim binding to match handoff, got lane=${JSON.stringify(lane)} handoff=${JSON.stringify(handoff)}`);
}

console.log("handoff worker race smoke passed");
console.log(`winner: ${handoff.claimedBy}`);
console.log(`tmp: ${tmpRoot}`);

function runSync(args, label) {
  const result = spawnSync(process.execPath, [cliEntry, ...args], {
    cwd: tmpRoot,
    env,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    fail(`${label} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return result;
}

function runWorker(workerId) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [
      cliEntry,
      "agent",
      "worker",
      "run",
      "handoff-race",
      "--worker-id",
      workerId,
      "--lease-ms",
      "10000"
    ], {
      cwd: tmpRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (status) => {
      resolve({ workerId, status: status ?? 1, stdout, stderr });
    });
  });
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    fail(`missing file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function formatResults(results) {
  return results.map((result) => [
    `worker=${result.workerId} status=${result.status}`,
    "stdout:",
    result.stdout,
    "stderr:",
    result.stderr
  ].join("\n")).join("\n---\n");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
