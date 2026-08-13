import { access, readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(join(root, "docs.json"), "utf8"));
const errors = [];
const pagePaths = [];

function collect(node) {
  if (Array.isArray(node)) {
    for (const value of node) typeof value === "string" ? pagePaths.push(value) : collect(value);
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (["pages", "groups", "tabs", "anchors", "dropdowns"].includes(key)) collect(value);
    }
  }
}

if (!config.name || !config.theme || !config.colors?.primary || !config.navigation) errors.push("docs.json is missing a required Mintlify field");
collect(config.navigation);

const documentedOpenApi = await readFile(join(root, "reference/openapi.yaml"), "utf8");
const sourceOpenApi = await readFile(resolve(root, "../api/openapi.yaml"), "utf8");
if (documentedOpenApi !== sourceOpenApi) errors.push("reference/openapi.yaml is out of sync with apps/api/openapi.yaml");

for (const page of new Set(pagePaths)) {
  const file = join(root, `${page}.mdx`);
  try {
    const source = await readFile(file, "utf8");
    if (!source.startsWith("---\n") || !/^title:\s*.+$/m.test(source)) errors.push(`${page}.mdx has invalid frontmatter`);
  } catch {
    errors.push(`navigation references missing page: ${page}.mdx`);
  }
}

for (const asset of [config.logo?.light, config.logo?.dark, config.favicon]) {
  if (typeof asset === "string") await access(join(root, asset.replace(/^\//, ""))).catch(() => errors.push(`missing asset: ${asset}`));
}

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (["node_modules", "dist"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (extname(path) === ".mdx") {
      const source = await readFile(path, "utf8");
      for (const match of source.matchAll(/\]\((?!https?:|mailto:|#)([^)]+)\)/g)) {
        const target = match[1].split("#")[0];
        const candidate = join(root, target.replace(/^\//, ""));
        await Promise.any([access(candidate), access(`${candidate}.mdx`)]).catch(() => errors.push(`broken local link in ${path.slice(root.length + 1)}: ${match[1]}`));
      }
    }
  }
}

await scan(root);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Validated ${new Set(pagePaths).size} Mintlify pages and local assets.`);
}
