import { copyFile, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, "src");
const dist = join(root, "dist");
// dist is a fixed child of this project, never a caller-provided path.
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of ["index.html", "styles.css", "data.js", "app.js"]) {
  await copyFile(join(src, file), join(dist, file));
}

// Bundle the generated course data into one classic script so the page needs
// no fetch() and works from any base path (GitHub Pages project sites included).
async function readJson(name, fallback) {
  try { return JSON.parse(await readFile(join(src, name), "utf8")); } catch { return fallback; }
}
const bundle = {
  course: await readJson("course.json", null),
  changes: await readJson("changes.json", []),
  status: await readJson("status.json", {}),
  announcements: await readJson("announcements.json", { items: [] }),
  builtAt: new Date().toISOString()
};
if (!bundle.course) console.warn("warning: src/course.json is missing — run `npm run watch` first. The page will show a notice.");
await writeFile(join(dist, "course.js"), "window.CSCI127_COURSE = " + JSON.stringify(bundle) + ";\n");
await writeFile(join(dist, ".nojekyll"), "");
console.log("Built dist/: index.html, styles.css, data.js, app.js, course.js, .nojekyll");
