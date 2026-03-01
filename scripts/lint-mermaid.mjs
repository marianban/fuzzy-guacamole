import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { execSync } from "node:child_process";

const DEFAULT_FILES = ["README.md", "README.MD"];
const DEFAULT_DIRS = ["docs"];

function extractMermaidBlocks(content) {
  const blocks = [];
  const regex = /```mermaid\s*\r?\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

function validateFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  const blocks = extractMermaidBlocks(content);

  if (blocks.length === 0) {
    return { filePath, checked: 0, errors: [] };
  }

  const errors = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const diagram = blocks[i];
    const tmpBase = mkdtempSync(path.join(tmpdir(), "mermaid-lint-"));
    const inputPath = path.join(tmpBase, "diagram.mmd");
    const outputPath = path.join(tmpBase, "diagram.svg");
    writeFileSync(inputPath, `${diagram}\n`, "utf8");

    try {
      execSync(`npx mmdc -i "${inputPath}" -o "${outputPath}"`, {
        stdio: "pipe",
        encoding: "utf8"
      });
    } catch (error) {
      const rawMessage = (
        error?.stderr ||
        error?.stdout ||
        error?.message ||
        "Unknown Mermaid parser error"
      )
        .toString()
        .trim();
      errors.push({ index: i + 1, message: rawMessage });
    } finally {
      rmSync(tmpBase, { recursive: true, force: true });
    }
  }

  return { filePath, checked: blocks.length, errors };
}

function walkMarkdownFiles(dir) {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) {
    return [];
  }

  const out = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkMarkdownFiles(fullPath));
      continue;
    }
    if (entry.isFile() && /\.(md)$/i.test(entry.name)) {
      out.push(fullPath);
    }
  }

  return out;
}

function main() {
  const inputPaths = process.argv.slice(2);
  const files =
    inputPaths.length > 0
      ? inputPaths.filter((p) => statSync(p, { throwIfNoEntry: false })?.isFile())
      : [
          ...DEFAULT_FILES.filter((f) => statSync(f, { throwIfNoEntry: false })?.isFile()),
          ...DEFAULT_DIRS.flatMap((dir) => walkMarkdownFiles(dir))
        ];
  const uniqueFiles = [...new Set(files)].sort((a, b) => a.localeCompare(b));

  if (uniqueFiles.length === 0) {
    console.error("No markdown files found to check.");
    process.exit(1);
  }

  let totalBlocks = 0;
  let hasErrors = false;

  for (const file of uniqueFiles) {
    const result = validateFile(file);
    totalBlocks += result.checked;

    if (result.errors.length === 0) {
      if (result.checked > 0) {
        console.log(`OK ${path.normalize(file)} (${result.checked} diagram(s))`);
      }
      continue;
    }

    hasErrors = true;
    console.error(`FAIL ${path.normalize(file)}`);
    for (const error of result.errors) {
      console.error(`  - diagram #${error.index}: ${error.message}`);
    }
  }

  if (totalBlocks === 0) {
    console.error("No mermaid blocks found in matched markdown files.");
    process.exit(1);
  }

  if (hasErrors) {
    process.exit(1);
  }

  console.log(`Validated ${totalBlocks} Mermaid diagram(s) successfully.`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
