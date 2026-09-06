// Validates src/data.js and src/index.html without any dependencies.
// Run with: npm run check
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const problems = [];
const note = (message) => problems.push(message);

const source = await readFile(new URL("./src/data.js", import.meta.url), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
const data = sandbox.window.CSCI127_DATA;
if (!data) { console.error("data.js did not define window.CSCI127_DATA"); process.exit(1); }

const { LINKS, PLACES, CATEGORIES, TASKS, MONDAY, TUESDAY, TOOLBOX, SOFTWARE, POSSIBLY_MISSED, SOURCES, GRADING, LAB, AI_POLICY, QUESTIONS } = data;

function checkUrl(href, where) {
  try {
    const url = new URL(href);
    if (!["https:", "http:", "mailto:"].includes(url.protocol)) note(`${where}: unexpected protocol in ${href}`);
    if (url.protocol === "http:") console.warn(`warning: ${where} uses plain http (${href})`);
  } catch {
    note(`${where}: invalid URL ${href}`);
  }
}

for (const [key, link] of Object.entries(LINKS)) {
  if (!link.label) note(`LINKS.${key} has no label`);
  checkUrl(link.href, `LINKS.${key}`);
}

function checkLinks(specs, where) {
  (specs || []).forEach((spec, i) => {
    if (spec.key && !LINKS[spec.key]) note(`${where}: links[${i}] refers to unknown LINKS key "${spec.key}"`);
    if (!spec.key && !spec.href) note(`${where}: links[${i}] has neither key nor href`);
    if (spec.href) checkUrl(spec.href, `${where} links[${i}]`);
  });
}

function checkCategory(category, where) {
  if (!CATEGORIES[category]) note(`${where}: unknown category "${category}"`);
}

function checkDate(iso, where) {
  if (!iso) return;
  if (Number.isNaN(new Date(iso).getTime())) note(`${where}: unparseable date ${iso}`);
  if (!/[+-]\d{2}:\d{2}$/.test(iso)) note(`${where}: date ${iso} has no UTC offset (use -04:00 or -05:00 for New York)`);
}

const ids = new Set();
TASKS.forEach((task) => {
  const where = `TASKS.${task.id}`;
  if (ids.has(task.id)) note(`${where}: duplicate id`);
  ids.add(task.id);
  if (!task.title) note(`${where}: missing title`);
  checkCategory(task.category, where);
  if (!PLACES[task.where]) note(`${where}: unknown place "${task.where}"`);
  if (!["before", "tuesday", "later"].includes(task.day)) note(`${where}: day must be before | tuesday | later`);
  if (task.urgent && task.day === "later") note(`${where}: urgent tasks need day "before" or "tuesday"`);
  if (!task.due && !task.dueLabel) note(`${where}: needs a due date or a dueLabel`);
  checkDate(task.due, where);
  checkDate(task.start, where);
  checkLinks(task.links, where);
});

MONDAY.plan.forEach((step, i) => {
  if (step.taskId && !ids.has(step.taskId)) note(`MONDAY.plan[${i}]: unknown taskId "${step.taskId}"`);
  if (!step.taskId && !step.id) note(`MONDAY.plan[${i}]: needs a taskId or its own id`);
});
checkLinks(MONDAY.links, "MONDAY");

TUESDAY.timeline.forEach((entry, i) => {
  const where = `TUESDAY.timeline[${i}]`;
  checkCategory(entry.category, where);
  if (entry.taskId && !ids.has(entry.taskId)) note(`${where}: unknown taskId "${entry.taskId}"`);
  if (!PLACES[entry.where]) note(`${where}: unknown place "${entry.where}"`);
  checkLinks(entry.links, where);
});

TOOLBOX.forEach((tool) => { checkCategory(tool.category, `TOOLBOX.${tool.key}`); checkLinks(tool.links, `TOOLBOX.${tool.key}`); });
SOFTWARE.forEach((phase) => phase.items.forEach((item) => { checkCategory(item.category, `SOFTWARE "${item.name}"`); checkLinks(item.links, `SOFTWARE "${item.name}"`); }));
POSSIBLY_MISSED.forEach((m, i) => { checkCategory(m.category, `POSSIBLY_MISSED[${i}]`); checkLinks(m.links, `POSSIBLY_MISSED[${i}]`); });
SOURCES.forEach((s, i) => { if (!LINKS[s.key]) note(`SOURCES[${i}]: unknown LINKS key "${s.key}"`); });
checkLinks([GRADING.source, AI_POLICY.source], "GRADING/AI_POLICY source");
checkLinks(LAB.links, "LAB");

const total = GRADING.weights.reduce((sum, w) => sum + w.percent, 0);
if (total !== 100) note(`GRADING weights add up to ${total}%, not 100%`);

const html = await readFile(new URL("./src/index.html", import.meta.url), "utf8");
QUESTIONS.forEach((q) => { if (!html.includes(`id="${q.target}"`)) note(`QUESTIONS "${q.q}" points to missing section #${q.target}`); });
for (const match of html.matchAll(/href="(https?:[^"]+)"/g)) checkUrl(match[1], "index.html");
for (const match of html.matchAll(/href="#([^"]+)"/g)) { if (!html.includes(`id="${match[1]}"`)) note(`index.html: anchor #${match[1]} has no target`); }
["data.js", "app.js", "styles.css"].forEach((file) => { if (!html.includes(file)) note(`index.html does not reference ${file}`); });

const verifyCount = JSON.stringify(data).match(/"verify":/g)?.length ?? 0;
console.log(`Checked ${Object.keys(LINKS).length} links, ${TASKS.length} tasks, ${TOOLBOX.length} toolbox entries, ${verifyCount} items flagged "verify".`);
if (problems.length) {
  console.error("\nProblems:\n - " + problems.join("\n - "));
  process.exit(1);
}
console.log("No problems found.");
