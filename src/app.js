/*
  CSCI 127 Student Hub — page behaviour.

  Two inputs:
    window.CSCI127_DATA    editorial layer (src/data.js): links, rules, templates, prose
    window.CSCI127_COURSE  generated layer (dist/course.js, built from src/course.json,
                           changes.json, status.json, announcements.json by build.mjs)

  The home screen answers one question — what do I do next, and where — with
  one "Now" card, up to three "Next" lines and a seven-day strip. Everything
  else lives on its own screen, reached by a hash (#all, #announcements, …).
  All dates are computed from *today* in New York time, so the page rotates
  by itself.

  Checkmarks live in localStorage (this browser only). No network requests,
  no analytics, no personal data.
*/
(function () {
  "use strict";

  const DATA = window.CSCI127_DATA;
  const BUNDLE = window.CSCI127_COURSE || {};
  const COURSE = BUNDLE.course || null;
  if (!DATA) return;

  const TZ = DATA.meta.timeZone || "America/New_York";
  const DONE_KEY = "csci127hub.done.v1";
  const FILTER_KEYS = Object.keys(DATA.CATEGORIES);
  const RULES = DATA.RULES;
  const DAY = 86400000;
  const SCREENS = ["home", "all", "announcements", "toolbox", "grading", "lab", "software", "sources"];
  const LEGACY_SCREENS = { first: "home", checklist: "all", days: "lab", week: "home", missed: "all", updates: "sources", ai: "grading" };

  /* ---------- tiny helpers ---------- */

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value === null || value === undefined || value === false) continue;
        if (key === "class") node.className = value;
        else if (key === "text") node.textContent = value;
        else if (key === "dataset") Object.assign(node.dataset, value);
        else node.setAttribute(key, value === true ? "" : value);
      }
    }
    append(node, children);
    return node;
  }
  function append(node, children) {
    if (children === undefined || children === null || children === false) return node;
    if (Array.isArray(children)) { children.forEach((child) => append(node, child)); return node; }
    node.appendChild(typeof children === "string" ? document.createTextNode(children) : children);
    return node;
  }
  const storage = {
    get(key, fallback) { try { const raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; } },
    set(key, value) { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* storage blocked: page still works for this visit */ } },
    remove(key) { try { window.localStorage.removeItem(key); } catch (_) { /* ignore */ } }
  };
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  /* ---------- dates (always New York time) ---------- */

  const fmtDay = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
  const fmtLongDay = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric" });
  const fmtMonthDay = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" });
  const fmtTime = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  const fmtParts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric", weekday: "short" });
  const fmtFull = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "long", day: "numeric", year: "numeric" });
  const fmtStamp = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  function nyParts(date) {
    const parts = {};
    fmtParts.formatToParts(date).forEach((p) => { if (p.type !== "literal") parts[p.type] = p.value; });
    return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day), weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday) };
  }
  const pad = (n) => String(n).padStart(2, "0");
  function nyIso(date) { const p = nyParts(date); return `${p.y}-${pad(p.m)}-${pad(p.d)}`; }
  function dayNumber(iso) { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d) / DAY; }
  function addDays(iso, n) { const t = new Date(dayNumber(iso) * DAY + n * DAY); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; }
  function weekdayOf(iso) { return new Date(dayNumber(iso) * DAY).getUTCDay(); }
  function offsetFor(iso) {                 // EDT until the first Sunday of November, EST after; EDT from the second Sunday of March
    const [y, m, d] = iso.split("-").map(Number);
    const firstSundayNov = 1 + ((7 - new Date(Date.UTC(y, 10, 1)).getUTCDay()) % 7);
    const secondSundayMar = 8 + ((7 - new Date(Date.UTC(y, 2, 1)).getUTCDay()) % 7);
    const dst = (m > 3 && m < 11) || (m === 11 && d < firstSundayNov) || (m === 3 && d >= secondSundayMar);
    return dst ? "-04:00" : "-05:00";
  }
  function at(iso, hhmm) { return `${iso}T${hhmm}:00${offsetFor(iso)}`; }
  function dateOnly(iso) { return new Date(at(iso, "12:00")); }
  function dayText(d) { return fmtDay.format(d).replace(",", ""); }            // "Tue Sep 8"
  function fmtIsoDay(iso) { return iso ? dayText(dateOnly(iso)) : ""; }
  function fmtIsoLong(iso) { return iso ? fmtLongDay.format(dateOnly(iso)) : ""; }
  function timeLabel(hhmm) { const [h, m] = hhmm.split(":").map(Number); const suffix = h >= 12 ? "pm" : "am"; return `${((h + 11) % 12) + 1}${m ? ":" + pad(m) : ""} ${suffix}`; }
  function clock(d) { return fmtTime.format(d).replace(" AM", " am").replace(" PM", " pm"); }
  function shortClock(d) { return clock(d).replace(":00", ""); }

  function relWord(task) {
    if (task.offset === null || task.offset === undefined) return "";
    if (task.passed) return "passed";
    if (task.offset === 0) return "today";
    if (task.offset === 1) return "tomorrow";
    return `in ${task.offset} days`;
  }
  // "Due tomorrow, Tue Sep 8, 5:00 pm" — always the relative word and the absolute date.
  function whenText(task) {
    const rel = relWord(task);
    if (task.type === "standing" || !task.due) return task.dueLabel || "";
    const due = new Date(task.due);
    if (task.onBrightspace) return task.dueLabel;
    if (task.start) return `${cap(rel)}, ${dayText(new Date(task.start))}, ${clock(new Date(task.start))}–${clock(due)}`;
    if (task.type === "lab") return `Target ${dayText(due)} (${rel})`;
    if (task.type === "extra") return `Extra credit: ${task.dueLabel}`;
    const base = `Due ${rel === "passed" ? "" : rel + ", "}${dayText(due)}, ${clock(due)}`;
    return (task.windowStart ? `${base} · open since ${fmtIsoDay(task.windowStart)}` : base) + (rel === "passed" ? " (passed)" : "");
  }
  function whereText(task) { const p = DATA.PLACES[task.where]; return p ? p.label : ""; }

  /* ---------- links ---------- */

  function resolveLink(spec) {
    if (!spec) return null;
    const base = spec.key ? DATA.LINKS[spec.key] : null;
    if (spec.key && !base) return null;
    return { href: spec.href || base.href, label: spec.label || (base && base.label) || spec.href, notice: (base && base.notice) || spec.notice };
  }
  function linkEl(spec, className) {
    const link = resolveLink(spec);
    if (!link || !link.href) return null;
    const a = el("a", { href: link.href, class: className || null }, [link.label]);
    if (!link.href.startsWith("mailto:")) { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener noreferrer"); a.appendChild(el("span", { class: "sr-only", text: " (opens in a new tab)" })); }
    if (link.notice) a.appendChild(el("span", { class: "muted", text: " — " + link.notice }));
    return a;
  }
  function linkRow(specs, className) {
    const nodes = (specs || []).map((s) => linkEl(s)).filter(Boolean);
    return nodes.length ? el("p", { class: className || "links" }, nodes) : null;
  }
  function searchText() { return Array.from(arguments).flat(Infinity).filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, " "); }
  function linkLabels(specs) { return (specs || []).map((s) => { const l = resolveLink(s); return l ? l.label : ""; }); }
  function shortTopic(text, max) { const t = (text || "").split(/[:;.]/)[0].trim(); return t.length > (max || 60) ? t.slice(0, max || 60).replace(/\s+\S*$/, "") + "…" : t; }
  function categoryWord(category) { const c = DATA.CATEGORIES[category]; return c ? c.label : ""; }

  /* ---------- state ---------- */

  const state = { done: storage.get(DONE_KEY, {}), activeCategories: new Set(), query: "", now: new Date(), screen: "home" };
  if (typeof state.done !== "object" || state.done === null || Array.isArray(state.done)) state.done = {};
  const LEGACY_IDS = { hw1: "hw-1", hw2: "hw-2", hw3: "hw-3", hw4: "hw-4", hw5: "hw-5", quiz0: "quiz-0", quiz1: "quiz-1", quiz2: "quiz-2", cr1: "cr-1", cr2: "cr-2", lab1: "lab-1", lab2: "lab-2", lab3: "lab-3", lecture2: "lecture-2026-09-08", "ec-quiz2": "ec-2", "ec-cr2": "ec-2" };
  Object.entries(LEGACY_IDS).forEach(([oldId, newId]) => { if (state.done[oldId]) { state.done[newId] = true; delete state.done[oldId]; } });

  /* ---------- the model: tasks generated from course data ---------- */

  const model = { tasks: [], byId: {}, todayIso: null, currentWeek: null, nextWeek: null, lectureDates: [] };

  function courseNotes() { return COURSE ? COURSE.weeks.flatMap((w) => w.notes.map((n) => ({ ...n, week: w.n }))) : []; }
  function hunterClosures() { return (COURSE?.holidays || []).filter((h) => /college (is )?closed|no classes/i.test(h.text)); }
  function closuresOn(iso) {
    const out = [];
    courseNotes().forEach((n) => { if (n.date === iso) out.push({ date: iso, text: n.text, source: "course site", lab: n.labClosed, noClasses: n.noClasses, info: !(n.noClasses || n.labClosed) }); });
    hunterClosures().forEach((h) => { if (h.start <= iso && iso <= h.end) out.push({ date: iso, text: h.text, source: "Hunter calendar", noClasses: true, lab: null }); });
    (COURSE?.holidays || []).forEach((h) => { if (h.start <= iso && iso <= h.end && /monday schedule/i.test(h.text)) out.push({ date: iso, text: h.text, source: "Hunter calendar", info: true }); });
    return out;
  }
  function labSeason() {
    const notes = courseNotes();
    const open = (notes.find((n) => /lab opens/i.test(n.text)) || {}).date || (COURSE && COURSE.weeks.find((w) => w.n === 1) || {}).start || null;
    const close = (notes.find((n) => /lab closes/i.test(n.text)) || {}).date || (COURSE && COURSE.weeks[COURSE.weeks.length - 1] || {}).end || null;
    return { open, close };
  }
  function labHoursOn(iso) {
    const wd = weekdayOf(iso);
    const closed = closuresOn(iso).some((c) => !c.info && (c.lab || c.noClasses));
    const season = labSeason();
    const inSeason = (!season.open || iso >= season.open) && (!season.close || iso <= season.close);
    return wd >= 1 && wd <= 5 && !closed && inSeason ? RULES.labHours.byWeekday[wd] : null;
  }
  function noLectureOn(iso) {
    return courseNotes().some((n) => n.date === iso && (n.noClasses || /no lecture|monday schedule/i.test(n.text))) || hunterClosures().some((h) => h.start <= iso && iso <= h.end && /closed/i.test(h.text));
  }
  function lectureDateIn(week) {
    if (!week.start || !week.end) return null;
    for (let d = week.start; d <= week.end; d = addDays(d, 1)) if (weekdayOf(d) === RULES.lecture.weekday) return d;
    return null;
  }

  function buildTasks() {
    const tasks = [];
    const todayIso = model.todayIso;
    if (COURSE) {
      const dueClock = timeLabel(RULES.assessmentDeadline.time);
      COURSE.homework.forEach((h) => {
        if (!h.due) return;
        tasks.push({
          id: "hw-" + h.n, type: "homework", n: h.n, category: "required", where: "gradescope",
          title: `Submit Homework ${h.n}: ${h.title}`, due: h.due, summary: h.description,
          steps: DATA.TEMPLATES.homework({ ...h, dueLabel: clock(new Date(h.due)) }),
          links: [{ key: "gradescope", label: "Open Gradescope" }, { href: h.url, label: `Homework ${h.n} on the course site` }].concat(h.reading.map((r) => ({ href: r.href, label: r.label })))
        });
      });
      COURSE.windows.forEach((w) => {
        const calLink = { href: `${DATA.LINKS.calendar.href.replace(/#.*$/, "")}#Q${w.week}`, label: "The window on the calendar" };
        if (w.quiz && w.quiz.onBrightspace) {
          tasks.push({ id: "quiz-" + w.quiz.n, type: "quiz", onBrightspace: true, category: "required", where: "brightspace", title: `Take Quiz ${w.quiz.n} on Brightspace (syllabus quiz)`, due: at(w.end, "23:59"), dueLabel: `Listed through ${fmtIsoDay(w.end)} — check Brightspace`, summary: w.quiz.text, verify: "Availability is set inside Brightspace and is not visible on the public site.", links: [{ key: "brightspace", label: "Open Brightspace" }, { key: "syllabus", label: "Read the syllabus" }, calLink] });
        } else if (w.quiz && w.end) {
          tasks.push({ id: "quiz-" + w.quiz.n, type: "quiz", week: w.week, category: "required", where: "lab", title: `Take Quiz ${w.quiz.n}: ${shortTopic(w.quiz.text)}`, due: at(w.end, RULES.assessmentDeadline.time), windowStart: w.start, windowEnd: w.end, summary: w.quiz.text, steps: DATA.TEMPLATES.quiz(w), verify: RULES.assessmentDeadline.verify, links: [{ key: "navigate", label: "Book on Navigate" }].concat(w.quiz.links.map((l) => ({ href: l.href, label: "Study " + l.label })), [calLink, { key: "quizInfo" }]) });
        }
        if (w.codeReview && w.end) {
          tasks.push({ id: "cr-" + w.codeReview.n, type: "codeReview", week: w.week, category: "required", where: "lab", title: `Do Code Review ${w.codeReview.n}: ${shortTopic(w.codeReview.text, 70)}`, due: at(w.end, RULES.assessmentDeadline.time), windowStart: w.start, windowEnd: w.end, summary: `${w.codeReview.text}. Re-create one of the listed programs in IDLE on a lab computer and explain it to a TA.`, steps: DATA.TEMPLATES.codeReview(w), verify: RULES.assessmentDeadline.verify, links: [{ key: "navigate", label: "Book on Navigate" }, { key: "codeReviewInfo" }, calLink].concat(w.codeReview.links.map((l) => ({ href: l.href, label: "Read " + l.label }))) });
        }
        const tiers = [["15%", w.early15], ["10%", w.early10], ["5%", w.early5]].filter((t) => t[1]);
        if (tiers.length && w.quiz && !w.quiz.onBrightspace) {
          const last = tiers[tiers.length - 1][1];
          tasks.push({ id: "ec-" + w.week, type: "extra", week: w.week, category: "extra", where: "lab", title: `Finish Quiz ${w.quiz.n}${w.codeReview ? " and Code Review " + w.codeReview.n : ""} early`, due: at(last, RULES.assessmentDeadline.time), tiers, dueLabel: tiers.map(([p, d]) => `${p} by ${fmtIsoDay(d)}`).join(" · "), summary: "Up to 15% extra credit on that week's quiz and code review for finishing before the end date.", steps: DATA.TEMPLATES.extra(w), links: [{ key: "navigate", label: "Book on Navigate" }, calLink] });
        }
      });
      COURSE.labs.forEach((l) => {
        if (!l.target) return;
        tasks.push({ id: "lab-" + l.n, type: "lab", n: l.n, category: "recommended", where: "home", title: `Work through ${l.title}`, due: at(l.target, "23:59"), summary: l.objective ? "Learning objective: " + l.objective : "", steps: DATA.TEMPLATES.lab(l), links: [{ href: l.url, label: `Open Lab ${l.n}` }] });
      });
      COURSE.weeks.forEach((w) => {
        if (w.n < 1) return;
        const d = lectureDateIn(w);
        if (!d || noLectureOn(d)) return;
        model.lectureDates.push(d);
        tasks.push({ id: "lecture-" + d, type: "lecture", week: w.n, category: "required", where: "lecture", title: `Lecture ${w.n}: ${shortTopic(w.topics, 70)}`, start: at(d, RULES.lecture.start), due: at(d, RULES.lecture.end), summary: w.topics, steps: DATA.TEMPLATES.lecture(), links: [{ key: "site", label: "This week on the course site" }].concat(w.handouts.slice(0, 4).map((h) => ({ href: h.href, label: h.label }))) });
      });
      if (COURSE.final && COURSE.final.date) {
        const f = COURSE.final;
        const tm = (f.time || "9-11am").match(/(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*([ap]m)/i);
        const toHH = (h, m, ap) => { let hh = Number(h) % 12; if (ap.toLowerCase() === "pm") hh += 12; return `${pad(hh)}:${m || "00"}`; };
        const startH = tm ? toHH(tm[1], tm[2], tm[5]) : "09:00"; const endH = tm ? toHH(tm[3], tm[4], tm[5]) : "11:00";
        tasks.push({ id: "final", type: "final", category: "required", where: "lecture", title: "Final exam", start: at(f.date, startH), due: at(f.date, endH), summary: f.passRule || "", steps: DATA.TEMPLATES.final(), verify: DATA.GRADING_EXTRA.finalVerify, links: [{ key: "finalInfo" }] });
        if (f.mock) tasks.push({ id: "mock-final", type: "lecture", category: "recommended", where: "lecture", title: "Mock final exam (at the last lecture)", start: at(f.mock, RULES.lecture.start), due: at(f.mock, RULES.lecture.end), summary: "Practice under exam conditions; the key is released the same afternoon.", links: [{ key: "finalInfo" }] });
      }
    }
    DATA.STANDING.forEach((s) => {
      if (s.window && s.window.end && todayIso > s.window.end) return;
      if (s.window && s.window.start && todayIso < s.window.start) return;
      tasks.push({ ...s, type: "standing" });
    });
    tasks.forEach((t) => { t.dueMs = t.due ? Date.parse(t.due) : null; t.dueIso = t.due ? nyIso(new Date(t.due)) : null; t.offset = t.dueIso ? dayNumber(t.dueIso) - dayNumber(todayIso) : null; t.passed = t.dueMs !== null && t.dueMs < state.now.getTime(); });
    tasks.sort((a, b) => { if (a.dueMs === null && b.dueMs === null) return 0; if (a.dueMs === null) return 1; if (b.dueMs === null) return -1; return a.dueMs - b.dueMs || FILTER_KEYS.indexOf(a.category) - FILTER_KEYS.indexOf(b.category); });
    return tasks;
  }

  function buildModel() {
    model.todayIso = nyIso(state.now);
    model.lectureDates = [];
    model.tasks = buildTasks();
    model.byId = {};
    model.tasks.forEach((t) => { model.byId[t.id] = t; });
    if (COURSE) {
      const weeks = COURSE.weeks.filter((w) => w.start && w.end);
      model.currentWeek = weeks.find((w) => w.start <= model.todayIso && model.todayIso <= w.end) || weeks.find((w) => w.start > model.todayIso) || null;
      model.nextWeek = model.currentWeek ? weeks.find((w) => w.start > model.currentWeek.end) || null : null;
    }
    // Calendar week: Monday to Sunday around today.
    const wd = weekdayOf(model.todayIso);
    model.weekStart = addDays(model.todayIso, wd === 0 ? -6 : 1 - wd);
    model.weekEnd = addDays(model.weekStart, 6);
    const lastDay = COURSE ? [COURSE.final && COURSE.final.date, ...(COURSE.weeks || []).map((w) => w.end)].filter(Boolean).sort().pop() : null;
    model.semesterOver = Boolean(lastDay && model.todayIso > lastDay);
    model.upcoming = model.tasks.filter((t) => t.type !== "standing" && t.offset !== null && t.offset >= 0 && !t.passed);
    const undone = model.upcoming.filter((t) => !state.done[t.id]);
    model.now = undone.find((t) => t.category === "required") || undone[0] || null;
    model.next = undone.filter((t) => t !== model.now).slice(0, 3);
    const shown = new Set([model.now, ...model.next].filter(Boolean).map((t) => t.id));
    model.thisWeek = model.upcoming.filter((t) => t.dueIso <= model.weekEnd);
    model.restOfWeek = model.thisWeek.filter((t) => !shown.has(t.id));
    const labVisitSoon = model.upcoming.some((t) => t.where === "lab" && (t.type === "quiz" || t.type === "codeReview") && t.offset <= RULES.focusDays);
    model.ongoing = model.tasks.filter((t) => t.type === "standing" && t.urgent && (t.urgentWhen !== "labVisit" || labVisitSoon));
    model.missed = model.tasks.filter((t) => t.offset !== null && t.offset < 0 && t.offset >= -RULES.missedDays && !state.done[t.id] && t.type !== "extra");
  }

  /* ---------- rendering: one task ---------- */

  function checkbox(taskId, suffix) {
    const input = el("input", { type: "checkbox", class: "check", id: "task-" + taskId + "-" + suffix, dataset: { taskCheck: taskId } });
    input.checked = Boolean(state.done[taskId]);
    return input;
  }
  // mode "card": the Now card (big title, primary button visible). mode "row": one calm row.
  function taskItem(task, suffix, mode) {
    const inputId = "task-" + task.id + "-" + suffix;
    const when = whenText(task);
    const meta = [whereText(task), categoryWord(task.category)].filter(Boolean).join(" · ");
    const primary = task.links && task.links.length ? linkEl(task.links[0], "button") : null;
    const rest = task.links && task.links.length > 1 ? linkRow(task.links.slice(1), "links") : null;
    const moreBits = [
      task.summary ? el("p", { text: task.summary }) : null,
      task.steps && task.steps.length ? el("ol", { class: "steps" }, task.steps.map((s) => el("li", { text: s }))) : null,
      task.verify ? el("p", { class: "small muted", text: "Verify: " + task.verify }) : null,
      mode === "card" ? rest : (primary ? el("p", null, [primary]) : null),
      mode === "card" ? null : rest
    ].filter(Boolean);
    const soon = mode === "card" && !task.passed && task.offset !== null && task.offset <= 1 && task.type !== "standing";
    const body = el("div", { class: "task-main" }, [
      el("label", { class: "task-title", for: inputId, text: task.title }),
      when ? el("p", { class: "task-when" }, soon ? [el("span", { class: "urgent", text: when })] : [when]) : null,
      meta ? el("p", { class: "task-where", text: meta }) : null,
      mode === "card" && primary ? primary : null,
      moreBits.length ? el("details", { class: "more task-more" }, [el("summary", { text: "More about this" }), el("div", null, moreBits)]) : null
    ]);
    return el("li", { class: "task" + (state.done[task.id] ? " done" : ""), dataset: { item: "", category: task.category, task: task.id, search: searchText(task.title, task.summary, task.steps, when, meta, task.type, linkLabels(task.links), task.verify ? "verify" : "") } }, [checkbox(task.id, suffix), body]);
  }

  /* ---------- rendering: home ---------- */

  function renderNow() {
    const root = $("#now"); root.textContent = "";
    if (!COURSE) { root.appendChild(el("p", { class: "now-empty", text: "Course data has not been generated yet." })); return; }
    if (model.semesterOver) { root.appendChild(el("p", { class: "now-empty", text: `The ${COURSE.term} course calendar has ended. Nothing new is due.` })); return; }
    if (!model.now) { root.appendChild(el("p", { class: "now-empty", text: "Nothing is left on the list. Open the course site if you want to work ahead." })); return; }
    root.appendChild(el("div", { class: "now-card" }, [el("ul", { class: "task-rows" }, [taskItem(model.now, "now", "card")])]));
  }

  function renderNext() {
    const list = $("#next"); list.textContent = "";
    if (!model.next.length) list.appendChild(el("li", { class: "muted", text: model.now ? "Nothing else is close." : "" }));
    model.next.forEach((t) => list.appendChild(taskItem(t, "next", "row")));
    const rest = $("#rest"); rest.textContent = "";
    const details = $("#rest-of-week");
    const later = model.restOfWeek.filter((t) => !state.done[t.id]);
    const done = model.thisWeek.filter((t) => state.done[t.id]);
    if (later.length) { rest.appendChild(el("p", { class: "group-title", text: `Also this week (through ${fmtIsoDay(model.weekEnd)})` })); rest.appendChild(el("ol", { class: "task-rows" }, later.map((t) => taskItem(t, "rest", "row")))); }
    if (model.ongoing.length) { rest.appendChild(el("p", { class: "group-title", text: "Ongoing" })); rest.appendChild(el("ol", { class: "task-rows" }, model.ongoing.map((t) => taskItem(t, "rest", "row")))); }
    if (done.length) { rest.appendChild(el("p", { class: "group-title", text: "Done this week" })); rest.appendChild(el("ol", { class: "task-rows" }, done.map((t) => taskItem(t, "rest", "row")))); }
    rest.appendChild(el("p", { class: "small" }, [el("a", { href: "#all", text: "Everything due this semester, with search" })]));
    details.hidden = false;
    $("summary", details).textContent = later.length ? `Show the rest of this week (${later.length} more)` : "Show ongoing reminders and what is done";
  }

  function weekLines(iso) {
    const lines = [];
    const wd = weekdayOf(iso); const isToday = iso === model.todayIso;
    const closures = closuresOn(iso).filter((c) => !c.info && (wd >= 1 && wd <= 5 || c.source === "course site"));
    if (closures.length) lines.push({ text: closures.some((c) => /college/i.test(c.text)) ? "College closed" : "No classes" });
    const dueToday = model.tasks.filter((t) => t.dueIso === iso && t.type !== "standing" && t.type !== "extra");
    dueToday.forEach((t) => {
      if (t.type === "lecture") lines.push({ text: `Lecture ${timeLabel(RULES.lecture.start)}` });
      else if (t.type === "homework") lines.push({ text: `HW ${t.n} due ${shortClock(new Date(t.due))}`, strong: true });
      else if (t.type === "quiz") lines.push({ text: `Quiz ${t.id.replace("quiz-", "")} ends`, strong: true });
      else if (t.type === "codeReview") lines.push({ text: `Code review ${t.id.replace("cr-", "")} ends`, strong: true });
      else if (t.type === "lab") lines.push({ text: `Lab ${t.n} target` });
      else if (t.type === "final") lines.push({ text: "Final exam", strong: true });
    });
    if (!lines.length && labHoursOn(iso)) lines.push({ text: "Lab open" });
    return lines.map((l) => ({ ...l, urgent: Boolean(l.strong && isToday) }));
  }

  function renderWeekStrip() {
    const root = $("#week-strip"); root.textContent = "";
    for (let i = 0; i < 7; i++) {
      const iso = addDays(model.weekStart, i);
      const lines = weekLines(iso);
      const isToday = iso === model.todayIso;
      const li = el("li", { class: "week-day" + (isToday ? " today" : iso < model.todayIso ? " past" : ""), "aria-current": isToday ? "date" : null }, [
        el("p", null, [el("span", { class: "day-name", text: fmtIsoDay(iso).split(" ")[0] }), " ", el("span", { class: "day-num", text: String(Number(iso.slice(8, 10))) })]),
        el("ul", null, lines.slice(0, 2).map((l) => el("li", { class: l.urgent ? "urgent" : l.strong ? "strong" : null, text: l.text })).concat(lines.length > 2 ? [el("li", { class: "muted", text: `+${lines.length - 2} more` })] : []))
      ]);
      root.appendChild(li);
    }
  }

  function renderWeekPlan() {
    const root = $("#week-plan"); root.textContent = "";
    const w = model.currentWeek;
    if (!COURSE || !w) { root.appendChild(el("p", { class: "muted", text: "No weekly plan is available for today's date." })); return; }
    const isCurrent = w.start <= model.todayIso && model.todayIso <= w.end;
    $("#week-plan-summary").textContent = `${isCurrent ? "This week's" : "Next week's"} topics and reading (Week ${w.n})`;
    const topics = (w.topics || "").split(/;\s*/).filter(Boolean);
    root.appendChild(el("p", { class: "sub-title", text: "Lecture topics" }));
    root.appendChild(el("ul", null, topics.map((t) => el("li", { text: t }))));
    const group = (title, items) => { if (!items || !items.length) return; root.appendChild(el("p", { class: "sub-title", text: title })); root.appendChild(linkRow(items.map((r) => ({ href: r.href, label: r.label })), "links")); };
    group("Reading", w.reading); group("Coursework this week", w.coursework); group("Lecture examples and handouts", w.handouts);
    if (w.notes && w.notes.length) { root.appendChild(el("p", { class: "sub-title", text: "Notes" })); root.appendChild(el("ul", null, w.notes.map((n) => el("li", null, [el("strong", { text: (n.date ? fmtIsoDay(n.date) : n.dateText) + ": " }), n.text])))); }
    const nw = model.nextWeek;
    if (nw) root.appendChild(el("p", { class: "small muted" }, [el("strong", { text: `Next: Week ${nw.n} (${fmtIsoDay(nw.start)} – ${fmtIsoDay(nw.end)}): ` }), shortTopic(nw.topics, 120)]));
  }

  /* ---------- rendering: all deadlines ---------- */

  function renderChecklist() {
    const list = $("#task-list"); list.textContent = "";
    const weekEnd = model.weekEnd;
    const nextEnd = addDays(weekEnd, 7);
    const upcoming = model.tasks.filter((t) => t.type !== "standing" && t.offset !== null && t.offset >= 0);
    const groups = [
      { label: "Today", test: (t) => t.offset === 0 },
      { label: "Tomorrow", test: (t) => t.offset === 1 },
      { label: `Rest of this week (through ${fmtIsoDay(weekEnd)})`, test: (t) => t.offset > 1 && t.dueIso <= weekEnd },
      { label: `Next week (through ${fmtIsoDay(nextEnd)})`, test: (t) => t.dueIso > weekEnd && t.dueIso <= nextEnd },
      { label: "The two weeks after that", test: (t) => t.dueIso > nextEnd && t.dueIso <= addDays(nextEnd, 14) }
    ];
    const placed = new Set();
    groups.forEach((group) => {
      const tasks = upcoming.filter((t) => !placed.has(t.id) && group.test(t));
      if (!tasks.length) return;
      tasks.forEach((t) => placed.add(t.id));
      list.appendChild(el("li", { dataset: { group: "" } }, [el("h3", { class: "group-title", text: group.label }), el("ol", { class: "task-list" }, tasks.map((t) => taskItem(t, "full", "row")))]));
    });
    const rest = upcoming.filter((t) => !placed.has(t.id));
    if (rest.length) list.appendChild(el("li", { dataset: { group: "" } }, [el("details", { class: "more" }, [el("summary", { text: `Everything later this semester (${rest.length} items)` }), el("ol", { class: "task-list" }, rest.map((t) => taskItem(t, "full", "row")))])]));
    const standing = model.tasks.filter((t) => t.type === "standing");
    if (standing.length) list.appendChild(el("li", { dataset: { group: "" } }, [el("h3", { class: "group-title", text: "Ongoing" }), el("ol", { class: "task-list" }, standing.map((t) => taskItem(t, "full", "row")))]));
    $("#checklist-count").textContent = `${upcoming.length} dated items ahead, generated from the course pages. Check things off as you go; this browser remembers.`;
  }

  function renderMissed() {
    const list = $("#missed-list"); list.textContent = "";
    model.missed.forEach((t) => {
      const q = t.type === "lecture" ? `Were you at ${t.title}?` : t.type === "lab" ? `Did you finish ${t.title.replace(/^Work through /, "")}?` : `Did you ${t.title.charAt(0).toLowerCase() + t.title.slice(1)}?`;
      const note = t.type === "lecture" ? "Lecture slips have no make-ups, but only your top 10 count." : t.type === "homework" ? "No late homework, but the highest 50 of 60 count. Check Gradescope for what was received." : t.type === "quiz" || t.type === "codeReview" ? "No make-ups; the top 10 count. Check Gradescope for your score." : t.type === "lab" ? "Labs are not graded, but the quiz is built from them. Still worth doing." : "";
      list.appendChild(el("li", { class: "task", dataset: { item: "", category: t.category, task: t.id, search: searchText("missed", q, note, t.title) } }, [checkbox(t.id, "missed"), el("div", { class: "task-main" }, [el("label", { class: "task-title", for: "task-" + t.id + "-missed", text: q }), el("p", { class: "task-when", text: whenText(t) }), note ? el("p", { class: "task-where", text: note }) : null, linkRow(t.links.slice(0, 2), "links small")])]));
    });
    DATA.MISSED_CHECKS.forEach((m) => {
      if (m.until && model.todayIso > m.until) return;
      list.appendChild(el("li", { class: "task", dataset: { item: "", category: m.category, search: searchText("missed", m.title, m.check, linkLabels(m.links)) } }, [el("span", null), el("div", { class: "task-main" }, [el("p", { class: "task-title", text: m.title }), el("p", { class: "task-where", text: m.check }), linkRow(m.links, "links small")])]));
    });
    $("#missed-intro").textContent = model.missed.length ? `${model.missed.length} dated item${model.missed.length === 1 ? "" : "s"} from the last ${RULES.missedDays} days ${model.missed.length === 1 ? "is" : "are"} not checked off. This page cannot see your account: each line is something to check, not something you missed.` : `Nothing from the last ${RULES.missedDays} days is unchecked. This page cannot see your account, so Gradescope is the real record.`;
  }

  /* ---------- rendering: other screens ---------- */

  function renderAnnouncements() {
    const list = $("#announcement-list"); list.textContent = "";
    const ann = BUNDLE.announcements || { items: [] };
    const items = (ann.items || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    if (!items.length) list.appendChild(el("li", { class: "muted", text: "No announcements have been added yet." }));
    items.forEach((a) => {
      const summary = String(a.text || "").replace(/\s+/g, " ").trim();
      const origin = a.auto ? "Summary posted automatically from a Brightspace notification e-mail" : a.source === "issue" ? "Summary added by a classmate through GitHub" : "Summary added by the site maintainer" + (a.checkedAt ? ` (checked ${fmtIsoDay(a.checkedAt)})` : "");
      const direct = /\/news\/\d+\/\d+\//.test(a.link || "");
      list.appendChild(el("li", { class: "announcement" }, [
        el("h3", { text: a.title }),
        el("p", { class: "small muted", text: a.date ? fmtIsoLong(a.date) : "" }),
        summary ? el("p", { class: "announcement-summary", text: summary }) : null,
        el("p", null, [linkEl({ href: a.link || DATA.LINKS.brightspace.href, label: direct ? "Read the full announcement on Brightspace (login)" : "Open Announcements on Brightspace (login)" }, "button")]),
        el("p", { class: "small muted" }, [origin, a.url ? [" · ", linkEl({ href: a.url, label: "View or fix on GitHub" })] : null])
      ]));
    });
    $("#announcement-updated").textContent = ann.updatedAt ? `List last rebuilt ${fmtStamp.format(new Date(ann.updatedAt))} ET.` : "";
  }

  function renderToolbox() {
    const list = $("#toolbox-grid"); list.textContent = "";
    DATA.TOOLBOX.forEach((tool) => list.appendChild(el("li", null, [el("h3", { text: tool.name }), el("p", null, [el("strong", { text: "Use it for: " }), tool.use]), el("p", { class: "muted" }, [el("strong", { text: "When: " }), tool.when]), linkRow(tool.links, "links")])));
  }

  function renderGrading() {
    const list = $("#grading-weights"); list.textContent = "";
    const weights = (COURSE && COURSE.grading && COURSE.grading.weights && COURSE.grading.weights.length) ? COURSE.grading.weights : Object.keys(DATA.GRADING_NOTES).map((label) => ({ label, percent: null }));
    weights.forEach((w) => list.appendChild(el("li", null, [el("p", { class: "weight-row" }, [el("span", { text: w.label }), el("span", { text: w.percent !== null ? w.percent + "%" : "?" })]), el("p", { class: "muted small", text: DATA.GRADING_NOTES[w.label] || "" })])));
    const g = COURSE && COURSE.grading ? COURSE.grading : {};
    $("#grading-final-rule").textContent = g.finalRule || (COURSE && COURSE.final && COURSE.final.passRule) || "You must take and pass the final to pass the course (see the syllabus).";
    $("#grading-extra").textContent = (COURSE && COURSE.rules && COURSE.rules.coursework && COURSE.rules.coursework.extraCredit) || "Up to 15% extra credit for finishing quizzes and code reviews early.";
    const dl = $("#grading-final"); dl.textContent = "";
    const f = (COURSE && COURSE.final) || {};
    const facts = [["When", f.text ? f.text.replace(/(\d)-(\d)/, "$1–$2") : "See the coursework page"], ["Where", "118 HN (Assembly Hall)"], ["Format", DATA.GRADING_EXTRA.format], ["Preparation", DATA.GRADING_EXTRA.prep + (f.mock ? ` Mock final: ${fmtIsoLong(f.mock)}.` : "")], ["Verify", DATA.GRADING_EXTRA.finalVerify]];
    facts.forEach(([k, v]) => { dl.appendChild(el("dt", { text: k })); dl.appendChild(el("dd", { text: v })); });
    const src = $("#grading-source"); src.textContent = "Source: "; src.appendChild(linkEl(DATA.GRADING_EXTRA.source));
    const ai = DATA.AI_POLICY;
    const allowed = $("#ai-allowed"); allowed.textContent = ""; ai.allowed.forEach((t) => allowed.appendChild(el("li", { text: t })));
    const not = $("#ai-not-allowed"); not.textContent = ""; ai.notAllowed.forEach((t) => not.appendChild(el("li", { text: t })));
    $("#ai-consequences").textContent = ai.consequences;
    const aiSrc = $("#ai-source"); aiSrc.textContent = "Source: "; aiSrc.appendChild(linkEl(ai.source));
  }

  function renderCampus() {
    const root = $("#campus-timeline"); root.textContent = "";
    const bring = $("#campus-bring"); bring.textContent = "";
    DATA.CAMPUS_DAY.bring.forEach((b) => bring.appendChild(el("li", null, [el("strong", { text: b.item }), el("span", { class: "muted", text: " — " + b.why })])));
    const next = model.tasks.find((t) => t.type === "lecture" && t.offset !== null && t.offset >= 0 && !t.passed);
    const heading = $("#campus-heading");
    if (!next) { heading.textContent = "No lecture day is coming up in the course calendar."; return; }
    const iso = next.dueIso; const wd = weekdayOf(iso);
    heading.textContent = `Next campus day: ${fmtIsoLong(iso)}` + (next.offset === 0 ? " (today)" : next.offset === 1 ? " (tomorrow)" : "");
    const windowsEnding = model.tasks.filter((t) => (t.type === "quiz" || t.type === "codeReview") && t.where === "lab" && t.dueIso === iso);
    const windowsOpen = model.tasks.filter((t) => (t.type === "quiz" || t.type === "codeReview") && t.where === "lab" && t.windowStart && t.windowStart <= iso && iso <= t.windowEnd && t.dueIso !== iso);
    const hwDue = model.tasks.filter((t) => t.type === "homework" && t.dueIso === iso);
    const labHours = RULES.labHours.byWeekday[wd];
    const entries = [];
    if (RULES.preLecture) entries.push({ time: RULES.preLecture.time, title: RULES.preLecture.label, detail: RULES.preLecture.text, verify: RULES.preLecture.verify, links: [{ key: RULES.preLecture.source, label: "Source announcement" }] });
    entries.push({ time: `${timeLabel(RULES.lecture.start)}–${timeLabel(RULES.lecture.end)}`, title: next.title, detail: DATA.PLACES.lecture.label + ". " + (next.summary || ""), taskId: next.id });
    if (labHours) {
      const items = windowsEnding.concat(windowsOpen);
      entries.push({ time: `From ${labHours.split("–")[0].trim()}`, title: items.length ? "Lab visit, 1001E HN" : `Lab open, 1001E HN (${labHours})`, detail: items.length ? `${windowsEnding.length ? "Last day for: " + windowsEnding.map((t) => t.title.replace(/^(Take|Do) /, "")).join("; ") + ". " : ""}${windowsOpen.length ? "Also open: " + windowsOpen.map((t) => t.title.replace(/^(Take|Do) /, "")).join("; ") + ". " : ""}Assessments by ${RULES.assessmentDeadline.label}.` : "No quiz or code review window ends today; the lab is open for tutoring and early completions.", verify: items.length ? RULES.assessmentDeadline.verify : null, links: [{ key: "navigate", label: "Book on Navigate" }] });
    }
    hwDue.forEach((t) => entries.push({ time: clock(new Date(t.due)), title: t.title.replace(/^Submit /, "") + " due on Gradescope", detail: "No late homework. Submit before you head to campus if you can.", taskId: t.id, links: [{ key: "gradescope", label: "Open Gradescope" }] }));
    entries.forEach((entry) => {
      const task = entry.taskId ? model.byId[entry.taskId] : null;
      root.appendChild(el("li", { dataset: task ? { task: task.id } : {}, class: task && state.done[task.id] ? "done" : null }, [
        el("p", { class: "time", text: entry.time }),
        el("div", null, [
          task ? el("p", null, [checkbox(task.id, "campus"), " ", el("label", { for: "task-" + task.id + "-campus", class: "task-title", text: entry.title })]) : el("p", { class: "task-title", text: entry.title }),
          entry.detail ? el("p", { class: "muted", text: entry.detail }) : null,
          entry.verify ? el("p", { class: "small muted", text: "Verify: " + entry.verify }) : null,
          linkRow(entry.links, "links")
        ])
      ]));
    });
  }

  function renderLab() {
    const lab = DATA.LAB; const where = $("#lab-where"); where.textContent = "";
    where.appendChild(el("p", null, [el("strong", { text: lab.room }), ", " + lab.where + "."]));
    where.appendChild(el("p", { text: "Open " + RULES.labHours.text + "." }));
    where.appendChild(el("p", { class: "small muted", text: RULES.labHours.note }));
    const services = $("#lab-services"); services.textContent = "";
    lab.services.forEach((s) => services.appendChild(el("li", { text: s })));
    const closures = $("#lab-closures"); closures.textContent = "";
    const horizon = addDays(model.todayIso, 75);
    const seen = new Set(); const entries = [];
    courseNotes().forEach((n) => { if (n.date && n.date >= model.todayIso && n.date <= horizon && (n.labClosed || n.noClasses || /lab (opens|closes)/i.test(n.text))) { entries.push({ start: n.date, end: n.date, text: n.text, source: "course site" }); seen.add(n.date); } });
    hunterClosures().forEach((h) => { if (h.end >= model.todayIso && h.start <= horizon && !seen.has(h.start)) entries.push({ start: h.start, end: h.end, text: h.text, source: "Hunter calendar" }); });
    entries.sort((a, b) => a.start.localeCompare(b.start));
    if (!entries.length) closures.appendChild(el("li", { text: "No closures listed in the next few weeks." }));
    entries.forEach((c) => closures.appendChild(el("li", null, [el("strong", { text: (c.start === c.end ? fmtIsoDay(c.start) : fmtIsoDay(c.start) + " – " + fmtIsoDay(c.end)) + ": " }), c.text, el("span", { class: "muted", text: " (" + c.source + ")" })])));
    const links = $("#lab-links"); links.textContent = ""; links.className = "links small"; lab.links.forEach((l) => links.appendChild(linkEl(l)));
  }

  function renderSoftware() {
    const root = $("#software-phases"); root.textContent = "";
    DATA.SOFTWARE.forEach((phase, index) => {
      const section = el("section", { class: "phase", "aria-labelledby": "phase-" + index });
      section.appendChild(el("h2", { class: "block-title", id: "phase-" + index, text: phase.phase }));
      section.appendChild(el("ul", { class: "plain-list" }, phase.items.map((item) => el("li", null, [el("h3", null, [item.name, el("span", { class: "muted", text: " · " + categoryWord(item.category) })]), el("p", { text: item.why }), linkRow(item.links, "links")]))));
      root.appendChild(section);
    });
  }

  function renderSources() {
    const list = $("#source-list"); list.textContent = "";
    DATA.SOURCES.forEach((s) => list.appendChild(el("li", null, [el("p", null, [linkEl({ key: s.key })]), el("p", { class: "muted small", text: s.note })])));
    const status = BUNDLE.status || {}; const changes = BUNDLE.changes || [];
    const srcList = $("#status-sources"); srcList.textContent = "";
    const names = { home: "Course home page (weekly plan)", coursework: "Coursework page (calendar, labs, final)", homework: "Homework list", syllabus: "Syllabus", resources: "Resources", faq: "FAQ", lab0: "Lab 0", lab1: "Lab 1", hunterCalendar: "Hunter academic calendar", announcements: "Announcements (GitHub issues)" };
    Object.entries(status.sources || {}).forEach(([key, s]) => {
      srcList.appendChild(el("li", { class: "small" }, [el("strong", { text: names[key] || key }), s.ok ? ` — checked ${s.checkedAt ? fmtStamp.format(new Date(s.checkedAt)) : "?"}` + (s.changedAt ? `, last changed ${fmtMonthDay.format(new Date(s.changedAt))}` : "") : el("span", { class: "urgent", text: ` — could not be read on the last run${s.checkedAt ? " (" + fmtStamp.format(new Date(s.checkedAt)) + ")" : ""}; showing the previous copy.` })]));
    });
    if (status.courseRepo && status.courseRepo.sha) srcList.appendChild(el("li", { class: "small" }, [el("strong", { text: "Course website source" }), ` — last commit ${status.courseRepo.committedAt ? fmtStamp.format(new Date(status.courseRepo.committedAt)) : "?"} ET (${status.courseRepo.sha.slice(0, 7)}) · `, linkEl({ href: status.courseRepo.url, label: "commit history" })]));
    if (status.validation && status.validation.ok === false) srcList.appendChild(el("li", { class: "small urgent", text: "The last check failed validation, so the previous data is still shown: " + (status.validation.problems || []).join("; ") }));
    const changeList = $("#change-list"); changeList.textContent = "";
    if (!changes.length) changeList.appendChild(el("li", { class: "muted small", text: "No changes recorded yet." }));
    changes.slice(0, 5).forEach((entry) => {
      const items = entry.items || [];
      changeList.appendChild(el("li", { class: "small" }, [el("p", { class: "muted", text: `${fmtStamp.format(new Date(entry.detectedAt))} ET` }), el("ul", { class: "bulleted" }, items.slice(0, 6).map((i) => el("li", { text: i })).concat(items.length > 6 ? [el("li", { class: "muted", text: `+${items.length - 6} more` })] : []))]));
    });
    $("#updates-intro").textContent = status.lastRunAt ? `A background job re-reads the official course pages several times a day and publishes any change here. Last run: ${fmtStamp.format(new Date(status.lastRunAt))} ET.` : "The background update job has not run yet.";
  }

  function renderFilters() {
    const row = $("#filter-row"); row.textContent = "";
    row.appendChild(el("button", { type: "button", "aria-pressed": "true", dataset: { filter: "all" }, text: "All" }));
    FILTER_KEYS.forEach((key) => row.appendChild(el("button", { type: "button", "aria-pressed": "false", dataset: { filter: key }, text: DATA.CATEGORIES[key].label })));
  }

  function renderAll() {
    buildModel();
    renderNow(); renderNext(); renderWeekStrip(); renderWeekPlan();
    renderChecklist(); renderMissed(); renderAnnouncements(); renderToolbox(); renderGrading(); renderCampus(); renderLab(); renderSoftware(); renderSources();
    updateProgress(); applyFilters();
  }

  /* ---------- progress & checkmarks ---------- */

  function updateProgress() {
    const set = model.thisWeek || []; const done = set.filter((t) => state.done[t.id]).length;
    $("#progress-label").textContent = set.length ? `${done} of ${set.length} done this week${done === set.length ? ". All set." : "."}` : "";
  }
  function setDone(taskId, isDone, announce) {
    if (isDone) state.done[taskId] = true; else delete state.done[taskId];
    storage.set(DONE_KEY, state.done);
    $$('[data-task-check="' + taskId + '"]').forEach((input) => { input.checked = isDone; });
    $$('[data-task="' + taskId + '"]').forEach((node) => node.classList.toggle("done", isDone));
    // Nothing moves while you look at it: Now / Next are recomputed the next time the home screen is opened.
    state.dirty = true; updateProgress();
    if (announce) say((isDone ? "Done: " : "Not done: ") + ((model.byId[taskId] && model.byId[taskId].title) || taskId) + ".");
  }
  function resetProgress() {
    state.done = {}; storage.remove(DONE_KEY);
    renderAll(); say("Everything is unchecked.");
  }
  function say(message) { const node = $("#announcer"); node.textContent = ""; window.setTimeout(() => { node.textContent = message; }, 30); }

  /* ---------- screens (hash routing) ---------- */

  function screenFromHash() {
    const raw = window.location.hash.replace(/^#/, "");
    if (!raw) return "home";
    if (SCREENS.includes(raw)) return raw;
    if (LEGACY_SCREENS[raw]) return LEGACY_SCREENS[raw];
    return "home";
  }
  function showScreen(name, focusTitle) {
    state.screen = name;
    if (name === "home" && state.dirty) { state.dirty = false; renderAll(); }
    $$("[data-screen]").forEach((s) => { s.hidden = s.id !== name; });
    document.title = name === "home" ? "CSCI 127 · what to do next" : `${$("#" + name + "-title").textContent} · CSCI 127`;
    window.scrollTo(0, 0);
    if (focusTitle) { const h = $("#" + name + "-title"); if (h && name !== "home") { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); } }
  }
  function initScreens() {
    window.addEventListener("hashchange", () => showScreen(screenFromHash(), true));
    showScreen(screenFromHash(), false);
  }

  /* ---------- search & filters (All deadlines screen) ---------- */

  function normalize(text) { return (text || "").toLowerCase().trim().replace(/\s+/g, " "); }
  function applyFilters() {
    const q = normalize(state.query); const cats = state.activeCategories.size ? state.activeCategories : null; const active = Boolean(q) || Boolean(cats);
    const root = $("#all"); let total = 0, visible = 0;
    $$("[data-item]", root).forEach((item) => { total++; const show = (!q || (item.dataset.search || "").includes(q)) && (!cats || cats.has(item.dataset.category)); item.hidden = !show; if (show) visible++; });
    $$("[data-group]", root).forEach((group) => { const items = $$("[data-item]", group); group.hidden = items.length > 0 && items.every((i) => i.hidden); });
    const globalEmpty = $("#global-empty"); globalEmpty.hidden = !(active && visible === 0);
    if (!globalEmpty.hidden) {
      const text = $("#global-empty-text"); text.textContent = "";
      if (q) append(text, ["Nothing matches “" + state.query.trim() + "”. Try a shorter word like quiz, homework, or Navigate" + (cats ? ", or show all categories." : ".")]);
      else text.textContent = "Nothing is tagged with the selected categories.";
    }
    $("#results-status").textContent = !active ? "" : visible + " of " + total + " items shown" + (q ? " for “" + state.query.trim() + "”" : "") + (cats ? " · " + Array.from(cats).map((c) => DATA.CATEGORIES[c].label).join(", ") : "");
    $("#search-clear").hidden = !state.query;
  }
  function initSearch() {
    const input = $("#search"); let timer = null;
    const clearSearch = () => { input.value = ""; state.query = ""; applyFilters(); };
    input.addEventListener("input", () => { window.clearTimeout(timer); timer = window.setTimeout(() => { state.query = input.value; applyFilters(); }, 120); });
    input.addEventListener("keydown", (event) => { if (event.key === "Escape" && input.value) { event.preventDefault(); clearSearch(); } });
    $("#search-form").addEventListener("submit", (event) => { event.preventDefault(); state.query = input.value; applyFilters(); });
    $("#search-clear").addEventListener("click", () => { clearSearch(); input.focus(); });
    $("#empty-clear-search").addEventListener("click", () => { clearSearch(); input.focus(); });
    $("#empty-clear-filters").addEventListener("click", () => { setFilter("all"); $('[data-filter="all"]').focus(); });
  }
  function setFilter(key) {
    if (key === "all") state.activeCategories.clear(); else if (state.activeCategories.has(key)) state.activeCategories.delete(key); else state.activeCategories.add(key);
    syncFilterButtons(); applyFilters();
  }
  function syncFilterButtons() { $$("[data-filter]").forEach((button) => { const k = button.dataset.filter; button.setAttribute("aria-pressed", (k === "all" ? state.activeCategories.size === 0 : state.activeCategories.has(k)) ? "true" : "false"); }); }
  function initFilters() { $("#filter-row").addEventListener("click", (event) => { const button = event.target.closest("[data-filter]"); if (button) setFilter(button.dataset.filter); }); }

  /* ---------- clock, checks ---------- */

  function updateClock() {
    state.now = new Date();
    $("#today").textContent = fmtLongDay.format(state.now) + " · " + clock(state.now);
    // A new day, or a deadline that just passed: rebuild so Now / Next move on.
    const dayChanged = model.todayIso && nyIso(state.now) !== model.todayIso;
    const passedChanged = model.tasks.some((t) => t.dueMs !== null && (t.dueMs < state.now.getTime()) !== t.passed);
    if (dayChanged || passedChanged) renderAll();
  }
  function initChecks() {
    document.addEventListener("change", (event) => { const input = event.target.closest("[data-task-check]"); if (input) setDone(input.dataset.taskCheck, input.checked, true); });
    const resetButton = $("#reset-progress"); const confirm = $("#reset-confirm");
    const hide = () => { confirm.hidden = true; resetButton.hidden = false; resetButton.focus(); };
    resetButton.addEventListener("click", () => { confirm.hidden = false; resetButton.hidden = true; $("#reset-yes").focus(); });
    $("#reset-yes").addEventListener("click", () => { resetProgress(); hide(); });
    $("#reset-no").addEventListener("click", hide);
    confirm.addEventListener("keydown", (event) => { if (event.key === "Escape") hide(); });
  }

  /* ---------- WebMCP: the same journeys as the visible interface ---------- */

  function initWebMCP() {
    const context = document.modelContext;
    if (!context || typeof context.registerTool !== "function") return;
    const lifecycle = new AbortController();
    const register = (tool) => { try { Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch (_) { /* optional */ } };
    const brief = (t) => ({ id: t.id, title: t.title, completed: Boolean(state.done[t.id]), when: whenText(t), where: whereText(t) });
    register({ name: "read_course_summary", title: "Read course summary", description: "Read the CSCI 127 hub's next items, this week and source-of-truth links without changing the page.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute() { return { course: DATA.meta.course, today: model.todayIso, now: model.now ? brief(model.now) : null, next: model.next.map(brief), thisWeek: model.thisWeek.map(brief), week: model.currentWeek ? { n: model.currentWeek.n, topics: model.currentWeek.topics } : null, sources: ["brightspace", "gradescope", "site", "calendar"].map((key) => ({ label: DATA.LINKS[key].label, href: DATA.LINKS[key].href })) }; } });
    register({ name: "show_course_information", title: "Show course information", description: "Open the All deadlines screen and filter it so matching items are shown.", inputSchema: { type: "object", properties: { query: { type: "string" }, categories: { type: "array", items: { type: "string", enum: FILTER_KEYS }, uniqueItems: true } }, required: ["query"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) { if (!input || typeof input.query !== "string") throw new Error("query must be a string"); const categories = input.categories === undefined ? [] : input.categories; if (!Array.isArray(categories) || categories.some((k) => !FILTER_KEYS.includes(k))) throw new Error("categories contains an unknown value"); state.query = input.query.trim(); state.activeCategories = new Set(categories); $("#search").value = state.query; syncFilterButtons(); applyFilters(); window.location.hash = "all"; return { query: state.query, categories, visibleItems: $$("#all [data-item]").filter((i) => !i.hidden).length }; } });
    register({ name: "update_course_task_progress", title: "Update course task progress", description: "Mark checklist items complete or incomplete in this browser.", inputSchema: { type: "object", properties: { updates: { type: "array", minItems: 1, items: { type: "object", properties: { taskId: { type: "string" }, completed: { type: "boolean" } }, required: ["taskId", "completed"], additionalProperties: false } } }, required: ["updates"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) { if (!input || !Array.isArray(input.updates) || !input.updates.length) throw new Error("updates must contain at least one task"); input.updates.forEach((u) => { if (!u || !model.byId[u.taskId] || typeof u.completed !== "boolean") throw new Error("each update needs a valid taskId and completed boolean"); }); input.updates.forEach((u) => setDone(u.taskId, u.completed, false)); return { updated: input.updates.map((u) => ({ taskId: u.taskId, title: model.byId[u.taskId].title, completed: u.completed })), doneThisWeek: model.thisWeek.filter((t) => state.done[t.id]).length, totalThisWeek: model.thisWeek.length }; } });
    window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
  }

  /* ---------- boot ---------- */

  function boot() {
    document.documentElement.classList.add("js");
    if (!COURSE) $("#no-course-data").hidden = false;
    renderFilters();
    renderAll();
    updateClock();
    initScreens(); initSearch(); initFilters(); initChecks(); initWebMCP();
    window.setInterval(updateClock, 60000);
    $("#last-reviewed").textContent = fmtFull.format(new Date(DATA.meta.lastReviewed + "T12:00:00-04:00"));
  }
  boot();
})();
