#!/usr/bin/env node
/*
  Course Watch — reads the official CSCI 127 pages and turns them into data
  the hub renders. Dependency-free (Node 20+).

  Writes:
    src/course.json         structured course data (weeks, homework, quiz &
                            code-review windows, labs, final, grading, holidays)
    src/changes.json        human-readable "what changed" log (newest first)
    src/status.json         when each source was last checked / changed
    src/announcements.json  manual announcements from GitHub issues labelled
                            "announcement" (only when GITHUB_TOKEN is set)

  Exit codes: 0 = ok (changed or unchanged), 2 = validation failed (nothing
  overwritten except status.json), 3 = every source unreachable.

  Options:
    --offline   do not fetch; only re-validate the files on disk
    --quiet     less logging
  Env:
    GITHUB_TOKEN, GITHUB_REPOSITORY   for announcements (issues) and a higher
                                      GitHub API rate limit
    GITHUB_OUTPUT                     when set, writes changed=/valid= outputs
*/
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, "src");
const args = new Set(process.argv.slice(2));
const QUIET = args.has("--quiet");
const OFFLINE = args.has("--offline");
const log = (...m) => { if (!QUIET) console.log(...m); };

/* ---------- configuration (the only things tied to this semester) ---------- */
const CONFIG = {
  term: "Fall 2026",
  termYear: 2026,          // months Aug–Dec belong to this year, Jan–Jul to the next
  timeZone: "America/New_York",
  siteBase: "https://huntercsci127.github.io/",
  courseRepo: "HunterCSci127/HunterCSci127.github.io",
  courseBranch: "master",
  pages: {                 // path in the course repo → also the public URL path
    home: "f26.html",
    coursework: "f26/cw.html",
    homework: "f26/ps.html",
    syllabus: "f26/syl.html",
    resources: "f26/resources.html",
    faq: "f26/faq.html",
    lab0: "f26/lab0.html",
    lab1: "f26/lab1.html"
  },
  hunterCalendar: "https://hunter.cuny.edu/students/registration/academic-calendar/",
  hunterTermHeading: /Fall\s+2026/i,
  homeworkDueTime: "17:00",
  maxChangeEntries: 120
};

/* ---------- small helpers ---------- */
const sha = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const pad = (n) => String(n).padStart(2, "0");
function yearFor(month) { return month >= 8 ? CONFIG.termYear : CONFIG.termYear + 1; }
function isoFromMonthDay(monthName, day) {
  const m = MONTHS.indexOf(monthName.toLowerCase()) + 1;
  if (!m) return null;
  return `${yearFor(m)}-${pad(m)}-${pad(Number(day))}`;
}
function isoFromNumeric(md) {           // "9/7" → 2026-09-07
  const m = md.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  return `${yearFor(Number(m[1]))}-${pad(m[1])}-${pad(m[2])}`;
}
function parseLongDate(text) {          // "Tuesday, September 8" | "September 8" | "None"
  if (!text) return null;
  const m = text.match(/([A-Za-z]+)\s+(\d{1,2})(?!\d)/);
  if (!m || !MONTHS.includes(m[1].toLowerCase())) return null;
  return isoFromMonthDay(m[1], m[2]);
}
function offsetFor(iso) {               // EDT until the first Sunday of November, then EST
  const [y, m, d] = iso.split("-").map(Number);
  const nov = new Date(Date.UTC(y, 10, 1));
  const firstSunday = 1 + ((7 - nov.getUTCDay()) % 7);
  const dst = (m > 3 && m < 11) || (m === 11 && d < firstSunday) || (m === 3 && d >= 8 + ((7 - new Date(Date.UTC(y, 2, 1)).getUTCDay()) % 7));
  return dst ? "-04:00" : "-05:00";
}
function withTime(iso, hhmm) { return `${iso}T${hhmm}:00${offsetFor(iso)}`; }
const INLINE_TAGS = /<\/?(a|b|i|u|tt|code|span|em|strong|sup|sub|small|font|abbr)(\s[^>]*)?>/gi;
function stripTags(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "; ")
    .replace(/<\/(p|li|div|tr|h\d)>/gi, "; ")
    .replace(INLINE_TAGS, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&emsp;/g, " ")
    .replace(/\s*;\s*(;\s*)+/g, "; ")
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(").replace(/\s+\)/g, ")").replace(/\s+([,.;:!?])/g, "$1")
    .replace(/^[;\s]+|[;\s]+$/g, "")
    .trim();
}
function sectionFrom(html, id, untilId) {
  const at = html.indexOf(`id="${id}"`);
  if (at < 0) return "";
  const start = html.lastIndexOf("<", at);
  const end = untilId ? html.indexOf(`id="${untilId}"`, at + 1) : -1;
  return end > start ? html.slice(start, html.lastIndexOf("<", end)) : html.slice(start);
}
function absolute(href, pagePath) {
  if (!href) return null;
  if (/^https?:/i.test(href)) return href;
  if (href.startsWith("#")) return CONFIG.siteBase + pagePath + href;
  const dir = pagePath.includes("/") ? pagePath.slice(0, pagePath.lastIndexOf("/") + 1) : "";
  if (href.startsWith("../")) return CONFIG.siteBase + href.replace(/^\.\.\//, "");
  return CONFIG.siteBase + dir + href;
}
function links(html, pagePath) {
  const out = [];
  const re = /<a\s+[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const label = stripTags(m[2]);
    if (!label) continue;
    out.push({ label, href: absolute(m[1], pagePath) });
  }
  return out;
}
function cells(rowHtml) {
  const out = [];
  const re = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = re.exec(rowHtml))) out.push(m[1]);
  return out;
}
function rows(tableHtml) {
  // Tolerates rows that never close (</tr> missing on some course pages).
  return tableHtml.split(/<tr[^>]*>/i).slice(1).map((seg) => seg.split(/<\/tr>/i)[0]).filter((seg) => /<td/i.test(seg));
}

/* ---------- fetching ---------- */
const headers = { "user-agent": "csci127-student-hub course-watch (+https://github.com/Namunamu23/csci127-student-hub)" };
if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

async function getText(url, extraHeaders) {
  const res = await fetch(url, { headers: { ...headers, ...(extraHeaders || {}) }, redirect: "follow" });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}
async function getJson(url) {
  const res = await fetch(url, { headers: { ...headers, accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

/* ---------- parsers ---------- */
function parseCoursework(html, pagePath) {
  const out = { windows: [], labs: [], final: {}, rules: {} };
  const cal = sectionFrom(html, "calendar");
  const table = cal.slice(cal.indexOf("<table"), cal.indexOf("</table>"));
  for (const row of rows(table)) {
    const c = cells(row);
    if (c.length < 8) continue;
    const week = Number((stripTags(c[0]).match(/\d+/) || [])[0]);
    if (Number.isNaN(week)) continue;
    const quizHtml = c[6]; const crHtml = c[7];
    const quizText = stripTags(quizHtml); const crText = stripTags(crHtml);
    const quizNum = (quizText.match(/Quiz\s+(\d+)/i) || [])[1];
    const crNum = (crText.match(/Code Review\s+(\d+)/i) || [])[1];
    const hwNums = [...crText.matchAll(/HW\s+([\d,&\s]+)/gi)].flatMap((m) => m[1].match(/\d+/g) || []).map(Number);
    out.windows.push({
      week,
      start: parseLongDate(stripTags(c[1])),
      early15: parseLongDate(stripTags(c[2])),
      early10: parseLongDate(stripTags(c[3])),
      early5: parseLongDate(stripTags(c[4])),
      end: parseLongDate(stripTags(c[5])),
      quiz: quizNum ? { n: Number(quizNum), text: quizText.replace(/^Quiz\s+\d+:\s*/i, ""), onBrightspace: /brightspace/i.test(quizText), links: links(quizHtml, pagePath) } : null,
      codeReview: crNum ? { n: Number(crNum), text: crText.replace(/^Code Review\s+\d+:\s*/i, ""), homework: hwNums, links: links(crHtml, pagePath) } : null
    });
  }
  const labSection = sectionFrom(html, "labs", "quizzes");
  const labRe = /<a id="lab(\d+)">[\s\S]*?<a href="(lab\d+\.html)">([^<]+)<\/a>[\s\S]*?Target date:\s*([^.<]+)\.?[\s\S]*?(?:Learning Objective:\s*([^<]+))?<\/p>/gi;
  let m;
  while ((m = labRe.exec(labSection))) {
    out.labs.push({ n: Number(m[1]), title: stripTags(m[3]).replace(/\.$/, ""), url: absolute(m[2], pagePath), target: parseLongDate(m[4]), objective: m[5] ? stripTags(m[5]) : "" });
  }
  const finalSection = sectionFrom(html, "final");
  const finalText = stripTags(finalSection.slice(0, 4000));
  const fm = finalText.match(/registrar's assigned time slot:\s*([A-Za-z]+),\s*([A-Za-z]+)\s+(\d{1,2}),\s*([\d:]+\s*-\s*[\d:]+\s*[ap]m)/i);
  if (fm) out.final = { weekday: fm[1], date: isoFromMonthDay(fm[2], fm[3]), time: fm[4].replace(/\s+/g, ""), text: `${fm[1]}, ${fm[2]} ${fm[3]}, ${fm[4]}` };
  const mock = finalText.match(/mock final exam[^.]*?([A-Za-z]+),\s*([A-Za-z]+)\s+(\d{1,2})/i) || finalText.match(/([A-Za-z]+),\s*([A-Za-z]+)\s+(\d{1,2}),\s*we will have a mock final/i);
  if (mock) out.final.mock = isoFromMonthDay(mock[2], mock[3]);
  const passRule = finalText.match(/You must take and pass the final[^.]*\./);
  if (passRule) out.final.passRule = passRule[0];
  const early = (html.match(/There is up to 15% extra credit[^<]*\./) || [])[0];
  if (early) out.rules.extraCredit = stripTags(early);
  const crSection = stripTags(sectionFrom(html, "cr", "calendar"));
  out.rules.codeReview = crSection.slice(0, 1200);
  const quizSection = stripTags(sectionFrom(html, "quizzes", "cr"));
  out.rules.quizzes = quizSection.slice(0, 900);
  const invite = (stripTags(html).match(/On [A-Za-z]+, [A-Za-z]+ \d+, all registered students are sent a Gradescope registration invitation[^.]*\./) || [])[0];
  if (invite) out.rules.gradescopeInvitation = invite;
  return out;
}

function parseHomework(html, pagePath) {
  const setPositions = [...html.matchAll(/id="set(\d+)"/g)].map((m) => ({ set: Number(m[1]), at: m.index }));
  const parts = html.split(/<!--\s*program\s*(\d+)\s*-->/i);
  const out = [];
  for (let i = 1; i < parts.length; i += 2) {
    const n = Number(parts[i]);
    const block = parts[i + 1];
    const at = html.indexOf(block);
    const set = setPositions.filter((s) => s.at < at).pop()?.set ?? null;
    const due = (block.match(/Due Date:\s*([^<]+)</i) || [])[1] || "";
    const dueTime = (due.match(/(\d{1,2})(?::(\d{2}))?\s*([ap])m/i));
    let hhmm = CONFIG.homeworkDueTime;
    if (dueTime) { let h = Number(dueTime[1]) % 12; if (dueTime[3].toLowerCase() === "p") h += 12; hhmm = `${pad(h)}:${dueTime[2] || "00"}`; }
    const dueIso = parseLongDate(due);
    const title = (block.match(/<p>\s*<b>([^<]+)<\/b>\s*<\/p>/) || [])[1] || `Program ${n}`;
    const libs = stripTags((block.match(/Available Libraries:\s*([\s\S]*?)<\/p>/i) || [])[1] || "");
    const readingHtml = (block.match(/Reading:\s*([\s\S]*?)<\/b>\s*<br>/i) || [])[1] || "";
    const descHtml = block.split(/<p>\s*<b>[^<]+<\/b>\s*<\/p>/)[1] || "";
    const description = stripTags(descHtml.split(/<hr>|<pre>|<ul>|<ol>|<img/i)[0]).slice(0, 260);
    out.push({
      n, set, title: title.trim(),
      due: dueIso ? withTime(dueIso, hhmm) : null,
      dueText: due.trim(),
      libraries: libs.replace(/^none$/i, "none"),
      reading: links(readingHtml, pagePath),
      description,
      url: set ? `${CONFIG.siteBase}${pagePath}#set${set}` : `${CONFIG.siteBase}${pagePath}`
    });
  }
  const rulesText = stripTags(html.slice(0, html.indexOf('id="set1"')));
  const rules = {};
  const early = rulesText.match(/submit your assignments up to ([a-z]+) weeks? before the due date/i);
  if (early) rules.earlySubmission = early[0];
  const py = rulesText.match(/autograder uses Python ([\d.]+)/i);
  if (py) rules.python = py[1];
  return { homework: out, rules };
}

function parseHome(html, pagePath) {
  const out = { weeks: [], lecture: "", labInfo: "", finalNote: "", announcements: [] };
  const text = stripTags(html.slice(0, html.indexOf("<table")));
  out.lecture = (text.match(/Weekly Lecture:\s*([^;]+?)(?:;|Weekly Lab|$)/) || [])[1]?.trim() || "";
  out.labInfo = (text.match(/Weekly Lab, Quiz & Code Review:\s*([^;]+?)(?:;|Final Exam|$)/) || [])[1]?.trim() || "";
  const finalsRow = (html.match(/<tr[^>]*>\s*<td[^>]*>\s*<b>Finals Week<\/b>[\s\S]*?(?:<\/tr>|<\/table>)/i) || [])[0] || "";
  out.finalNote = finalsRow ? stripTags(finalsRow).replace(/^Finals Week;?\s*/i, "") : (text.match(/Final Exam:\s*([^;]+)/) || [])[1]?.trim() || "";
  const parts = html.split(/<!--\s*Week\s+(\d+):\s*-->/i);
  for (let i = 1; i < parts.length; i += 2) {
    const n = Number(parts[i]);
    const block = parts[i + 1];
    const trs = rows(block);
    if (!trs.length) continue;
    const c = cells(trs[0]);
    if (c.length < 6) continue;
    const range = stripTags(c[1]);
    const rm = range.match(/(\d{1,2}\/\d{1,2})\s*-\s*(\d{1,2}\/\d{1,2})/);
    const week = {
      n,
      start: rm ? isoFromNumeric(rm[1]) : null,
      end: rm ? isoFromNumeric(rm[2]) : null,
      topics: stripTags(c[2]),
      handouts: links(c[3], pagePath),
      coursework: links(c[4], pagePath),
      reading: links(c[5], pagePath),
      readingText: stripTags(c[5]),
      notes: []
    };
    for (const tr of trs.slice(1)) {
      const cc = cells(tr);
      if (cc.length < 2) continue;
      const dateText = stripTags(cc[0]);
      const dm = dateText.match(/(\d{1,2}\/\d{1,2})/);
      const note = { date: dm ? isoFromNumeric(dm[1]) : null, dateText, text: stripTags(cc[1]), links: links(cc[1], pagePath), announcement: /class="announcement"/.test(tr) };
      note.labClosed = /lab closed/i.test(note.text);
      note.noClasses = /no classes|college closed/i.test(note.text);
      week.notes.push(note);
      out.announcements.push({ week: n, ...note });
    }
    out.weeks.push(week);
  }
  return out;
}

function parseSyllabus(html) {
  const text = stripTags(html);
  const weights = [...text.matchAll(/(\d{1,3})%:\s*([A-Za-z ]+?)\./g)].map((m) => ({ label: m[2].trim(), percent: Number(m[1]) }));
  const pick = (re) => (text.match(re) || [])[0] || "";
  return {
    weights,
    homeworkCount: pick(/the highest \d+ grades are used for your homework total/i),
    quizCount: pick(/The quiz grade is based on the highest \d+ quiz grades/i),
    codeReviewCount: pick(/The code review grade is based on the highest \d+ code review grades/i),
    participation: pick(/The participation grade is based on the highest \d+ lecture slip grades/i),
    finalRule: pick(/You must take and pass the final[^.]*\./i),
    earlySubmission: pick(/submit assignments up to \d+ weeks early/i),
    labHours: pick(/(?:lab is open|Tutoring is in the 1001E HN lab)[^.]*\./i)
  };
}

function parseLabHours(html) {
  const text = stripTags(html);
  return ((text.match(/lab is open[^.]*?(\d{1,2}(?::\d{2})?\s*[ap]?m?\s*-\s*\d{1,2}(?::\d{2})?\s*[ap]m)[^.]*/i) || text.match(/M-F,?\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}(?::\d{2})?\s*[ap]?m?/i) || [])[0] || "").replace(/[\s).;,]+$/, "");
}

function parseHunterCalendar(html) {
  const text = html.replace(/<[^>]+>/g, "\n").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#8211;|&ndash;/g, "–");
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const isHeading = (l) => /^(Fall|Spring|Summer|Winter)\s+20\d\d$/.test(l);
  const start = lines.findIndex((l) => isHeading(l) && CONFIG.hunterTermHeading.test(l));
  if (start < 0) return [];
  let end = lines.findIndex((l, i) => i > start && isHeading(l));
  if (end < 0) end = lines.length;
  const section = lines.slice(start + 1, end);
  const dateRe = /^(\d{1,2}\/\d{1,2})(?:\s*[–-]\s*(\d{1,2}\/\d{1,2}))?$/;
  const dayRe = /^[A-Za-z]+(\s*[–-]\s*[A-Za-z]+)?$/;
  const iso = (md) => { const m = md.match(/^(\d{1,2})\/(\d{1,2})$/); return m ? `${CONFIG.termYear}-${pad(m[1])}-${pad(m[2])}` : null; };
  const out = [];
  for (let i = 0; i < section.length; i++) {
    const m = section[i].match(dateRe);
    if (!m || !dayRe.test(section[i + 1] || "")) continue;
    const texts = [];
    for (let j = i + 2; j < section.length && !dateRe.test(section[j]); j++) texts.push(section[j]);
    if (!texts.length) continue;
    out.push({ start: iso(m[1]), end: m[2] ? iso(m[2]) : iso(m[1]), days: section[i + 1], text: texts.join(" · ") });
  }
  return out;
}

/* ---------- announcements from GitHub issues ---------- */
// The hub shows a short summary of each announcement, never the full text: the
// wording stays on Brightspace (login). Long issue texts are cut to SUMMARY_CHARS.
const SUMMARY_CHARS = 320;
function summarize(text, max = SUMMARY_CHARS) {
  const flat = String(text || "").replace(/^\s*(?:[*\-•]|\d+[.)])\s+/gm, "").replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const atSentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  const head = atSentence > max * 0.4 ? cut.slice(0, atSentence + 1) : cut.replace(/\s+\S*$/, "").replace(/[,;:\s]+$/, "");
  return head + " …";
}
async function fetchAnnouncements(repo) {
  const issues = await getJson(`https://api.github.com/repos/${repo}/issues?labels=announcement&state=open&per_page=50`);
  return issues.filter((i) => !i.pull_request).map((i) => {
    const auto = /Posted automatically from a Brightspace notification/i.test(i.body || "");
    const body = (i.body || "").replace(/\r/g, "").replace(/^_?Posted automatically from a Brightspace notification e-mail\.[^\n]*$/gim, "").replace(/_No response_/g, "");
    const field = (name) => { const m = body.match(new RegExp(`###\\s*(?:${name})\\s*\\n+([\\s\\S]*?)(?=\\n###|$)`, "i")); return m && m[1] ? m[1].trim() : ""; };
    const date = field("Date") || i.created_at.slice(0, 10);
    const text = field("What it says|Announcement|Text|Details") || body.replace(/^###.*$/gm, "").trim();
    const link = (field("Link").split(/\s+/)[0] || "").replace(/^<|>$/g, "");
    return { id: i.number, title: String(i.title || "Announcement").replace(/^\[Announcement\]\s*/i, "").trim(), date: /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : i.created_at.slice(0, 10), text: summarize(text), link: /^https?:\/\//.test(link) ? link : "", url: i.html_url, auto, addedAt: i.created_at, updatedAt: i.updated_at };
  }).sort((a, b) => (b.date + b.addedAt).localeCompare(a.date + a.addedAt));
}

/* ---------- diff ---------- */
function keyed(list, keyFn) { const m = new Map(); (list || []).forEach((x) => m.set(keyFn(x), x)); return m; }
function diffLists(prev, next, keyFn, labelFn, fields) {
  const a = keyed(prev, keyFn), b = keyed(next, keyFn), out = [];
  for (const [k, item] of b) {
    if (!a.has(k)) { out.push(`Added: ${labelFn(item)}`); continue; }
    const before = a.get(k);
    fields.forEach((f) => {
      const x = JSON.stringify(before[f] ?? null), y = JSON.stringify(item[f] ?? null);
      if (x !== y) out.push(`${labelFn(item)} — ${f} changed: ${short(before[f])} → ${short(item[f])}`);
    });
  }
  for (const [k, item] of a) if (!b.has(k)) out.push(`Removed: ${labelFn(item)}`);
  return out;
}
function short(v) {
  if (v === null || v === undefined) return "(none)";
  if (Array.isArray(v) && v.every((x) => x && typeof x === "object" && "label" in x)) v = v.map((x) => x.label).join(", ");
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 90 ? s.slice(0, 87) + "…" : s;
}
function describeChanges(prev, next) {
  if (!prev) return ["First snapshot of the course data."];
  const out = [];
  out.push(...diffLists(prev.homework, next.homework, (h) => h.n, (h) => `Homework ${h.n} (${h.title})`, ["due", "title", "libraries", "reading"]));
  out.push(...diffLists(prev.windows, next.windows, (w) => w.week, (w) => `Week ${w.week} quiz/code-review window`, ["start", "end", "early15", "early10", "early5"]));
  out.push(...diffLists((prev.windows || []).map((w) => w.quiz).filter(Boolean), (next.windows || []).map((w) => w.quiz).filter(Boolean), (q) => q.n, (q) => `Quiz ${q.n}`, ["text"]));
  out.push(...diffLists((prev.windows || []).map((w) => w.codeReview).filter(Boolean), (next.windows || []).map((w) => w.codeReview).filter(Boolean), (c) => c.n, (c) => `Code Review ${c.n}`, ["text", "homework"]));
  out.push(...diffLists(prev.labs, next.labs, (l) => l.n, (l) => `Lab ${l.n} (${l.title})`, ["target", "title"]));
  out.push(...diffLists(prev.weeks, next.weeks, (w) => w.n, (w) => `Week ${w.n} (${w.start})`, ["topics", "reading", "handouts", "coursework", "start", "end"]));
  out.push(...diffLists((prev.weeks || []).flatMap((w) => w.notes), (next.weeks || []).flatMap((w) => w.notes), (n) => n.date + "|" + n.text, (n) => `Course-site note ${n.dateText}: ${n.text}`, []));
  out.push(...diffLists(prev.holidays, next.holidays, (h) => h.start + "|" + h.text, (h) => `Hunter calendar ${h.start}: ${h.text}`, []));
  ["final", "grading", "labHours", "lecture"].forEach((k) => {
    if (JSON.stringify(prev[k] ?? null) !== JSON.stringify(next[k] ?? null)) out.push(`${k} changed: ${short(prev[k])} → ${short(next[k])}`);
  });
  return out;
}

/* ---------- validation ---------- */
function validate(course, prev) {
  const p = [];
  const iso = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}/.test(s) && !Number.isNaN(Date.parse(s));
  const hw = course.homework || [];
  if (hw.length < 30 || hw.length > 90) p.push(`homework count looks wrong: ${hw.length}`);
  hw.forEach((h) => { if (!iso(h.due)) p.push(`Homework ${h.n} has no parseable due date (${h.dueText})`); });
  const win = course.windows || [];
  if (win.length < 8 || win.length > 20) p.push(`quiz/code-review window count looks wrong: ${win.length}`);
  win.forEach((w) => { if (!iso(w.end)) p.push(`Week ${w.week} window has no end date`); });
  const labs = course.labs || [];
  if (labs.length < 8 || labs.length > 20) p.push(`lab count looks wrong: ${labs.length}`);
  const weeks = course.weeks || [];
  if (weeks.length < 10 || weeks.length > 20) p.push(`week count looks wrong: ${weeks.length}`);
  weeks.forEach((w) => { if (!iso(w.start) || !iso(w.end)) p.push(`Week ${w.n} has no date range`); });
  if (!iso(course.final?.date)) p.push("final exam date missing");
  const weights = course.grading?.weights || [];
  const total = weights.reduce((s, w) => s + w.percent, 0);
  if (weights.length && total !== 100) p.push(`grading weights add up to ${total}`);
  if (prev) {
    const drop = (a, b, name) => { if ((prev[a] || []).length && (course[a] || []).length < (prev[a] || []).length * 0.7) p.push(`${name} shrank from ${(prev[a] || []).length} to ${(course[a] || []).length}`); };
    drop("homework", "homework", "homework list"); drop("windows", "windows", "calendar"); drop("weeks", "weeks", "weekly plan");
  }
  return p;
}

/* ---------- main ---------- */
async function readJson(name, fallback) { try { return JSON.parse(await readFile(join(SRC, name), "utf8")); } catch { return fallback; } }
async function writeJson(name, data) { await mkdir(SRC, { recursive: true }); await writeFile(join(SRC, name), JSON.stringify(data, null, 2) + "\n"); }
function setOutput(name, value) { if (process.env.GITHUB_OUTPUT) return writeFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, { flag: "a" }); }

const now = new Date().toISOString();
const prev = await readJson("course.json", null);
const prevStatus = await readJson("status.json", { sources: {} });
const status = { lastRunAt: now, courseRepo: { ...(prevStatus.courseRepo || {}) }, sources: { ...(prevStatus.sources || {}) }, validation: { ok: true, problems: [] } };

if (OFFLINE) {
  const problems = validate(prev || {}, null);
  console.log(problems.length ? "Offline validation problems:\n - " + problems.join("\n - ") : "Offline validation ok.");
  process.exit(problems.length ? 2 : 0);
}

// 1. Where is the course repo right now?
let repoSha = null;
try {
  const branch = await getJson(`https://api.github.com/repos/${CONFIG.courseRepo}/branches/${CONFIG.courseBranch}`);
  repoSha = branch.commit.sha;
  status.courseRepo = { sha: repoSha, committedAt: branch.commit.commit.committer.date, checkedAt: now, url: `https://github.com/${CONFIG.courseRepo}/commits/${CONFIG.courseBranch}` };
  log(`course repo at ${repoSha.slice(0, 7)} (${branch.commit.commit.committer.date})`);
} catch (e) { log("could not read course repo state:", e.message); status.courseRepo.error = e.message; }

// 2. Fetch every page (raw from GitHub at that commit when possible, otherwise the live site).
const pageHtml = {};
let reachable = 0;
for (const [name, path] of Object.entries(CONFIG.pages)) {
  const urls = repoSha ? [`https://raw.githubusercontent.com/${CONFIG.courseRepo}/${repoSha}/${path}`, CONFIG.siteBase + path] : [CONFIG.siteBase + path];
  let html = null, used = null, error = null;
  for (const u of urls) { try { html = await getText(u); used = u; break; } catch (e) { error = e.message; } }
  const entry = { url: CONFIG.siteBase + path, checkedAt: now, ok: Boolean(html), ...(status.sources[name] || {}) };
  if (html) {
    reachable++;
    const digest = sha(html);
    entry.ok = true; entry.checkedAt = now; entry.error = undefined;
    if (entry.sha !== digest) { entry.sha = digest; entry.changedAt = now; }
    entry.fetchedFrom = used.includes("raw.githubusercontent") ? "github" : "site";
    pageHtml[name] = html;
  } else { entry.ok = false; entry.error = error; entry.checkedAt = now; }
  status.sources[name] = entry;
  log(`${entry.ok ? "ok " : "ERR"} ${name} ${entry.ok ? "" : error}`);
}

// 3. Hunter academic calendar (may refuse bots; keep the previous copy then).
let holidays = prev?.holidays || [];
try {
  const html = await getText(CONFIG.hunterCalendar, { accept: "text/html" });
  const parsed = parseHunterCalendar(html);
  if (parsed.length >= 5) { holidays = parsed; status.sources.hunterCalendar = { url: CONFIG.hunterCalendar, ok: true, checkedAt: now, changedAt: JSON.stringify(parsed) !== JSON.stringify(prev?.holidays || []) ? now : status.sources.hunterCalendar?.changedAt, entries: parsed.length }; reachable++; }
  else status.sources.hunterCalendar = { ...(status.sources.hunterCalendar || {}), url: CONFIG.hunterCalendar, ok: false, checkedAt: now, error: `only ${parsed.length} entries parsed` };
} catch (e) { status.sources.hunterCalendar = { ...(status.sources.hunterCalendar || {}), url: CONFIG.hunterCalendar, ok: false, checkedAt: now, error: e.message }; log("hunter calendar:", e.message); }

if (reachable === 0) { await writeJson("status.json", status); console.error("Every source was unreachable."); await setOutput("changed", "false"); await setOutput("valid", "false"); process.exit(3); }

// 4. Parse (falling back to the previous data for any page that failed).
const cw = pageHtml.coursework ? parseCoursework(pageHtml.coursework, CONFIG.pages.coursework) : { windows: prev?.windows, labs: prev?.labs, final: prev?.final, rules: prev?.rules?.coursework };
const ps = pageHtml.homework ? parseHomework(pageHtml.homework, CONFIG.pages.homework) : { homework: prev?.homework, rules: prev?.rules?.homework };
const home = pageHtml.home ? parseHome(pageHtml.home, CONFIG.pages.home) : { weeks: prev?.weeks, lecture: prev?.lecture, labInfo: prev?.labInfo, finalNote: prev?.finalNote };
const syl = pageHtml.syllabus ? parseSyllabus(pageHtml.syllabus) : prev?.grading;
const labHours = { lab1: pageHtml.lab1 ? parseLabHours(pageHtml.lab1) : prev?.labHours?.lab1, lab0: pageHtml.lab0 ? parseLabHours(pageHtml.lab0) : prev?.labHours?.lab0, syllabus: syl?.labHours };

const course = {
  generatedAt: now,
  term: CONFIG.term,
  timeZone: CONFIG.timeZone,
  courseRepoSha: repoSha,
  lecture: home.lecture,
  labInfo: home.labInfo,
  finalNote: home.finalNote,
  weeks: home.weeks,
  homework: ps.homework,
  windows: cw.windows,
  labs: cw.labs,
  final: cw.final,
  grading: syl,
  labHours,
  holidays,
  rules: { coursework: cw.rules, homework: ps.rules }
};

// 5. Validate; on failure keep the previous data.
const problems = validate(course, prev);
status.validation = { ok: problems.length === 0, problems };
if (problems.length) {
  await writeJson("status.json", status);
  console.error("Validation failed — course.json NOT updated:\n - " + problems.join("\n - "));
  await setOutput("changed", "false"); await setOutput("valid", "false");
  process.exit(2);
}

// 6. Diff, write.
const changes = describeChanges(prev, course);
const strip = (c) => JSON.stringify({ ...c, generatedAt: null, courseRepoSha: null });
if (!changes.length && prev && strip(prev) !== strip(course)) changes.push("Minor content update (formatting or links) on the course pages.");
const prevChanges = await readJson("changes.json", []);
let changed = false;
if (changes.length) {
  changed = true;
  const entry = { detectedAt: now, courseCommit: repoSha, items: changes.slice(0, 60) };
  await writeJson("changes.json", [entry, ...prevChanges].slice(0, CONFIG.maxChangeEntries));
  await writeJson("course.json", course);
  log(`${changes.length} change(s):\n - ` + changes.slice(0, 30).join("\n - "));
} else {
  // keep generatedAt stable so the repo only changes when content changes
  log("no course changes");
}

// 7. Announcements from GitHub issues.
const repo = process.env.GITHUB_REPOSITORY;
if (repo) {
  try {
    const items = await fetchAnnouncements(repo);
    const prevAnn = await readJson("announcements.json", { items: [] });
    const manual = (prevAnn.items || []).filter((a) => a.source === "maintainer");
    const merged = { updatedAt: now, note: "Short summaries only. The full text of each announcement is on Brightspace (login); this site does not read Brightspace itself.", items: [...items.map((a) => ({ ...a, source: "issue" })), ...manual] };
    const same = JSON.stringify((prevAnn.items || []).map((a) => [a.id, a.title, a.text, a.date])) === JSON.stringify(merged.items.map((a) => [a.id, a.title, a.text, a.date]));
    if (!same) { await writeJson("announcements.json", merged); changed = true; log(`announcements: ${items.length} from issues`); }
    status.sources.announcements = { ok: true, checkedAt: now, count: merged.items.length };
  } catch (e) { status.sources.announcements = { ok: false, checkedAt: now, error: e.message }; log("announcements:", e.message); }
}

await writeJson("status.json", status);
await setOutput("changed", changed ? "true" : "false");
await setOutput("valid", "true");
log(changed ? "Course data updated." : "Nothing to publish.");
