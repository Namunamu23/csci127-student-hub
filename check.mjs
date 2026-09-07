// Validates the editorial layer (src/data.js), the generated course data
// (src/course.json) and src/index.html without any dependencies.
// Run with: npm run check
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const problems = [];
const note = (message) => problems.push(message);
const read = (p) => readFile(new URL(p, import.meta.url), "utf8");

/* ---------- editorial layer ---------- */
const sandbox = { window: {} };
vm.runInNewContext(await read("./src/data.js"), sandbox);
const data = sandbox.window.CSCI127_DATA;
if (!data) { console.error("data.js did not define window.CSCI127_DATA"); process.exit(1); }
const { LINKS, PLACES, CATEGORIES, RULES, TEMPLATES, STANDING, TOOLBOX, SOFTWARE, MISSED_CHECKS, SOURCES, GRADING_EXTRA, AI_POLICY, LAB, CAMPUS_DAY } = data;

function checkUrl(href, where) {
  try {
    const url = new URL(href);
    if (!["https:", "http:", "mailto:"].includes(url.protocol)) note(`${where}: unexpected protocol in ${href}`);
    if (url.protocol === "http:") console.warn(`warning: ${where} uses plain http (${href})`);
  } catch { note(`${where}: invalid URL ${href}`); }
}
for (const [key, link] of Object.entries(LINKS)) { if (!link.label) note(`LINKS.${key} has no label`); checkUrl(link.href, `LINKS.${key}`); }
function checkLinks(specs, where) {
  (specs || []).forEach((spec, i) => {
    if (spec.key && !LINKS[spec.key]) note(`${where}: links[${i}] refers to unknown LINKS key "${spec.key}"`);
    if (!spec.key && !spec.href) note(`${where}: links[${i}] has neither key nor href`);
    if (spec.href) checkUrl(spec.href, `${where} links[${i}]`);
  });
}
const checkCategory = (c, where) => { if (!CATEGORIES[c]) note(`${where}: unknown category "${c}"`); };

if (!RULES || !RULES.lecture || typeof RULES.lecture.weekday !== "number") note("RULES.lecture.weekday missing");
if (!/^\d{2}:\d{2}$/.test(RULES?.assessmentDeadline?.time || "")) note("RULES.assessmentDeadline.time must be HH:MM");
["homework", "quiz", "codeReview", "lab", "lecture", "extra", "final"].forEach((k) => { if (typeof TEMPLATES?.[k] !== "function") note(`TEMPLATES.${k} missing`); });
if (RULES?.preLecture?.source && !LINKS[RULES.preLecture.source]) note("RULES.preLecture.source is not a LINKS key");
if (RULES?.labHours?.source && !LINKS[RULES.labHours.source]) note("RULES.labHours.source is not a LINKS key");

const ids = new Set();
STANDING.forEach((s) => {
  const where = `STANDING.${s.id}`;
  if (ids.has(s.id)) note(`${where}: duplicate id`); ids.add(s.id);
  if (/^(hw|quiz|cr|lab|ec|lecture)-/.test(s.id) || s.id === "final") note(`${where}: id collides with generated task ids`);
  checkCategory(s.category, where);
  if (!PLACES[s.where]) note(`${where}: unknown place "${s.where}"`);
  if (!s.dueLabel) note(`${where}: needs a dueLabel`);
  checkLinks(s.links, where);
});
TOOLBOX.forEach((t) => { checkCategory(t.category, `TOOLBOX.${t.key}`); checkLinks(t.links, `TOOLBOX.${t.key}`); });
SOFTWARE.forEach((phase) => phase.items.forEach((item) => { checkCategory(item.category, `SOFTWARE "${item.name}"`); checkLinks(item.links, `SOFTWARE "${item.name}"`); }));
MISSED_CHECKS.forEach((m, i) => { checkCategory(m.category, `MISSED_CHECKS[${i}]`); checkLinks(m.links, `MISSED_CHECKS[${i}]`); });
SOURCES.forEach((s, i) => { if (!LINKS[s.key]) note(`SOURCES[${i}]: unknown LINKS key "${s.key}"`); });
checkLinks([GRADING_EXTRA.source, AI_POLICY.source], "GRADING_EXTRA/AI_POLICY source");
checkLinks(LAB.links, "LAB");
if (!CAMPUS_DAY || !CAMPUS_DAY.bring?.length) note("CAMPUS_DAY.bring is empty");

/* ---------- generated course data ---------- */
let course = null;
try { course = JSON.parse(await read("./src/course.json")); } catch { note("src/course.json is missing — run `npm run watch`"); }
if (course) {
  const iso = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) && !Number.isNaN(Date.parse(s));
  if (!(course.homework || []).length) note("course.json has no homework");
  (course.homework || []).forEach((h) => { if (!iso(h.due)) note(`Homework ${h.n} has no due datetime`); if (!h.url) note(`Homework ${h.n} has no url`); });
  (course.windows || []).forEach((w) => { if (!iso(w.end)) note(`Week ${w.week} window has no end date`); });
  (course.labs || []).forEach((l) => { if (!iso(l.target)) note(`Lab ${l.n} has no target date`); });
  (course.weeks || []).forEach((w) => { if (!iso(w.start) || !iso(w.end)) note(`Week ${w.n} has no date range`); });
  if (!iso(course.final?.date)) note("course.json final.date missing");
  const total = (course.grading?.weights || []).reduce((s, w) => s + w.percent, 0);
  if (total !== 100) note(`course.json grading weights add up to ${total}`);
  const stale = (Date.now() - Date.parse(course.generatedAt)) / 86400000;
  if (stale > 14) console.warn(`warning: course.json is ${Math.round(stale)} days old`);
}
for (const name of ["changes.json", "status.json", "announcements.json"]) {
  try { JSON.parse(await read("./src/" + name)); } catch { note(`src/${name} is missing or invalid JSON`); }
}

/* ---------- html ---------- */
const html = await read("./src/index.html");
for (const match of html.matchAll(/href="(https?:[^"]+)"/g)) checkUrl(match[1], "index.html");
for (const match of html.matchAll(/href="#([^"]+)"/g)) { if (!html.includes(`id="${match[1]}"`)) note(`index.html: anchor #${match[1]} has no target`); }
["home", "all", "announcements", "toolbox", "grading", "lab", "software", "sources"].forEach((id) => { if (!html.includes(`id="${id}" data-screen`)) note(`index.html is missing screen #${id}`); });
["data.js", "course.js", "app.js", "styles.css"].forEach((file) => { if (!html.includes(file)) note(`index.html does not reference ${file}`); });
["now", "next", "rest", "week-strip", "week-plan", "task-list", "missed-list", "announcement-list", "toolbox-grid", "grading-weights", "grading-final", "ai-allowed", "campus-timeline", "campus-bring", "lab-where", "lab-services", "lab-closures", "software-phases", "source-list", "status-sources", "change-list", "today", "progress-label", "search", "filter-row", "reset-progress"].forEach((id) => { if (!html.includes(`id="${id}"`)) note(`index.html is missing #${id}, which app.js renders into`); });

console.log(`Checked ${Object.keys(LINKS).length} links, ${STANDING.length} standing reminders, ${TOOLBOX.length} toolbox entries` + (course ? `, ${course.homework.length} homework items, ${course.windows.length} windows, ${course.weeks.length} weeks` : "") + ".");
if (problems.length) { console.error("\nProblems:\n - " + problems.join("\n - ")); process.exit(1); }
console.log("No problems found.");
