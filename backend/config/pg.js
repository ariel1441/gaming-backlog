import fs from "node:fs";

const MANAGED_HOST_PATTERN =
  /(railway|heroku|neon|supabase|render|azure|amazonaws|cockroach|gcp)/i;

export function buildPgConfig(connectionString, env = process.env) {
  const forceSSL = String(env.PGSSL || "").toLowerCase() === "true";
  const disableSSL = String(env.PGSSL || "").toLowerCase() === "false";
  const needSSL =
    forceSSL ||
    (!disableSSL &&
      (/sslmode=require/i.test(connectionString || "") ||
        MANAGED_HOST_PATTERN.test(connectionString || "")));

  if (!needSSL) return { connectionString, ssl: undefined };

  const requestedUnverifiedDev =
    String(env.PGSSL_ALLOW_UNVERIFIED_DEV).toLowerCase() === "true";
  const requestedUnverifiedProd =
    String(env.PGSSL_ALLOW_UNVERIFIED_PROD).toLowerCase() === "true";
  const allowUnverifiedDev =
    env.NODE_ENV !== "production" && requestedUnverifiedDev;
  const allowUnverifiedProd =
    env.NODE_ENV === "production" && requestedUnverifiedProd;
  const inlineCa = String(env.PGSSL_CA || "").replace(/\\n/g, "\n").trim();
  const fileCa = env.PGSSL_CA_FILE
    ? fs.readFileSync(env.PGSSL_CA_FILE, "utf8").trim()
    : "";

  if (env.NODE_ENV === "production" && requestedUnverifiedDev) {
    throw new Error("PGSSL_ALLOW_UNVERIFIED_DEV cannot be used in production.");
  }
  if (env.NODE_ENV !== "production" && requestedUnverifiedProd) {
    throw new Error(
      "PGSSL_ALLOW_UNVERIFIED_PROD can only be used in production.",
    );
  }

  return {
    connectionString,
    ssl: {
      rejectUnauthorized: !(allowUnverifiedDev || allowUnverifiedProd),
      ...(inlineCa || fileCa ? { ca: inlineCa || fileCa } : {}),
    },
  };
}
