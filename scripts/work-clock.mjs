#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_MIN_HOURS = 6;

function main() {
  const cwd = process.cwd();
  const args = process.argv.slice(2);
  const command = args[0] ?? "status";
  const options = parseOptions(args.slice(1));
  const filePath = path.resolve(cwd, options.file ?? ".rph/tmp/work-clock.json");

  switch (command) {
    case "start":
      writeClock(filePath, startClock(readClock(filePath), options));
      printStatus(readClock(filePath), options);
      break;
    case "status":
      printStatus(readClock(filePath), options);
      break;
    case "log":
      writeClock(filePath, appendEvent(readClock(filePath), "log", options._.join(" ")));
      printStatus(readClock(filePath), options);
      break;
    case "checkpoint":
      writeClock(filePath, appendEvent(readClock(filePath), "checkpoint", options._.join(" ")));
      printStatus(readClock(filePath), options);
      break;
    case "stop":
      writeClock(filePath, stopClock(readClock(filePath), options._.join(" ")));
      printStatus(readClock(filePath), options);
      break;
    default:
      console.error("usage: pnpm work-clock <start|status|log|checkpoint|stop> [--json] [--min-hours 6] [message]");
      process.exitCode = 2;
  }
}

function parseOptions(args) {
  const options = { _: [] };
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (!token.startsWith("--")) {
      options._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = true;
    }
  }
  return options;
}

function readClock(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeClock(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function startClock(existing, options) {
  if (existing && !existing.stoppedAt) {
    return appendEvent(existing, "resume", "work clock already active");
  }
  const now = new Date().toISOString();
  const minHours = Number(options["min-hours"] ?? DEFAULT_MIN_HOURS);
  return {
    version: 1,
    startedAt: now,
    stoppedAt: null,
    minHours,
    objective: options.goal ?? "Build RPH into a paid Hermes-like product harness.",
    events: [
      {
        at: now,
        kind: "start",
        message: `minimum target ${minHours}h`
      }
    ]
  };
}

function stopClock(clock, message) {
  const active = requireClock(clock);
  const now = new Date().toISOString();
  return {
    ...appendEvent(active, "stop", message || "stopped"),
    stoppedAt: now
  };
}

function appendEvent(clock, kind, message) {
  const active = requireClock(clock);
  return {
    ...active,
    events: [
      ...active.events,
      {
        at: new Date().toISOString(),
        kind,
        message: message || "(no message)"
      }
    ]
  };
}

function requireClock(clock) {
  if (!clock) {
    throw new Error("work clock not started. Run: pnpm work-clock start");
  }
  return clock;
}

function printStatus(clock, options) {
  const active = requireClock(clock);
  const status = toStatus(active);
  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  console.log(`started: ${status.startedAt}`);
  console.log(`elapsed_hours: ${status.elapsedHours.toFixed(3)}`);
  console.log(`minimum_hours: ${status.minHours}`);
  console.log(`remaining_hours: ${status.remainingHours.toFixed(3)}`);
  console.log(`events: ${status.eventCount}`);
  console.log(`last: ${status.lastEvent.kind} ${status.lastEvent.message}`);
}

function toStatus(clock) {
  const start = new Date(clock.startedAt).getTime();
  const end = clock.stoppedAt ? new Date(clock.stoppedAt).getTime() : Date.now();
  const elapsedHours = Math.max(0, (end - start) / 3600000);
  const minHours = Number(clock.minHours ?? DEFAULT_MIN_HOURS);
  return {
    startedAt: clock.startedAt,
    stoppedAt: clock.stoppedAt,
    objective: clock.objective,
    minHours,
    elapsedHours,
    remainingHours: Math.max(0, minHours - elapsedHours),
    metMinimum: elapsedHours >= minHours,
    eventCount: clock.events.length,
    lastEvent: clock.events[clock.events.length - 1]
  };
}

try {
  main();
} catch (error) {
  console.error(`[work-clock] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
