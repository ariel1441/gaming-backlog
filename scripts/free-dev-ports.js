import { execFileSync } from "node:child_process";

function parsePorts() {
  const portsArg = process.argv.find((arg) => arg.startsWith("--ports="));
  if (!portsArg) return [process.env.PORT || "5000", process.env.VITE_PORT || "5173"];

  return portsArg
    .slice("--ports=".length)
    .split(",")
    .map((port) => port.trim())
    .filter(Boolean);
}

const DEFAULT_PORTS = parsePorts();
const ports = [...new Set(DEFAULT_PORTS.map(String))];
const dryRun = process.argv.includes("--dry-run");

function run(command, args) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
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
  const output = run("lsof", ["-ti", `tcp:${port}`]);
  return output
    .split(/\r?\n/)
    .map((value) => Number(value.trim()))
    .filter(Number.isInteger);
}

function processName(pid) {
  if (process.platform === "win32") {
    const output = run("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"]);
    const match = output.match(/^"([^"]+)"/);
    return match?.[1] || "";
  }
  return run("ps", ["-p", String(pid), "-o", "comm="]).trim();
}

function isNodeProcess(name) {
  return /(^|[/\\])node(\.exe)?$/i.test(String(name).trim());
}

function killProcess(pid) {
  if (dryRun) return;
  if (process.platform === "win32") {
    run("taskkill", ["/PID", String(windowsDevTreeRoot(pid)), "/T", "/F"]);
    return;
  }
  try {
    process.kill(pid);
  } catch (error) {
    throw new Error(`Could not stop process ${pid}: ${error.message}`);
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
  if (process.platform !== "win32") return pid;

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

const findListeners =
  process.platform === "win32" ? findWindowsListeners : findUnixListeners;

for (const port of ports) {
  const pids = findListeners(port).filter((pid) => pid !== process.pid);
  if (!pids.length) continue;

  for (const pid of pids) {
    const name = processName(pid);
    if (!isNodeProcess(name)) {
      console.error(
        `[dev:ports] Port ${port} is already used by ${name || `PID ${pid}`}. ` +
          "Not stopping it automatically because it is not a Node dev process."
      );
      process.exitCode = 1;
      continue;
    }

    console.log(
      `[dev:ports] ${dryRun ? "Would stop" : "Stopping"} stale Node process ` +
        `${pid} on port ${port}.`
    );
    killProcess(pid);
  }

  if (!dryRun) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const remaining = findListeners(port).filter((pid) => pid !== process.pid);
      if (!remaining.length) break;
      for (const pid of remaining) {
        const name = processName(pid);
        if (!isNodeProcess(name)) continue;
        console.log(`[dev:ports] Stopping lingering Node process ${pid} on port ${port}.`);
        killProcess(pid);
      }
      sleep(150);
    }
  }
}
