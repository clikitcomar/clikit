import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

// Load local env files for manual builds; Vercel injects these values itself.
function loadEnvFile(filename) {
  const filePath = path.resolve(process.cwd(), filename);
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 0) continue;

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const databaseUrl =
  process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL_UNPOOLED or DATABASE_URL is required before building."
  );
}

const prismaEnv = { ...process.env, DATABASE_URL: databaseUrl };

function runPrisma(args, acceptedExitCodes = [0]) {
  const result = spawnSync("npx", ["prisma", ...args], {
    cwd: process.cwd(),
    env: prismaEnv,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (!acceptedExitCodes.includes(result.status ?? -1)) {
    throw new Error(
      `Prisma command failed (exit ${result.status}): prisma ${args.join(" ")}`
    );
  }
  return result.status;
}

const client = new Client({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 15000,
});

let hasMigrationTable = false;
let hasApplicationTables = false;
let successfulMigrationCount = 0;

try {
  await client.connect();

  const schemaState = await client.query(`
    SELECT
      to_regclass('public."_prisma_migrations"') IS NOT NULL AS has_migration_table,
      EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_type = 'BASE TABLE'
          AND table_name <> '_prisma_migrations'
      ) AS has_application_tables
  `);

  hasMigrationTable = schemaState.rows[0].has_migration_table;
  hasApplicationTables = schemaState.rows[0].has_application_tables;

  if (hasMigrationTable) {
    const history = await client.query(`
      SELECT COUNT(*)::int AS count
      FROM public."_prisma_migrations"
      WHERE finished_at IS NOT NULL
        AND rolled_back_at IS NULL
    `);
    successfulMigrationCount = history.rows[0].count;
  }
} finally {
  await client.end();
}

const legacyMigrations = [
  "001_add_stock_lot_traceability",
  "002_add_sale_consumption_traceability",
];

if (successfulMigrationCount > 0) {
  console.log("Prisma migration history found; applying pending migrations.");
  runPrisma(["migrate", "deploy"]);
} else {
  if (hasApplicationTables) {
    // A legacy db-push schema can be adopted only when it already matches
    // the current Prisma schema exactly. Never overwrite an unknown schema.
    console.log(
      "No completed Prisma migrations found; checking the existing schema before adopting it."
    );
    runPrisma(
      [
        "migrate",
        "diff",
        "--from-config-datasource",
        "--to-schema",
        "prisma/schema.prisma",
        "--exit-code",
      ],
      [0]
    );
  } else {
    console.log(
      "Empty database detected; creating the initial schema from schema.prisma."
    );
    runPrisma(["db", "push", "--skip-generate"]);
  }

  // The original Clikit baseline was created with db push. Register its two
  // existing incremental migrations as applied after the full schema exists.
  for (const migration of legacyMigrations) {
    runPrisma(["migrate", "resolve", "--applied", migration]);
  }

  console.log("Initial Prisma schema and migration history are ready.");
}
