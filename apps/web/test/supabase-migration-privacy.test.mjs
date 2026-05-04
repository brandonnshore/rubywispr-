import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

const expectedMetadataTables = [
  "admin_roles",
  "friend_of_ruby_batches",
  "profiles",
  "subscriptions",
  "transcription_rate_limits",
  "transcription_requests",
  "usage_counters",
];

const forbiddenPrivateContentFragments = [
  "audio",
  "clipboard",
  "context",
  "dictionary",
  "history",
  "recording",
  "transcript",
  "wispr",
];

const allowedSensitiveMetadataColumns = new Set([
  "transcription_requests.audio_duration_ms",
]);

const columnDefinitionSkipWords = new Set([
  "check",
  "constraint",
  "exclude",
  "foreign",
  "like",
  "primary",
  "unique",
]);

const migrationsPromise = loadMigrations();

test("Supabase migrations create the expected metadata-only public tables", async () => {
  const { tables } = await migrationsPromise;
  const tableNames = [...tables.keys()].sort();

  assert.deepEqual(tableNames, expectedMetadataTables);
});

test("Supabase migrations enable RLS for every public metadata table", async () => {
  const { sql, tables } = await migrationsPromise;

  for (const tableName of tables.keys()) {
    assert.match(
      sql,
      rlsEnableRegex(tableName),
      `public.${tableName} must enable row level security`,
    );
    assert.doesNotMatch(
      sql,
      rlsDisableRegex(tableName),
      `public.${tableName} must not disable row level security`,
    );
  }
});

test("Supabase migration columns do not introduce private content storage", async () => {
  const { addedColumns, tables } = await migrationsPromise;
  const violations = [];

  for (const [tableName, columns] of [
    ...tables.entries(),
    ...addedColumns.entries(),
  ]) {
    for (const columnName of columns) {
      const qualifiedColumnName = `${tableName}.${columnName}`;

      if (allowedSensitiveMetadataColumns.has(qualifiedColumnName)) {
        continue;
      }

      const forbiddenFragment = forbiddenPrivateContentFragments.find(
        (fragment) => columnName.includes(fragment),
      );

      if (forbiddenFragment) {
        violations.push(`${qualifiedColumnName} contains "${forbiddenFragment}"`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

async function loadMigrations() {
  const migrationFileNames = (await readdir(migrationsDir))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();

  assert.ok(
    migrationFileNames.length > 0,
    "supabase/migrations must contain SQL migration files",
  );

  const migrationSql = await Promise.all(
    migrationFileNames.map(async (fileName) => {
      const filePath = path.join(migrationsDir, fileName);
      return readFile(filePath, "utf8");
    }),
  );
  const sql = migrationSql.join("\n\n");

  return {
    addedColumns: extractAddedPublicColumns(sql),
    sql,
    tables: extractPublicTables(sql),
  };
}

function extractPublicTables(sql) {
  const tableRegex =
    /create\s+table\s+(?:if\s+not\s+exists\s+)?public\."?([a-z_][a-z0-9_]*)"?\s*\(/gi;
  const tables = new Map();

  for (const match of sql.matchAll(tableRegex)) {
    const tableName = match[1].toLowerCase();
    const bodyStart = match.index + match[0].length;
    const bodyEnd = findMatchingParen(sql, bodyStart - 1);
    const tableBody = sql.slice(bodyStart, bodyEnd);

    tables.set(tableName, extractColumnNames(tableBody));
  }

  return tables;
}

function extractAddedPublicColumns(sql) {
  const addColumnRegex =
    /alter\s+table\s+(?:only\s+)?public\."?([a-z_][a-z0-9_]*)"?\s+add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi;
  const addedColumns = new Map();

  for (const match of sql.matchAll(addColumnRegex)) {
    const tableName = match[1].toLowerCase();
    const columnName = match[2].toLowerCase();
    const columns = addedColumns.get(tableName) ?? [];

    columns.push(columnName);
    addedColumns.set(tableName, columns);
  }

  return addedColumns;
}

function extractColumnNames(tableBody) {
  return splitTopLevelComma(tableBody)
    .map((definition) => definition.trim())
    .filter(Boolean)
    .map((definition) => definition.match(/^"([^"]+)"|^([a-z_][a-z0-9_]*)/i))
    .filter(Boolean)
    .map((match) => (match[1] ?? match[2]).toLowerCase())
    .filter((name) => !columnDefinitionSkipWords.has(name));
}

function splitTopLevelComma(value) {
  const parts = [];
  let current = "";
  let depth = 0;
  let isSingleQuoted = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const nextCharacter = value[index + 1];

    current += character;

    if (character === "'" && isSingleQuoted && nextCharacter === "'") {
      current += nextCharacter;
      index += 1;
      continue;
    }

    if (character === "'") {
      isSingleQuoted = !isSingleQuoted;
      continue;
    }

    if (isSingleQuoted) {
      continue;
    }

    if (character === "(") {
      depth += 1;
      continue;
    }

    if (character === ")") {
      depth -= 1;
      continue;
    }

    if (character === "," && depth === 0) {
      parts.push(current.slice(0, -1));
      current = "";
    }
  }

  if (current.trim()) {
    parts.push(current);
  }

  return parts;
}

function findMatchingParen(value, openParenIndex) {
  let depth = 0;
  let isSingleQuoted = false;

  for (let index = openParenIndex; index < value.length; index += 1) {
    const character = value[index];
    const nextCharacter = value[index + 1];

    if (character === "'" && isSingleQuoted && nextCharacter === "'") {
      index += 1;
      continue;
    }

    if (character === "'") {
      isSingleQuoted = !isSingleQuoted;
      continue;
    }

    if (isSingleQuoted) {
      continue;
    }

    if (character === "(") {
      depth += 1;
      continue;
    }

    if (character === ")") {
      depth -= 1;

      if (depth === 0) {
        return index;
      }
    }
  }

  throw new Error("Unable to parse CREATE TABLE statement");
}

function rlsEnableRegex(tableName) {
  return new RegExp(
    `alter\\s+table\\s+(?:only\\s+)?public\\."?${escapeRegExp(
      tableName,
    )}"?\\s+enable\\s+row\\s+level\\s+security\\s*;`,
    "i",
  );
}

function rlsDisableRegex(tableName) {
  return new RegExp(
    `alter\\s+table\\s+(?:only\\s+)?public\\."?${escapeRegExp(
      tableName,
    )}"?\\s+disable\\s+row\\s+level\\s+security\\s*;`,
    "i",
  );
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
