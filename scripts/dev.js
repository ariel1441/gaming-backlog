import { execFileSync, spawn } from "node:child_process";
import readline from "node:readline";

const isWindows = process.platform === "win32";
const npmCommand = "npm";
const ports = [
  { label: "backend", port: String(process.env.PORT || "5000") },
  { label: "frontend", port: String(process.env.VITE_PORT || "5173") },
];

let stopping = false;
let requestedExitCode = 0;
const children = new Map();

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });
  } catch (error) {
    return error.stdout?.toString?.() || "";
  }
}

function findWindowsListeners(port) {
  const output = run("netstat", ["-ano"]);
  const listeners = new Set();
  for (const line of output.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 5) continue;
    const [protocol, localAddress, , state, pid] = parts;
    if (!/^TCP$/i.test(protocol)) continue;
    if (!/^LISTENING$/i.test(state)) continue;
    if (!localAddress.endsWith(`:${port}`)) continue;
    if (/^\d+$/.test(pid)) listeners.add(Number(pid));
  }
  return [...listeners];
}

function findUnixListeners(port) {
  return run("lsof", ["-ti", `tcp:${port}`])
    .split(/\r?\n/)
    .map((value) => Number(value.trim()))
    .filter(Number.isInteger);
}

function processName(pid) {
  if (isWindows) {
    const output = run("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]);
    return output.match(/^"([^"]+)"/)?.[1] || "";
  }
  return run("ps", ["-p", String(pid), "-o", "comm="]).trim();
}

function isNodeProcess(name) {
  return /(^|[/\\])node(\.exe)?$/i.test(String(name).trim());
}

function killTree(pid) {
  if (!pid) return;
  if (isWindows) {
    run("taskkill", ["/PID", String(windowsDevTreeRoot(pid)), "/T", "/F"]);
    return;
  }
  try {
    process.kill(-pid, "SIGINT");
  } catch {
    try {
      process.kill(pid, "SIGINT");
    } catch {}
  }
}

function windowsProcessInfo(pid) {
  const output = run("powershell.exe", [
    "-NoProfile",
    "-Command",
    `Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress`,
  ]).trim();
  if (!output) return null;
  try {
    return JSON.parse(output);
  } catch {
    return null;
  }
}

function isNodemonProcess(info) {
  return /(?:^|\s|[/\\])nodemon(?:\.cmd|\.ps1|\.js)?(?:\s|$|[/\\])/i.test(
    String(info?.CommandLine || "")
  );
}

function windowsDevTreeRoot(pid) {
  if (!isWindows) return pid;

  let currentPid = pid;
  for (let depth = 0; depth < 6; depth += 1) {
    const info = windowsProcessInfo(currentPid);
    if (!info?.ParentProcessId) return currentPid;
    const parent = windowsProcessInfo(info.ParentProcessId);
    if (!parent) return currentPid;
    if (isNodemonProcess(parent)) return parent.ProcessId;
    currentPid = parent.ProcessId;
  }

  return pid;
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const findListeners = isWindows ? findWindowsListeners : findUnixListeners;

function cleanupPorts() {
  let blocked = false;
  for (const { label, port } of ports) {
    const pids = findListeners(port).filter((pid) => pid !== process.pid);
    if (!pids.length) continue;

    for (const pid of pids) {
      const name = processName(pid);
      if (!isNodeProcess(name)) {
        console.error(
          `[DEV] Port ${port} (${label}) is already used by ${name || `PID ${pid}`}.`
        );
        console.error("[DEV] I will not stop it automatically because it is not a Node process.");
        blocked = true;
        continue;
      }

      console.log(`[DEV] Stopping stale Node process ${pid} on ${label} port ${port}.`);
      killTree(pid);
    }

    for (let attempt = 0; attempt < 40; attempt += 1) {
      const remaining = findListeners(port).filter((pid) => pid !== process.pid);
      if (!remaining.length) break;
      for (const pid of remaining) {
        const name = processName(pid);
        if (!isNodeProcess(name)) continue;
        console.log(`[DEV] Stopping lingering Node process ${pid} on ${label} port ${port}.`);
        killTree(pid);
      }
      sleep(150);
    }

    const remaining = findListeners(port).filter((pid) => pid !== process.pid);
    if (remaining.length) {
      console.error(
        `[DEV] Port ${port} (${label}) is still busy after cleanup: ${remaining.join(", ")}.`
      );
      blocked = true;
    }
  }

  if (blocked) {
    console.error("[DEV] Dev server was not started. Free the busy port and run npm run dev again.");
    process.exit(1);
  }
}

function prefixLines(stream, name, colorCode, onLine) {
  const rl = readline.createInterface({ input: stream });
  rl.on("line", (line) => {
    const color = process.stdout.isTTY ? `\u001b[${colorCode}m` : "";
    const reset = process.stdout.isTTY ? "\u001b[0m" : "";
    console.log(`${color}[${name}]${reset} ${line}`);
    onLine?.(line);
  });
  return rl;
}

function startProcess(name, script, colorCode) {
  let child;
  try {
    child = spawn(npmCommand, ["run", script], {
      cwd: process.cwd(),
      env: { ...process.env, FORCE_COLOR: process.env.FORCE_COLOR || "1" },
      stdio: ["pipe", "pipe", "pipe"],
      detached: !isWindows,
      shell: isWindows,
      windowsHide: true,
    });
  } catch (error) {
    console.error(`[DEV] Could not start ${name}: ${error.message}`);
    stopAll(1);
    return null;
  }

  const onLine =
    name === "BACK"
      ? (line) => {
          if (line.includes("[nodemon] app crashed")) {
            requestedExitCode = 1;
            console.error("[DEV] Backend crashed; stopping frontend too.");
            stopAll(1);
          }
        }
      : undefined;
  const readers = [
    prefixLines(child.stdout, name, colorCode, onLine),
    prefixLines(child.stderr, name, colorCode, onLine),
  ];
  children.set(name, { child, readers });

  child.on("exit", (code, signal) => {
    for (const reader of readers) reader.close();
    children.delete(name);
    if (stopping) return;

    requestedExitCode = typeof code === "number" ? code : 1;
    console.error(
      `[DEV] ${name} stopped${signal ? ` by ${signal}` : ""}${
        typeof code === "number" ? ` with code ${code}` : ""
      }.`
    );
    stopAll(requestedExitCode);
  });

  child.on("error", (error) => {
    if (stopping) return;
    requestedExitCode = 1;
    console.error(`[DEV] Could not start ${name}: ${error.message}`);
    stopAll(1);
  });

  return child;
}

function stopAll(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  requestedExitCode = exitCode;

  for (const { child } of children.values()) {
    killTree(child.pid);
  }

  setTimeout(() => {
    process.exit(requestedExitCode);
  }, 500).unref();
}

cleanupPorts();
console.log("[DEV] Starting backend and frontend. Press Ctrl+C to stop both.");
console.log("[DEV] Frontend: http://localhost:5173  API: http://localhost:5000");

const backend = startProcess("BACK", "dev:back", "36");
if (!backend || stopping) {
  process.exit(requestedExitCode || 1);
}
startProcess("FRONT", "dev:front", "35");

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  const value = String(chunk).trim().toLowerCase();
  if (value === "rs" && backend?.stdin?.writable) {
    backend.stdin.write("rs\n");
  }
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    console.log("\n[DEV] Stopping backend and frontend...");
    stopAll(0);
  });
}
