import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migration = fs.readFileSync(
  path.join(root, "migrations", "027_add_backlog_table_preferences.sql"),
  "utf8",
);
const schema = fs.readFileSync(path.join(root, "schema.sql"), "utf8");

for (const [label, sql] of [
  ["migration", migration],
  ["schema", schema],
]) {
  test(`${label} permits table-backed backlog preferences`, () => {
    assert.match(
      sql,
      /default_backlog_view[\s\S]*'grid'[\s\S]*'compact'[\s\S]*'list'[\s\S]*'table'/i,
    );
    for (const sortKey of [
      "status",
      "personalGenres",
      "estimatedHours",
      "score",
    ]) {
      assert.match(sql, new RegExp(`'${sortKey}'`));
    }
  });
}
