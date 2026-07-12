import fs from "node:fs";
import path from "node:path";

const assetsDir = path.resolve("dist", "assets");
const maxJavaScriptBytes = Number(process.env.BUNDLE_MAX_JS_BYTES) || 500 * 1024;
const files = fs.readdirSync(assetsDir).filter((file) => file.endsWith(".js"));
const oversized = files
  .map((file) => ({ file, bytes: fs.statSync(path.join(assetsDir, file)).size }))
  .filter(({ bytes }) => bytes > maxJavaScriptBytes);

if (oversized.length) {
  for (const asset of oversized) {
    console.error(
      `Bundle budget exceeded: ${asset.file} is ${asset.bytes} bytes (limit ${maxJavaScriptBytes}).`,
    );
  }
  process.exit(1);
}

console.log(`Bundle budget passed: ${files.length} JavaScript chunks, each <= ${maxJavaScriptBytes} bytes.`);
