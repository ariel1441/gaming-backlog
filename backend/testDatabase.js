export async function dropDisposableDatabase(
  admin,
  database,
  { timeoutMs = 10_000, pollMs = 50 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let connections = 1;
  while (connections > 0) {
    const { rows } = await admin.query(
      `SELECT COUNT(*)::int AS connections
         FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [database],
    );
    connections = rows[0].connections;
    if (connections === 0) break;
    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out waiting for ${connections} connection(s) to disposable database ${database} to close.`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  await admin.query(`DROP DATABASE IF EXISTS ${database}`);
}
