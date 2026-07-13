import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function namedImports(source, moduleName) {
  const pattern = new RegExp(
    `import\\s*{([^}]*)}\\s*from\\s*["']${moduleName}["']`,
  );
  const match = source.match(pattern);
  return new Set(
    String(match?.[1] || "")
      .split(",")
      .map((name) => name.trim().split(/\s+as\s+/)[0])
      .filter(Boolean),
  );
}

test("manual list view imports the state hook and row action icon it renders", async () => {
  const source = await readFile(
    path.join(currentDir, "CustomListView.jsx"),
    "utf8",
  );

  assert.equal(namedImports(source, "react").has("useState"), true);
  assert.equal(namedImports(source, "lucide-react").has("X"), true);
});
