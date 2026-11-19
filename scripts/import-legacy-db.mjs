import { Client, types } from "pg";

// Preserve JSON and JSONB payloads as raw JSON text. Parsing them into JavaScript
// values can corrupt JSON scalar strings when they are inserted into the target.
types.setTypeParser(114, (value) => value);
types.setTypeParser(3802, (value) => value);

const sourceUrl = process.env.LEGACY_DATABASE_URL;
if (!sourceUrl) {
  console.log("Legacy data transfer skipped: LEGACY_DATABASE_URL is not configured.");
  process.exit(0);
}

const targetUrl =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL;

if (!targetUrl) throw new Error("The destination database URL is not available in this build.");

const sourceIdentity = new URL(sourceUrl);
const targetIdentity = new URL(targetUrl);
if (sourceIdentity.hostname === targetIdentity.hostname &&
    sourceIdentity.pathname === targetIdentity.pathname) {
  throw new Error("Source and destination resolve to the same database; refusing to import.");
}

const source = new Client({
  connectionString: sourceUrl,
  connectionTimeoutMillis: 20000,
  statement_timeout: 120000,
  application_name: "clikit-legacy-import-source",
});
const target = new Client({
  connectionString: targetUrl,
  connectionTimeoutMillis: 20000,
  statement_timeout: 120000,
  application_name: "clikit-legacy-import-target",
});

const quoteIdent = (value) => '"' + String(value).replaceAll('"', '""') + '"';
const qualified = (table) => "public." + quoteIdent(table);
const excludedTables = new Set(["_prisma_migrations", "_clikit_legacy_import_runs"]);
const importId = "legacy-main-to-neon-v1";
const advisoryLockId = 729401117;

let targetConnected = false;
let sourceConnected = false;
let targetTransaction = false;
let sourceTransaction = false;
let lockAcquired = false;

try {
  await Promise.all([source.connect(), target.connect()]);
  sourceConnected = true;
  targetConnected = true;

  await target.query("SELECT pg_advisory_lock($1)", [advisoryLockId]);
  lockAcquired = true;

  await target.query("BEGIN");
  targetTransaction = true;
  await target.query(
    'CREATE TABLE IF NOT EXISTS public."_clikit_legacy_import_runs" (' +
    '"id" text PRIMARY KEY, "status" text NOT NULL, ' +
    '"started_at" timestamptz NOT NULL DEFAULT now(), "completed_at" timestamptz, ' +
    '"source_database" text, "table_count" integer, "total_rows" bigint, "table_counts" jsonb)'
  );

  const previous = await target.query(
    'SELECT "status", "completed_at", "table_count", "total_rows" ' +
    'FROM public."_clikit_legacy_import_runs" WHERE "id" = $1',
    [importId]
  );

  if (previous.rows[0] && previous.rows[0].status === "completed") {
    await target.query("COMMIT");
    targetTransaction = false;
    console.log(
      "Legacy import already completed at " + previous.rows[0].completed_at +
      "; " + previous.rows[0].table_count + " tables, " + previous.rows[0].total_rows + " rows."
    );
  } else {
    const sourceDb = await source.query("SELECT current_database() AS name");
    const targetDb = await target.query("SELECT current_database() AS name");
    if (sourceDb.rows[0].name === targetDb.rows[0].name &&
        sourceIdentity.hostname === targetIdentity.hostname) {
      throw new Error("Source and destination database identity check failed.");
    }

    await source.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    sourceTransaction = true;

    const listTables = async (client) => {
      const result = await client.query(
        "SELECT table_name FROM information_schema.tables " +
        "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
      );
      return result.rows.map((row) => row.table_name)
        .filter((name) => !excludedTables.has(name));
    };

    const sourceTables = await listTables(source);
    const targetTables = await listTables(target);
    const missingInTarget = sourceTables.filter((name) => !targetTables.includes(name));
    const destinationOnlyTables = targetTables.filter((name) => !sourceTables.includes(name));

    if (missingInTarget.length) {
      throw new Error(
        "Source tables are missing from destination: " + missingInTarget.join(", ") + "."
      );
    }
    if (destinationOnlyTables.length) {
      console.log(
        "Keeping destination-only tables empty because they were added after the legacy source: " +
        destinationOnlyTables.join(", ")
      );
    }
    if (sourceTables.length === 0) throw new Error("The source database has no application tables.");

    const getColumns = async (client, table) => {
      const result = await client.query(
        "SELECT column_name, data_type, udt_name, is_nullable, column_default, " +
        "is_identity, is_generated FROM information_schema.columns " +
        "WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position",
        [table]
      );
      return result.rows;
    };

    const schemas = new Map();
    for (const table of sourceTables) {
      const pair = await Promise.all([getColumns(source, table), getColumns(target, table)]);
      const sourceColumns = pair[0];
      const targetColumns = pair[1];
      const sourceNames = new Set(sourceColumns.map((column) => column.column_name));
      const targetNames = new Set(targetColumns.map((column) => column.column_name));

      const missingColumns = sourceColumns
        .filter((column) => !targetNames.has(column.column_name))
        .map((column) => column.column_name);
      const extraRequiredColumns = targetColumns
        .filter((column) =>
          !sourceNames.has(column.column_name) &&
          column.is_nullable === "NO" &&
          !column.column_default &&
          column.is_identity !== "YES" &&
          column.is_generated === "NEVER"
        )
        .map((column) => column.column_name);
      const incompatibleTypes = sourceColumns
        .filter((column) => {
          const destinationColumn = targetColumns.find(
            (candidate) => candidate.column_name === column.column_name
          );
          return destinationColumn &&
            (destinationColumn.data_type !== column.data_type ||
             destinationColumn.udt_name !== column.udt_name);
        })
        .map((column) => column.column_name);

      if (missingColumns.length || extraRequiredColumns.length || incompatibleTypes.length) {
        throw new Error(
          "Column mismatch in " + table +
          ". Missing destination columns: " + (missingColumns.join(", ") || "none") +
          "; required destination-only columns: " + (extraRequiredColumns.join(", ") || "none") +
          "; type mismatches: " + (incompatibleTypes.join(", ") || "none") + "."
        );
      }

      schemas.set(table, {
        columns: sourceColumns
          .filter((column) => targetNames.has(column.column_name))
          .map((column) => column.column_name),
      });
    }

    const sourceCounts = new Map();
    let expectedTotal = 0;
    for (const table of sourceTables) {
      const result = await source.query("SELECT COUNT(*)::bigint AS count FROM " + qualified(table));
      const count = Number(result.rows[0].count);
      sourceCounts.set(table, count);
      expectedTotal += count;
    }
    if (expectedTotal === 0) throw new Error("The source database contains no application records.");

    const occupied = [];
    for (const table of targetTables) {
      const result = await target.query("SELECT COUNT(*)::bigint AS count FROM " + qualified(table));
      const count = Number(result.rows[0].count);
      if (count > 0) occupied.push(table + "=" + count);
    }
    if (occupied.length) {
      throw new Error(
        "Destination is not empty; refusing to merge or overwrite existing data: " + occupied.join(", ") + "."
      );
    }

    const foreignKeys = await target.query(
      "SELECT tc.table_name AS child_table, tc.constraint_name, " +
      "tc.is_deferrable, tc.initially_deferred " +
      "FROM information_schema.table_constraints tc " +
      "WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'"
    );

    await target.query(
      'INSERT INTO public."_clikit_legacy_import_runs" ' +
      '("id", "status", "source_database", "table_count", "total_rows") ' +
      "VALUES ($1, 'running', $2, $3, $4) " +
      'ON CONFLICT ("id") DO UPDATE SET "status" = \'running\', "started_at" = now(), ' +
      '"completed_at" = NULL, "source_database" = EXCLUDED."source_database", ' +
      '"table_count" = EXCLUDED."table_count", "total_rows" = EXCLUDED."total_rows"',
      [importId, sourceDb.rows[0].name, sourceTables.length, expectedTotal]
    );

    // Defer foreign keys within this transaction to safely restore circular relations.
    for (const fk of foreignKeys.rows) {
      await target.query(
        "ALTER TABLE " + qualified(fk.child_table) +
        " ALTER CONSTRAINT " + quoteIdent(fk.constraint_name) +
        " DEFERRABLE INITIALLY DEFERRED"
      );
    }
    await target.query("SET CONSTRAINTS ALL DEFERRED");

    const actualCounts = {};
    for (const table of sourceTables) {
      const columns = schemas.get(table).columns;
      const selected = await source.query(
        "SELECT " + columns.map(quoteIdent).join(", ") + " FROM " + qualified(table)
      );
      const rows = selected.rows;
      const batchSize = Math.max(1, Math.min(400, Math.floor(50000 / Math.max(columns.length, 1))));
      const columnList = columns.map(quoteIdent).join(", ");

      for (let offset = 0; offset < rows.length; offset += batchSize) {
        const batch = rows.slice(offset, offset + batchSize);
        const values = [];
        const tuples = batch.map((row) => {
          const placeholders = columns.map((column) => {
            values.push(row[column] === undefined ? null : row[column]);
            return "$" + values.length;
          });
          return "(" + placeholders.join(", ") + ")";
        });
        await target.query(
          "INSERT INTO " + qualified(table) + " (" + columnList + ") VALUES " + tuples.join(", "),
          values
        );
      }
      actualCounts[table] = rows.length;
      console.log("Imported " + table + ": " + rows.length + " rows.");
    }

    await target.query("SET CONSTRAINTS ALL IMMEDIATE");

    for (const fk of foreignKeys.rows) {
      const clause = fk.is_deferrable === "YES"
        ? "DEFERRABLE INITIALLY " + (fk.initially_deferred === "YES" ? "DEFERRED" : "IMMEDIATE")
        : "NOT DEFERRABLE";
      await target.query(
        "ALTER TABLE " + qualified(fk.child_table) +
        " ALTER CONSTRAINT " + quoteIdent(fk.constraint_name) + " " + clause
      );
    }

    const sequenceColumns = await target.query(
      "SELECT table_name, column_name FROM information_schema.columns " +
      "WHERE table_schema = 'public' AND (is_identity = 'YES' OR column_default LIKE 'nextval(%')"
    );
    for (const item of sequenceColumns.rows) {
      const sequence = await target.query(
        "SELECT pg_get_serial_sequence($1, $2) AS name",
        ["public." + quoteIdent(item.table_name), item.column_name]
      );
      const sequenceName = sequence.rows[0].name;
      if (!sequenceName) continue;
      const maxValue = await target.query(
        "SELECT MAX(" + quoteIdent(item.column_name) + ") AS value FROM " + qualified(item.table_name)
      );
      if (maxValue.rows[0].value !== null) {
        await target.query(
          "SELECT setval($1::regclass, $2::bigint, true)",
          [sequenceName, String(maxValue.rows[0].value)]
        );
      }
    }

    let verifiedTotal = 0;
    for (const table of sourceTables) {
      const result = await target.query("SELECT COUNT(*)::bigint AS count FROM " + qualified(table));
      const actual = Number(result.rows[0].count);
      const expected = sourceCounts.get(table);
      if (actual !== expected) {
        throw new Error("Verification failed for " + table + ": expected " + expected + ", received " + actual + ".");
      }
      verifiedTotal += actual;
    }
    if (verifiedTotal !== expectedTotal) {
      throw new Error("Total verification failed: expected " + expectedTotal + ", received " + verifiedTotal + ".");
    }

    await target.query(
      'UPDATE public."_clikit_legacy_import_runs" ' +
      'SET "status" = \'completed\', "completed_at" = now(), "total_rows" = $2, "table_counts" = $3::jsonb ' +
      'WHERE "id" = $1',
      [importId, verifiedTotal, JSON.stringify(actualCounts)]
    );

    await source.query("COMMIT");
    sourceTransaction = false;
    await target.query("COMMIT");
    targetTransaction = false;

    console.log(
      "Legacy import completed and verified: " + sourceTables.length +
      " tables, " + verifiedTotal + " rows."
    );
  }
} catch (error) {
  if (targetTransaction) {
    try { await target.query("ROLLBACK"); } catch {}
  }
  if (sourceTransaction) {
    try { await source.query("ROLLBACK"); } catch {}
  }
  console.error("Legacy database transfer failed; destination transaction rolled back.");
  console.error(error && error.message ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (lockAcquired) {
    try { await target.query("SELECT pg_advisory_unlock($1)", [advisoryLockId]); } catch {}
  }
  if (sourceConnected) {
    try { await source.end(); } catch {}
  }
  if (targetConnected) {
    try { await target.end(); } catch {}
  }
}
