import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const railway = JSON.parse(fs.readFileSync(path.join(root, "railway.json"), "utf8"));
const version = railway.build.railpackVersion;
assert.equal(railway.build.builder, "RAILPACK");
assert.match(version, /^\d+\.\d+\.\d+$/);
assert.equal(railway.deploy, undefined, "Shared config must preserve per-service deployment settings");
const frontend = `ghcr.io/railwayapp/railpack-frontend:v${version}`;
const cache = path.join(root, ".cache", "railway-preflight");
fs.mkdirSync(cache, { recursive: true });
const work = fs.mkdtempSync(path.join(cache, "candidate-"));
const context = path.join(work, "context");
fs.mkdirSync(context);
const suffix = path.basename(work).toLowerCase();
const postgres = `backlog-pg-${suffix}`;
const backend = `backlog-api-${suffix}`;
const backendImage = `backlog-railpack:${suffix}-backend`;
const dailyImage = `backlog-railpack:${suffix}-daily`;
const database = "railway_preflight";
const databaseUrl = `postgres://postgres:preflight-fixture@localhost:5432/${database}`;
let sequence = 0;

function execute(command, args, { allowFailure = false, timeout = 60_000 } = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", timeout, maxBuffer: 32 * 1024 * 1024, windowsHide: true });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  const log = path.join(work, `${String(++sequence).padStart(2, "0")}-${path.basename(command).replace(/\W/g, "-")}.log`);
  fs.writeFileSync(log, output);
  if (!allowFailure && (result.error || result.status !== 0)) {
    throw new Error(`${command} failed (${result.status ?? result.error?.message}). ${path.relative(root, log)}\n${output.split(/\r?\n/).slice(-35).join("\n")}`);
  }
  return { ...result, output };
}

async function waitFor(label, check) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (check()) return;
    await delay(1000);
  }
  throw new Error(`Timed out waiting for ${label}; logs: ${path.relative(root, work)}`);
}

try {
  execute("docker", ["info", "--format", "{{.ServerVersion}}"]);
  assert.match(execute("docker", ["run", "--rm", "--entrypoint", "/railpack", frontend, "--version"], { timeout: 180_000 }).output, new RegExp(`\\b${version.replaceAll(".", "\\.")}\\b`));
  const tracked = execute("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).stdout.split("\0").filter(Boolean);
  for (const relative of new Set(tracked)) {
    if (relative.split("/").some((part) => part === ".git" || part === "node_modules" || part === ".cache")) continue;
    if (path.basename(relative).startsWith(".env") && !relative.endsWith(".example")) continue;
    const source = path.join(root, relative);
    if (!fs.existsSync(source) || !fs.statSync(source).isFile()) continue;
    const target = path.join(context, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  console.log(`Railpack ${version}; Linux candidate from ${execute("git", ["rev-parse", "--short", "HEAD"]).stdout.trim()} plus working changes.`);
  console.log(`Diagnostics: ${path.relative(root, work)}`);
  const plannerImage = `backlog-railpack:planner-${version}`;
  const plannerFile = path.join(work, "planner.Dockerfile");
  fs.writeFileSync(plannerFile, `FROM ${frontend} AS railpack
FROM ghcr.io/railwayapp/railpack-builder:${version}
COPY --from=railpack /railpack /usr/local/bin/railpack
`);
  console.log("Preparing the pinned Linux Railpack planner...");
  execute("docker", ["buildx", "build", "--load", "--progress", "plain", "--file", plannerFile, "--tag", plannerImage, work], { timeout: 15 * 60_000 });

  for (const [service, start, image] of [
    ["backend", "node backend/index.js", backendImage],
    ["daily-sync", "npm run steam:sync:daily-scheduled", dailyImage],
  ]) {
    console.log(`Building ${service} image...`);
    const plan = path.join(work, `${service}-plan.json`);
    execute("docker", ["run", "--rm", "--mount", `type=bind,source=${context},target=/app,readonly`, "--mount", `type=bind,source=${work},target=/out`, "--entrypoint", "/usr/local/bin/railpack", plannerImage, "prepare", "/app", "--start-cmd", start, "--error-missing-start", "--plan-out", `/out/${service}-plan.json`], { timeout: 180_000 });
    execute("docker", ["buildx", "build", "--load", "--platform", "linux/amd64", "--progress", "plain", "--build-arg", `BUILDKIT_SYNTAX=ghcr.io/railwayapp/railpack-frontend:v${version}`, "--file", plan, "--tag", image, context], { timeout: 15 * 60_000 });
    const config = JSON.parse(execute("docker", ["image", "inspect", image, "--format", "{{json .Config}}"] ).stdout);
    assert.ok(config.Cmd.join(" ").includes(start), `${service} image must use the service start command`);
    console.log(`${service} image built with the expected start command.`);
  }

  const runtimeCheck = `
    import assert from 'node:assert/strict';
    import { execFileSync } from 'node:child_process';
    import bcrypt from 'bcrypt';
    assert.equal(process.versions.node.split('.')[0], '24');
    assert.equal(execFileSync('npm', ['--version'], {encoding:'utf8'}).trim(), '10.9.4');
    assert.ok(await bcrypt.compare('fixture', await bcrypt.hash('fixture', 4)));
    console.log('Node 24, npm 10.9.4 and Linux native bcrypt verified.');
  `;
  execute("docker", ["run", "--rm", "--network", "none", "--entrypoint", "node", backendImage, "--input-type=module", "-e", runtimeCheck]);
  console.log("Node/npm and Linux native bcrypt passed.");

  execute("docker", ["run", "--detach", "--rm", "--name", postgres, "--env", "POSTGRES_PASSWORD=preflight-fixture", "--env", `POSTGRES_DB=${database}`, "postgres:16"]);
  await waitFor("disposable PostgreSQL", () => execute("docker", ["exec", postgres, "pg_isready", "--username", "postgres", "--dbname", database], { allowFailure: true }).status === 0);
  const databaseEnv = ["--env", `DATABASE_URL=${databaseUrl}`, "--env", "PGSSL=false"];
  execute("docker", ["run", "--rm", "--network", `container:${postgres}`, ...databaseEnv, "--env", "NODE_ENV=test", "--entrypoint", "node", backendImage, "scripts/db-migrate.js"], { timeout: 120_000 });
  console.log("Migration runner passed against a new disposable container database.");
  execute("docker", ["run", "--detach", "--rm", "--name", backend, "--network", `container:${postgres}`, ...databaseEnv, "--env", "NODE_ENV=production", "--env", "PORT=5000", "--env", "JWT_SECRET=preflight-fixture-secret", "--env", "CATALOG_AUTO_SEED=false", "--env", "METADATA_REFRESH_ENABLED=false", backendImage]);
  const healthCheck = `const r=await fetch('http://127.0.0.1:5000/healthz');if(!r.ok||(await r.json()).ok!==true)process.exit(1);`;
  await waitFor("backend health", () => execute("docker", ["exec", backend, "node", "-e", healthCheck], { allowFailure: true }).status === 0);
  const apiCheck = `
    import assert from 'node:assert/strict';
    import {pool} from './backend/db.js';
    for(const route of ['/api/games','/api/activity','/api/wishlist']) {
      assert.equal((await fetch('http://127.0.0.1:5000'+route)).status,401,route);
    }
    assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name,'${database}');
    await pool.end();
  `;
  execute("docker", ["exec", backend, "node", "--input-type=module", "-e", apiCheck]);
  console.log("Production-mode backend startup, health, database connectivity and protected routes passed.");
  const dailyCheck = `
    import assert from 'node:assert/strict';
    import {runDailySteamSyncCommand} from './scripts/sync-steam-daily.js';
    const result=await runDailySteamSyncCommand({argv:['node','sync','--jerusalem-closeout'],observedAt:new Date('2026-10-09T12:00:00Z'),beginRun:()=>{throw Error('Closeout guard must prevent any run');}});
    assert.equal(result.reason,'outside_jerusalem_closeout_hour');
  `;
  execute("docker", ["run", "--rm", "--network", "none", "--env", "NODE_ENV=production", "--env", `DATABASE_URL=${databaseUrl}`, "--entrypoint", "node", dailyImage, "--input-type=module", "-e", dailyCheck]);
  console.log("Daily-sync image imports and deterministic closeout guard passed without database/provider access.");
  console.log("Railway container preflight passed; no images were published or deployed.");
} finally {
  // Names are unique to this invocation. Never remove existing developer containers.
  execute("docker", ["logs", backend], { allowFailure: true });
  execute("docker", ["rm", "--force", backend], { allowFailure: true });
  execute("docker", ["rm", "--force", "--volumes", postgres], { allowFailure: true });
  execute("docker", ["image", "rm", backendImage, dailyImage], { allowFailure: true });
}
