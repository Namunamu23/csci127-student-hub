/*
  CSCI 127 Student Hub — page behaviour.

  Two inputs:
    window.CSCI127_DATA    editorial layer (src/data.js): links, rules, templates, prose
    window.CSCI127_COURSE  generated layer (dist/course.js, built from src/course.json,
                           changes.json, status.json, announcements.json by build.mjs)

  Everything time-related is computed from *today* in New York time, so the
  page rotates by itself: "Do this first", day cards, this week, the
  checklist and "might have missed" all move with the calendar.

  Checkmarks and collapsed sections live in localStorage (this browser only).
  No network requests, no analytics, no personal data.
*/
(function () {
  "use strict";

  const DATA = window.CSCI127_DATA;
  const BUNDLE = window.CSCI127_COURSE || {};
  const COURSE = BUNDLE.course || null;
  if (!DATA) return;

  const TZ = DATA.meta.timeZone || "America/New_York";
  const DONE_KEY = "csci127hub.done.v1";
  const COLLAPSED_KEY = "csci127hub.collapsed.v1";
  const FILTER_KEYS = Object.keys(DATA.CATEGORIES);
  const RULES = DATA.RULES;
  const DAY = 86400000;

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
  function icon(name, extraClass) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "icon" + (extraClass ? " " + extraClass : ""));
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#i-" + name);
    svg.appendChild(use);
    return svg;
  }
  const storage = {
    get(key, fallback) { try { const raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (_) { return fallback; } },
    set(key, value) { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* storage blocked: page still works for this visit */ } },
    remove(key) { try { window.localStorage.removeItem(key); } catch (_) { /* ignore */ } }
  };

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
  function fmtIsoDay(iso) { return iso ? fmtDay.format(dateOnly(iso)) : ""; }
  function fmtIsoLong(iso) { return iso ? fmtLongDay.format(dateOnly(iso)) : ""; }
  function timeLabel(hhmm) { const [h, m] = hhmm.split(":").map(Number); const suffix = h >= 12 ? "pm" : "am"; return `${((h + 11) % 12) + 1}${m ? ":" + pad(m) : ""} ${suffix}`; }

  function relativeLabel(iso, now) {
    const target = new Date(iso);
    if (Number.isNaN(target.getTime())) return "";
    const diffMs = target - now;
    if (diffMs < 0) return "passed";
    const dayDiff = dayNumber(nyIso(target)) - dayNumber(nyIso(now));
    if (dayDiff <= 0) { const hours = Math.floor(diffMs / 3600000); return hours < 1 ? "in " + Math.max(1, Math.round(diffMs / 60000)) + " min" : "in " + hours + " h"; }
    if (dayDiff === 1) return "tomorrow";
    return "in " + dayDiff + " days";
  }
  function dueText(task) {
    if (task.start && task.due) return fmtDay.format(new Date(task.start)) + " · " + fmtTime.format(new Date(task.start)) + "–" + fmtTime.format(new Date(task.due)) + " ET";
    if (task.dueLabel) return task.dueLabel;
    if (task.due) return "Due " + fmtDay.format(new Date(task.due)) + " · " + fmtTime.format(new Date(task.due)) + " ET";
    return "";
  }

  /* ---------- links, tags, chips ---------- */

  function resolveLink(spec) {
    if (!spec) return null;
    const base = spec.key ? DATA.LINKS[spec.key] : null;
    if (spec.key && !base) return null;
    return { href: spec.href || base.href, label: spec.label || (base && base.label) || spec.href, notice: (base && base.notice) || spec.notice };
  }
  function linkEl(spec, className) {
    const link = resolveLink(spec);
    if (!link || !link.href) return null;
    const isMail = link.href.startsWith("mailto:");
    const a = el("a", { href: link.href, class: className || "link" }, [link.label]);
    if (!isMail) {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
      a.appendChild(icon("external", "ext"));
      a.appendChild(el("span", { class: "sr-only", text: " (opens in a new tab)" }));
    } else a.appendChild(icon("mail", "ext"));
    if (link.notice) a.appendChild(el("span", { class: "link-note", text: " — " + link.notice }));
    return a;
  }
  function linkRow(specs, className) {
    const nodes = (specs || []).map((s) => linkEl(s)).filter(Boolean);
    return nodes.length ? el("div", { class: className || "links" }, nodes) : null;
  }
  function tag(category) { const cat = DATA.CATEGORIES[category]; return cat ? el("span", { class: "tag tag-" + category, text: cat.label }) : null; }
  function verifyTag() { return el("span", { class: "tag tag-verify", title: "Needs verification" }, [icon("info"), "Verify"]); }
  function placeChip(whereKey) { const place = DATA.PLACES[whereKey]; return place ? el("span", { class: "meta-chip where" }, [icon(place.icon || "pin"), place.label]) : null; }
  function searchText() { return Array.from(arguments).flat(Infinity).filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, " "); }
  function linkLabels(specs) { return (specs || []).map((s) => { const l = resolveLink(s); return l ? l.label : ""; }); }
  function shortTopic(text, max) { const t = (text || "").split(/[:;.]/)[0].trim(); return t.length > (max || 60) ? t.slice(0, max || 60).replace(/\s+\S*$/, "") + "…" : t; }

  /* ---------- state ---------- */

  const state = { done: storage.get(DONE_KEY, {}), collapsed: new Set(storage.get(COLLAPSED_KEY, [])), activeCategories: new Set(), query: "", now: new Date() };
  if (typeof state.done !== "object" || state.done === null || Array.isArray(state.done)) state.done = {};
  // Ids used by the first (hand-written) version of this page.
  const LEGACY_IDS = { hw1: "hw-1", hw2: "hw-2", hw3: "hw-3", hw4: "hw-4", hw5: "hw-5", quiz0: "quiz-0", quiz1: "quiz-1", quiz2: "quiz-2", cr1: "cr-1", cr2: "cr-2", lab1: "lab-1", lab2: "lab-2", lab3: "lab-3", lecture2: "lecture-2026-09-08", "ec-quiz2": "ec-2", "ec-cr2": "ec-2" };
  Object.entries(LEGACY_IDS).forEach(([oldId, newId]) => { if (state.done[oldId]) { state.done[newId] = true; delete state.done[oldId]; } });

  /* ---------- the model: tasks generated from course data ---------- */

  const model = { tasks: [], byId: {}, todayIso: null, currentWeek: null, nextWeek: null, closures: [], lectureDates: [] };

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
          steps: DATA.TEMPLATES.homework({ ...h, dueLabel: fmtTime.format(new Date(h.due)) }),
          links: [{ key: "gradescope", label: "Submit on Gradescope" }, { href: h.url, label: `Read Homework ${h.n} on the course site` }].concat(h.reading.map((r) => ({ href: r.href, label: r.label })))
        });
      });
      COURSE.windows.forEach((w) => {
        const calLink = { href: `${DATA.LINKS.calendar.href.replace(/#.*$/, "")}#Q${w.week}`, label: "See the window on the calendar" };
        if (w.quiz && w.quiz.onBrightspace) {
          tasks.push({ id: "quiz-" + w.quiz.n, type: "quiz", category: "required", where: "brightspace", title: `Take Quiz ${w.quiz.n} on Brightspace (syllabus quiz)`, due: at(w.end, "23:59"), dueLabel: `Calendar lists it through ${fmtIsoDay(w.end)} — check Brightspace`, summary: w.quiz.text, verify: "Availability is set inside Brightspace and is not visible on the public site.", links: [{ key: "brightspace", label: "Open Brightspace" }, { key: "syllabus", label: "Read the syllabus" }, calLink] });
        } else if (w.quiz && w.end) {
          tasks.push({ id: "quiz-" + w.quiz.n, type: "quiz", week: w.week, category: "required", where: "lab", title: `Take Quiz ${w.quiz.n}: ${shortTopic(w.quiz.text)}`, due: at(w.end, RULES.assessmentDeadline.time), windowStart: w.start, windowEnd: w.end, dueLabel: `Window ${fmtIsoDay(w.start)} – ${fmtIsoDay(w.end)} · finish by ${dueClock}`, summary: w.quiz.text, steps: DATA.TEMPLATES.quiz(w), verify: RULES.assessmentDeadline.verify, links: [calLink].concat(w.quiz.links.map((l) => ({ href: l.href, label: "Study " + l.label })), [{ key: "navigate", label: "Book on Navigate" }, { key: "quizInfo" }]) });
        }
        if (w.codeReview && w.end) {
          tasks.push({ id: "cr-" + w.codeReview.n, type: "codeReview", week: w.week, category: "required", where: "lab", title: `Do Code Review ${w.codeReview.n}: ${shortTopic(w.codeReview.text, 70)}`, due: at(w.end, RULES.assessmentDeadline.time), windowStart: w.start, windowEnd: w.end, dueLabel: `Window ${fmtIsoDay(w.start)} – ${fmtIsoDay(w.end)} · finish by ${dueClock}`, summary: `${w.codeReview.text}. Re-create one of the listed programs in IDLE on a lab computer and explain it to a TA.`, steps: DATA.TEMPLATES.codeReview(w), verify: RULES.assessmentDeadline.verify, links: [{ key: "codeReviewInfo" }, calLink].concat(w.codeReview.links.map((l) => ({ href: l.href, label: "Read " + l.label })), [{ key: "navigate", label: "Book on Navigate" }]) });
        }
        const tiers = [["15%", w.early15], ["10%", w.early10], ["5%", w.early5]].filter((t) => t[1]);
        if (tiers.length && w.quiz && !w.quiz.onBrightspace) {
          const last = tiers[tiers.length - 1][1];
          tasks.push({ id: "ec-" + w.week, type: "extra", week: w.week, category: "extra", where: "lab", title: `Finish Quiz ${w.quiz.n}${w.codeReview ? " and Code Review " + w.codeReview.n : ""} early for extra credit`, due: at(last, RULES.assessmentDeadline.time), tiers, dueLabel: tiers.map(([p, d]) => `${p} by ${fmtIsoDay(d)}`).join(" · "), summary: "Up to 15% extra credit on that week's quiz and code review for finishing before the end date.", steps: DATA.TEMPLATES.extra(w), links: [calLink, { key: "navigate", label: "Book on Navigate" }] });
        }
      });
      COURSE.labs.forEach((l) => {
        if (!l.target) return;
        tasks.push({ id: "lab-" + l.n, type: "lab", n: l.n, category: "recommended", where: "home", title: `Work through ${l.title}`, due: at(l.target, "23:59"), dueLabel: `Target ${fmtIsoDay(l.target)}`, summary: l.objective ? "Learning objective: " + l.objective : "", steps: DATA.TEMPLATES.lab(l), links: [{ href: l.url, label: `Open Lab ${l.n}` }] });
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
    const labVisitSoon = model.tasks.some((t) => t.where === "lab" && (t.type === "quiz" || t.type === "codeReview") && t.offset !== null && t.offset >= 0 && t.offset <= RULES.focusDays);
    model.focus = model.tasks.filter((t) => t.type === "standing" ? (t.urgent && (t.urgentWhen !== "labVisit" || labVisitSoon)) : (t.offset !== null && t.offset >= 0 && t.offset <= RULES.focusDays));
    model.urgent = model.focus;
    model.missed = model.tasks.filter((t) => t.offset !== null && t.offset < 0 && t.offset >= -RULES.missedDays && !state.done[t.id] && t.type !== "extra");
  }

  /* ---------- rendering: task items ---------- */

  function checkbox(taskId, suffix) {
    const input = el("input", { type: "checkbox", class: "check", id: "task-" + taskId + "-" + suffix, dataset: { taskCheck: taskId } });
    input.checked = Boolean(state.done[taskId]);
    return input;
  }
  function taskItem(task, suffix, compact) {
    const inputId = "task-" + task.id + "-" + suffix;
    const place = DATA.PLACES[task.where];
    const due = dueText(task);
    const li = el("li", { class: "task-item cat-" + task.category + (state.done[task.id] ? " done" : "") + (task.urgent ? " urgent" : ""), dataset: { item: "", category: task.category, task: task.id, search: searchText(task.title, task.summary, task.steps, due, task.dueLabel, place && place.label, DATA.CATEGORIES[task.category].label, task.type, linkLabels(task.links), task.verify ? "verify" : "") } });
    const meta = el("div", { class: "task-meta" }, [tag(task.category), due ? el("span", { class: "meta-chip due", dataset: task.due ? { due: task.due } : {} }, [icon("clock"), el("span", { class: "due-text", text: due }), el("em", { class: "due-rel" })]) : null, placeChip(task.where), task.verify ? verifyTag() : null]);
    const body = el("div", { class: "task-body" }, [meta, el("h3", { class: "task-title" }, [el("label", { for: inputId, text: task.title })])]);
    if (task.summary) body.appendChild(el("p", { class: "task-summary", text: task.summary }));
    if (task.verify) body.appendChild(el("p", { class: "verify-note" }, [icon("info"), el("span", { text: task.verify })]));
    if (task.steps && task.steps.length) {
      body.appendChild(el("details", { class: "task-details" }, [el("summary", null, [icon("chevron", "chevron"), "How to do it"]), el("ol", { class: "steps" }, task.steps.map((s) => el("li", { text: s })))]));
    }
    const links = linkRow(task.links, "task-links");
    if (links) body.appendChild(links);
    li.appendChild(el("div", { class: "task-check" }, [checkbox(task.id, suffix)]));
    li.appendChild(body);
    if (compact) li.classList.add("compact");
    return li;
  }

  /* ---------- rendering: sections ---------- */

  function renderHero() {
    const stamp = $("#data-stamp");
    if (!COURSE) { stamp.textContent = "Course data has not been generated yet — run the course watch script."; return; }
    const status = BUNDLE.status || {};
    const checked = status.lastRunAt ? fmtStamp.format(new Date(status.lastRunAt)) + " ET" : "unknown";
    const changed = status.courseRepo && status.courseRepo.committedAt ? fmtMonthDay.format(new Date(status.courseRepo.committedAt)) : null;
    stamp.textContent = `Course pages last checked ${checked}` + (changed ? ` · course site last changed ${changed}` : "") + ".";
  }

  function renderFocus() {
    const online = $("#focus-before"); const campus = $("#focus-tuesday");
    online.textContent = ""; campus.textContent = "";
    model.focus.forEach((task) => { const place = DATA.PLACES[task.where]; (place && place.campus ? campus : online).appendChild(taskItem(task, "focus", true)); });
    const end = addDays(model.todayIso, RULES.focusDays);
    $("#focus-window").textContent = `${fmtIsoDay(model.todayIso)} – ${fmtIsoDay(end)}`;
    $("#focus-title-text").textContent = model.focus.length ? `The next ${RULES.focusDays} days` : "Nothing is due in the next few days";
    const campusDay = model.focus.find((t) => DATA.PLACES[t.where] && DATA.PLACES[t.where].campus);
    const dueSoon = model.focus.filter((t) => t.type !== "standing");
    const lastDay = COURSE ? [COURSE.final && COURSE.final.date, ...(COURSE.weeks || []).map((w) => w.end)].filter(Boolean).sort().pop() : null;
    model.semesterOver = Boolean(lastDay && model.todayIso > lastDay);
    if (model.semesterOver) { $("#focus-intro").textContent = `The ${COURSE.term} course calendar has ended. This page stays up for reference; nothing new is due.`; return; }
    $("#focus-intro").textContent = dueSoon.length
      ? `${dueSoon.length} course item${dueSoon.length === 1 ? "" : "s"} land${dueSoon.length === 1 ? "s" : ""} by ${fmtIsoLong(end)}` + (campusDay ? `, including a campus visit` : "") + `. Check things off as you go — this browser remembers.`
      : "Use the checklist below to work ahead, or open the course site for what is coming.";
    $("#focus-campus-title").textContent = "On campus";
    $("#focus-online-title").textContent = "Online / at home";
    $$(".focus-group").forEach((g) => { g.dataset.group = ""; });
  }

  function renderDays() {
    const root = $("#day-cards"); root.textContent = "";
    const bring = $("#campus-bring"); bring.textContent = "";
    DATA.CAMPUS_DAY.bring.forEach((b) => bring.appendChild(el("li", { dataset: { item: "", category: "info", search: searchText("campus day bring prepare", b.item, b.why) } }, [icon("check"), el("div", null, [el("strong", { text: b.item }), el("span", { class: "bring-why", text: b.why })])])));
    for (let i = 0; i < RULES.campusDaysAhead; i++) {
      const iso = addDays(model.todayIso, i);
      const wd = weekdayOf(iso);
      const notes = closuresOn(iso);
      const closures = notes.filter((c) => !c.info);
      const lecture = model.tasks.find((t) => t.type === "lecture" && t.dueIso === iso);
      const dueToday = model.tasks.filter((t) => t.dueIso === iso && t.type !== "lecture" && t.type !== "standing" && t.type !== "extra");
      const labClosed = closures.some((c) => c.lab || c.noClasses);
      const season = labSeason();
      const inSeason = (!season.open || iso >= season.open) && (!season.close || iso <= season.close);
      const labHours = wd >= 1 && wd <= 5 && !labClosed && inSeason ? RULES.labHours.byWeekday[wd] : null;
      const isCampus = Boolean(lecture) || dueToday.some((t) => DATA.PLACES[t.where] && DATA.PLACES[t.where].campus);
      const card = el("li", { class: "day-card" + (isCampus ? " campus" : "") + (closures.length ? " closed" : ""), dataset: { item: "", category: "info", search: searchText("today tomorrow day plan", fmtIsoLong(iso), closures.map((c) => c.text), lecture && lecture.title, dueToday.map((t) => t.title), labHours && "lab open") } });
      card.appendChild(el("p", { class: "day-label", text: i === 0 ? "Today" : i === 1 ? "Tomorrow" : fmtIsoDay(iso).split(",")[0] }));
      card.appendChild(el("h3", { class: "day-date", text: fmtIsoLong(iso) }));
      const list = el("ul", { class: "day-list" });
      closures.forEach((c) => list.appendChild(el("li", { class: "day-closed" }, [icon("alert"), el("span", { text: c.text + " (" + c.source + ")" })])));
      notes.filter((c) => c.info).forEach((c) => list.appendChild(el("li", null, [icon("info"), el("span", { text: c.text + " (" + c.source + ")" })])));
      if (lecture) list.appendChild(el("li", null, [icon("book"), el("span", null, [el("strong", { text: `${timeLabel(RULES.lecture.start)}–${timeLabel(RULES.lecture.end)} lecture` }), " · " + DATA.PLACES.lecture.label])]));
      if (labHours) list.appendChild(el("li", null, [icon("pin"), el("span", null, [el("strong", { text: "Lab 1001E HN open " + labHours }), closures.length ? " (unless closed — see above)" : ""])]));
      else if (wd >= 1 && wd <= 5 && labClosed) list.appendChild(el("li", null, [icon("x"), el("span", { text: "Lab closed: no tutoring, quizzes, or code reviews." })]));
      else if (wd >= 1 && wd <= 5 && !inSeason) list.appendChild(el("li", null, [icon("x"), el("span", { text: "Lab closed for the semester." })]));
      else if (wd === 0 || wd === 6) list.appendChild(el("li", null, [icon("home"), el("span", { text: "Weekend — lab closed; Gradescope, labs and the textbook are online." })]));
      dueToday.forEach((t) => list.appendChild(el("li", { class: "day-due" }, [icon("clock"), el("span", null, [el("strong", { text: t.type === "lab" ? "Target:" : (t.due ? fmtTime.format(new Date(t.due)) : "") }), " ", el("a", { href: "#task-" + t.id + "-full", text: t.title, class: "day-link" })])])));
      if (!closures.length && !lecture && !dueToday.length && !labHours) list.appendChild(el("li", null, [icon("check"), el("span", { text: "Nothing due. Good day to work ahead." })]));
      if (!dueToday.length && (lecture || labHours)) list.appendChild(el("li", null, [icon("check"), el("span", { text: "Nothing due today." })]));
      card.appendChild(list);
      root.appendChild(card);
    }
    renderCampusTimeline();
  }

  function renderCampusTimeline() {
    const root = $("#campus-timeline"); root.textContent = "";
    const next = model.tasks.find((t) => t.type === "lecture" && t.offset !== null && t.offset >= 0 && !t.passed);
    const heading = $("#campus-heading");
    if (!next) { heading.textContent = "No lecture day is coming up in the course calendar."; $("#campus-card").hidden = true; return; }
    $("#campus-card").hidden = false;
    const iso = next.dueIso; const wd = weekdayOf(iso);
    heading.textContent = `Next campus day: ${fmtIsoLong(iso)}` + (next.offset === 0 ? " (today)" : next.offset === 1 ? " (tomorrow)" : "");
    const windowsEnding = model.tasks.filter((t) => (t.type === "quiz" || t.type === "codeReview") && t.where === "lab" && t.dueIso === iso);
    const windowsOpen = model.tasks.filter((t) => (t.type === "quiz" || t.type === "codeReview") && t.where === "lab" && t.windowStart && t.windowStart <= iso && iso <= t.windowEnd && t.dueIso !== iso);
    const hwDue = model.tasks.filter((t) => t.type === "homework" && t.dueIso === iso);
    const labHours = RULES.labHours.byWeekday[wd];
    const entries = [];
    if (RULES.preLecture) entries.push({ time: RULES.preLecture.time, title: RULES.preLecture.label, category: "optional", where: RULES.preLecture.where, detail: RULES.preLecture.text, verify: RULES.preLecture.verify, links: [{ key: RULES.preLecture.source, label: "Source announcement" }, { key: "brightspace", label: "Check Brightspace" }] });
    entries.push({ time: `${timeLabel(RULES.lecture.start)} – ${timeLabel(RULES.lecture.end)}`, title: next.title, category: "required", where: "lecture", detail: next.summary, taskId: next.id, links: next.links.slice(0, 2) });
    if (labHours) {
      const items = windowsEnding.concat(windowsOpen);
      entries.push({ time: `From ${labHours.split("–")[0].trim()} · assessments by ${RULES.assessmentDeadline.label}`, title: items.length ? "Lab visit in 1001E HN" : "Lab open in 1001E HN (" + labHours + ")", category: items.length ? "required" : "optional", where: "lab", detail: items.length ? `${windowsEnding.length ? "Last day for: " + windowsEnding.map((t) => t.title.replace(/^(Take|Do) /, "")).join("; ") + ". " : ""}${windowsOpen.length ? "Also open: " + windowsOpen.map((t) => t.title.replace(/^(Take|Do) /, "")).join("; ") + "." : ""}` : "No quiz or code review window ends today; the lab is open for tutoring and early completions.", taskIds: items.map((t) => t.id), verify: items.length ? RULES.assessmentDeadline.verify : null, links: [{ key: "navigate", label: "Book on Navigate" }] });
    }
    hwDue.forEach((t) => entries.push({ time: fmtTime.format(new Date(t.due)), title: t.title.replace(/^Submit /, "") + " due on Gradescope", category: "required", where: "gradescope", detail: "No late homework. Submit before you head to campus if you can.", taskId: t.id, links: [{ key: "gradescope", label: "Submit on Gradescope" }] }));
    entries.forEach((entry) => {
      const task = entry.taskId ? model.byId[entry.taskId] : null;
      const inputId = task ? "task-" + task.id + "-campus" : null;
      const li = el("li", { class: "timeline-item cat-" + entry.category + (task && state.done[task.id] ? " done" : ""), dataset: { item: "", category: entry.category, task: task ? task.id : "", search: searchText("campus day timeline", entry.time, entry.title, entry.detail, DATA.PLACES[entry.where] && DATA.PLACES[entry.where].label, DATA.CATEGORIES[entry.category].label, entry.verify ? "verify" : "", linkLabels(entry.links)) } });
      li.appendChild(el("div", { class: "timeline-time" }, [icon("clock"), entry.time]));
      const body = el("div", { class: "timeline-body" });
      const head = el("div", { class: "timeline-head" });
      if (task) { head.appendChild(el("div", { class: "task-check" }, [checkbox(task.id, "campus")])); head.appendChild(el("h4", { class: "timeline-title" }, [el("label", { for: inputId, text: entry.title })])); }
      else head.appendChild(el("h4", { class: "timeline-title", text: entry.title }));
      body.appendChild(head);
      body.appendChild(el("div", { class: "task-meta" }, [tag(entry.category), placeChip(entry.where), entry.verify ? verifyTag() : null]));
      if (entry.detail) body.appendChild(el("p", { class: "timeline-detail", text: entry.detail }));
      if (entry.taskIds && entry.taskIds.length) body.appendChild(el("ul", { class: "mini-list" }, entry.taskIds.map((id) => { const t = model.byId[id]; return el("li", null, [checkbox(t.id, "campus"), el("label", { for: "task-" + t.id + "-campus", text: t.title })]); })));
      if (entry.verify) body.appendChild(el("p", { class: "verify-note" }, [icon("info"), el("span", { text: entry.verify })]));
      const links = linkRow(entry.links, "task-links");
      if (links) body.appendChild(links);
      li.appendChild(body);
      root.appendChild(li);
    });
  }

  function renderWeek() {
    const root = $("#week-body-content"); root.textContent = "";
    const w = model.currentWeek;
    if (!COURSE || !w) { $("#week-title-text").textContent = "This week"; root.appendChild(el("p", { class: "fine-print", text: "No weekly plan is available for today's date." })); return; }
    const isCurrent = w.start <= model.todayIso && model.todayIso <= w.end;
    $("#week-title-text").textContent = `${isCurrent ? "This week" : "Coming up"}: Week ${w.n} · ${fmtIsoDay(w.start)} – ${fmtIsoDay(w.end)}`;
    $("#week-eyebrow").textContent = isCurrent ? "From the course website's weekly plan" : "Next on the course website's weekly plan";
    const topics = (w.topics || "").split(/;\s*/).filter(Boolean);
    const grid = el("div", { class: "week-grid" });
    grid.appendChild(el("div", { class: "info-card", dataset: { item: "", category: "info", search: searchText("this week topics lecture", w.topics) } }, [el("h3", null, [icon("book"), " Lecture topics"]), el("ul", null, topics.map((t) => el("li", { text: t })))]));
    if (w.reading && w.reading.length) grid.appendChild(el("div", { class: "info-card", dataset: { item: "", category: "recommended", search: searchText("this week reading textbook", w.readingText, linkLabels(w.reading)) } }, [el("h3", null, [icon("doc"), " Reading"]), linkRow(w.reading.map((r) => ({ href: r.href, label: r.label })), "task-links")]));
    if (w.coursework && w.coursework.length) grid.appendChild(el("div", { class: "info-card", dataset: { item: "", category: "required", search: searchText("this week coursework lab quiz code review programs", linkLabels(w.coursework)) } }, [el("h3", null, [icon("list"), " Coursework this week"]), linkRow(w.coursework.map((r) => ({ href: r.href, label: r.label })), "task-links")]));
    if (w.handouts && w.handouts.length) grid.appendChild(el("div", { class: "info-card", dataset: { item: "", category: "optional", search: searchText("this week handouts examples", linkLabels(w.handouts)) } }, [el("h3", null, [icon("tools"), " Lecture examples & handouts"]), linkRow(w.handouts.map((r) => ({ href: r.href, label: r.label })), "task-links")]));
    root.appendChild(grid);
    if (w.notes && w.notes.length) root.appendChild(el("div", { class: "callout", dataset: { item: "", category: "info", search: searchText("this week notes closure", w.notes.map((n) => n.text)) } }, [icon("alert"), el("div", null, w.notes.map((n) => el("p", null, [el("strong", { text: (n.date ? fmtIsoDay(n.date) : n.dateText) + ": " }), n.text])))]));
    const nw = model.nextWeek;
    if (nw) root.appendChild(el("p", { class: "fine-print next-week", dataset: { item: "", category: "info", search: searchText("next week", nw.topics) } }, [el("strong", { text: `Next: Week ${nw.n} (${fmtIsoDay(nw.start)} – ${fmtIsoDay(nw.end)}) — ` }), shortTopic(nw.topics, 120)]));
  }

  function renderChecklist() {
    const list = $("#task-list"); list.textContent = "";
    const weekEnd = model.currentWeek ? model.currentWeek.end : addDays(model.todayIso, 6);
    const nextEnd = model.nextWeek ? model.nextWeek.end : addDays(weekEnd, 7);
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
      list.appendChild(el("li", { class: "task-group", dataset: { group: "" } }, [el("h3", { class: "group-title", text: group.label }), el("ol", { class: "task-list" }, tasks.map((t) => taskItem(t, "full", false)))]));
    });
    const rest = upcoming.filter((t) => !placed.has(t.id));
    if (rest.length) {
      const details = el("details", { class: "task-group rest-group", dataset: { group: "" } }, [el("summary", { class: "group-title" }, [icon("chevron", "chevron"), ` Everything later this semester (${rest.length} items)`]), el("ol", { class: "task-list" }, rest.map((t) => taskItem(t, "full", false)))]);
      list.appendChild(el("li", null, [details]));
    }
    const standing = model.tasks.filter((t) => t.type === "standing");
    if (standing.length) list.appendChild(el("li", { class: "task-group", dataset: { group: "" } }, [el("h3", { class: "group-title", text: "Ongoing" }), el("ol", { class: "task-list" }, standing.map((t) => taskItem(t, "full", false)))]));
    const legend = $("#category-legend"); legend.textContent = "";
    FILTER_KEYS.forEach((key) => legend.appendChild(el("span", { class: "legend-item" }, [tag(key), el("span", { class: "legend-hint", text: DATA.CATEGORIES[key].hint })])));
    $("#checklist-count").textContent = `${upcoming.length} dated items ahead, generated from the course pages.`;
  }

  function shortUrl(url) {
    try {
      const u = new URL(url);
      if (/brightspace\.cuny\.edu/i.test(u.host)) return "Brightspace link (login)";
      if (/huntercsci127\.github\.io/i.test(u.host)) return "course site: " + u.pathname.replace(/^\/(f26\/)?/, "") + (u.hash || "");
      return u.host.replace(/^www\./, "") + (u.pathname !== "/" ? u.pathname : "");
    } catch (_) { return url; }
  }
  function linkify(text) {
    const nodes = []; const re = /<?(https?:\/\/[^\s<>]+)>?/g; let last = 0; let m;
    const clean = text.replace(/<mailto:[^>]+>/gi, "");
    while ((m = re.exec(clean))) {
      nodes.push(clean.slice(last, m.index));
      const url = m[1].replace(/[.,;)]+$/, "");
      nodes.push(" "); nodes.push(linkEl({ href: url, label: shortUrl(url) }, "inline-link"));
      last = m.index + m[0].length;
    }
    nodes.push(clean.slice(last));
    return nodes;
  }
  function announcementBody(text) {
    const lines = (text || "").replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+$/, ""));
    const blocks = []; let list = null;
    lines.forEach((raw) => {
      const line = raw.trim();
      if (!line) { list = null; return; }
      const bullet = line.match(/^(?:[*\-•]|\d+[.)])\s+(.*)$/);
      if (bullet) { if (!list) { list = el("ul", { class: "announcement-list" }); blocks.push(list); } list.appendChild(el("li", null, linkify(bullet[1]))); return; }
      list = null;
      blocks.push(el("p", { class: /^[^.]{2,70}:$/.test(line) ? "announcement-heading" : "announcement-p" }, linkify(line)));
    });
    const root = el("div", { class: "announcement-body" });
    const visible = 4;
    if (blocks.length <= visible + 1) { blocks.forEach((b) => root.appendChild(b)); return root; }
    blocks.slice(0, visible).forEach((b) => root.appendChild(b));
    const rest = el("details", { class: "task-details announcement-more" }, [el("summary", null, [icon("chevron", "chevron"), "Show the rest of this announcement"])]);
    blocks.slice(visible).forEach((b) => rest.appendChild(b));
    root.appendChild(rest);
    return root;
  }
  function renderAnnouncements() {
    const list = $("#announcement-list"); list.textContent = "";
    const ann = BUNDLE.announcements || { items: [] };
    const items = (ann.items || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    if (!items.length) list.appendChild(el("li", { class: "fine-print", text: "No announcements have been added yet." }));
    items.forEach((a) => {
      const origin = a.auto ? "Copied automatically from a Brightspace notification e-mail" : a.source === "issue" ? "Added by a classmate through GitHub" : "Added by the site maintainer" + (a.checkedAt ? ` (checked ${fmtIsoDay(a.checkedAt)})` : "");
      list.appendChild(el("li", { class: "missed-item announcement", dataset: { item: "", category: "info", search: searchText("announcement brightspace", a.title, a.text, a.date) } }, [
        el("div", { class: "missed-head" }, [icon("globe", "missed-icon"), el("h3", { class: "missed-title", text: a.title }), el("span", { class: "meta-chip", text: a.date ? fmtIsoDay(a.date) : "" })]),
        a.text ? announcementBody(a.text) : null,
        el("p", { class: "fine-print" }, [origin, a.link ? [" · ", linkEl({ href: a.link, label: "Open on Brightspace (login)" }, "inline-link")] : null, a.url ? [" · ", linkEl({ href: a.url, label: "View or fix on GitHub" }, "inline-link")] : null])
      ]));
    });
    $("#announcement-updated").textContent = ann.updatedAt ? `List last rebuilt ${fmtStamp.format(new Date(ann.updatedAt))} ET.` : "";
  }

  function renderToolbox() {
    const grid = $("#toolbox-grid"); grid.textContent = "";
    DATA.TOOLBOX.forEach((tool) => grid.appendChild(el("li", { class: "card cat-" + tool.category, dataset: { item: "", category: tool.category, search: searchText(tool.name, tool.use, tool.when, DATA.CATEGORIES[tool.category].label, linkLabels(tool.links)) } }, [el("div", { class: "card-head" }, [icon(tool.icon || "globe", "card-icon"), el("h3", { class: "card-title", text: tool.name }), tag(tool.category)]), el("p", { class: "card-use" }, [el("strong", { text: "Use it for: " }), tool.use]), el("p", { class: "card-when" }, [icon("clock"), el("span", null, [el("strong", { text: "When: " }), tool.when])]), linkRow(tool.links, "card-links")])));
  }

  function renderGrading() {
    const list = $("#grading-weights"); list.textContent = "";
    const weights = (COURSE && COURSE.grading && COURSE.grading.weights && COURSE.grading.weights.length) ? COURSE.grading.weights : Object.keys(DATA.GRADING_NOTES).map((label) => ({ label, percent: null }));
    weights.forEach((w) => list.appendChild(el("li", { class: "weight", dataset: { item: "", category: "info", search: searchText("grading weight percent", w.label, w.percent + "%", DATA.GRADING_NOTES[w.label]) } }, [el("div", { class: "weight-row" }, [el("span", { class: "weight-label", text: w.label }), el("span", { class: "weight-bar", "aria-hidden": "true" }, [el("span", { class: "weight-fill", style: "width:" + (w.percent || 0) + "%" })]), el("span", { class: "weight-pct", text: w.percent !== null ? w.percent + "%" : "?" })]), el("p", { class: "weight-note", text: DATA.GRADING_NOTES[w.label] || "" })])));
    const g = COURSE && COURSE.grading ? COURSE.grading : {};
    $("#grading-final-rule").textContent = g.finalRule || (COURSE && COURSE.final && COURSE.final.passRule) || "You must take and pass the final to pass the course (see the syllabus).";
    const ruleCard = $("#grading-final-rule").closest(".info-card");
    Object.assign(ruleCard.dataset, { item: "", category: "info", search: searchText("pass final exam 60 points rule", $("#grading-final-rule").textContent) });
    const extra = (COURSE && COURSE.rules && COURSE.rules.coursework && COURSE.rules.coursework.extraCredit) || "Up to 15% extra credit for finishing quizzes and code reviews early.";
    $("#grading-extra").textContent = extra;
    Object.assign($("#grading-extra-card").dataset, { item: "", category: "extra", search: searchText("extra credit early quiz code review", extra) });
    const dl = $("#grading-final"); dl.textContent = "";
    const f = (COURSE && COURSE.final) || {};
    const facts = [["When", f.text ? f.text.replace(/(\d)-(\d)/, "$1–$2") : "See the coursework page"], ["Where", "118 HN (Assembly Hall)"], ["Format", DATA.GRADING_EXTRA.format], ["Preparation", DATA.GRADING_EXTRA.prep + (f.mock ? ` Mock final: ${fmtIsoLong(f.mock)}.` : "")]];
    facts.forEach(([k, v]) => { dl.appendChild(el("dt", { text: k })); dl.appendChild(el("dd", { text: v })); });
    dl.appendChild(el("dt", null, [verifyTag()])); dl.appendChild(el("dd", { class: "verify-note", text: DATA.GRADING_EXTRA.finalVerify }));
    Object.assign($("#grading-final-card").dataset, { item: "", category: "info", search: searchText("final exam december mock exam", facts.flat(), DATA.GRADING_EXTRA.finalVerify) });
    const src = $("#grading-source"); src.textContent = "Source: "; src.appendChild(linkEl(DATA.GRADING_EXTRA.source));
  }

  function renderLab() {
    const lab = DATA.LAB; const where = $("#lab-where"); where.textContent = "";
    where.appendChild(el("h3", null, [icon("pin"), " Where and when"]));
    where.appendChild(el("p", { class: "lab-room", text: lab.room }));
    where.appendChild(el("p", { class: "lab-floor", text: lab.where }));
    where.appendChild(el("p", { class: "lab-hours" }, [icon("clock"), el("span", { text: RULES.labHours.text })]));
    where.appendChild(el("p", { class: "fine-print", text: RULES.labHours.note }));
    const pageHours = COURSE && COURSE.labHours ? [COURSE.labHours.lab1 && "Lab 1 page: " + COURSE.labHours.lab1, COURSE.labHours.lab0 && "Lab 0 page: " + COURSE.labHours.lab0].filter(Boolean).join(" · ") : "";
    if (pageHours) where.appendChild(el("p", { class: "fine-print", text: pageHours }));
    Object.assign(where.dataset, { item: "", category: "info", search: searchText("lab location hours 1001E north building", lab.room, lab.where, RULES.labHours.text, pageHours) });
    const services = $("#lab-services"); services.textContent = "";
    lab.services.forEach((s) => services.appendChild(el("li", { text: s, dataset: { item: "", category: "info", search: searchText("lab services tutoring", s) } })));
    const closures = $("#lab-closures"); closures.textContent = "";
    const horizon = addDays(model.todayIso, 75);
    const seen = new Set(); const entries = [];
    courseNotes().forEach((n) => { if (n.date && n.date >= model.todayIso && n.date <= horizon && (n.labClosed || n.noClasses || /lab (opens|closes)/i.test(n.text))) { entries.push({ start: n.date, end: n.date, text: n.text, source: "course site" }); seen.add(n.date); } });
    hunterClosures().forEach((h) => { if (h.end >= model.todayIso && h.start <= horizon && !seen.has(h.start)) entries.push({ start: h.start, end: h.end, text: h.text, source: "Hunter calendar" }); });
    entries.sort((a, b) => a.start.localeCompare(b.start));
    if (!entries.length) closures.appendChild(el("li", { text: "No closures listed in the next few weeks." }));
    entries.forEach((c) => closures.appendChild(el("li", { dataset: { item: "", category: "info", search: searchText("lab closed closure holiday", c.text, fmtIsoDay(c.start)) } }, [el("strong", { text: (c.start === c.end ? fmtIsoDay(c.start) : fmtIsoDay(c.start) + " – " + fmtIsoDay(c.end)) + ": " }), c.text, el("span", { class: "fine-print", text: " (" + c.source + ")" })])));
    const links = $("#lab-links"); links.textContent = ""; lab.links.forEach((l) => links.appendChild(linkEl(l)));
  }

  function renderSoftware() {
    const root = $("#software-phases"); root.textContent = "";
    DATA.SOFTWARE.forEach((phase, index) => {
      const section = el("section", { class: "phase" + (index === 0 ? " phase-now" : ""), dataset: { group: "" }, "aria-labelledby": "phase-" + index });
      section.appendChild(el("h3", { class: "phase-title", id: "phase-" + index }, [icon(index === 0 ? "sparkle" : "calendar"), phase.phase]));
      section.appendChild(el("ul", { class: "software-list" }, phase.items.map((item) => el("li", { class: "software-item cat-" + item.category, dataset: { item: "", category: item.category, search: searchText("software tools install", phase.phase, item.name, item.why, DATA.CATEGORIES[item.category].label, linkLabels(item.links)) } }, [el("div", { class: "software-head" }, [el("h4", { class: "software-name", text: item.name }), tag(item.category)]), el("p", { class: "software-why", text: item.why }), linkRow(item.links, "task-links")]))));
      root.appendChild(section);
    });
  }

  function renderAI() {
    const ai = DATA.AI_POLICY;
    const allowed = $("#ai-allowed"); allowed.textContent = ""; ai.allowed.forEach((t) => allowed.appendChild(el("li", { text: t, dataset: { item: "", category: "info", search: searchText("ai policy allowed chatgpt copilot", t) } })));
    const not = $("#ai-not-allowed"); not.textContent = ""; ai.notAllowed.forEach((t) => not.appendChild(el("li", { text: t, dataset: { item: "", category: "info", search: searchText("ai policy not allowed cheating plagiarism", t) } })));
    $("#ai-consequences").textContent = ai.consequences;
    Object.assign($("#ai-consequences-card").dataset, { item: "", category: "info", search: searchText("academic integrity consequences cheating plagiarism", ai.consequences) });
    const src = $("#ai-source"); src.textContent = "Source: "; src.appendChild(linkEl(ai.source));
  }

  function renderMissed() {
    const list = $("#missed-list"); list.textContent = "";
    model.missed.forEach((t) => {
      const q = t.type === "lecture" ? `Were you at ${t.title}?` : t.type === "lab" ? `Did you finish ${t.title.replace(/^Work through /, "")}?` : `Did you ${t.title.charAt(0).toLowerCase() + t.title.slice(1)}?`;
      const note = t.type === "lecture" ? "Lecture slips have no make-ups, but only your top 10 count." : t.type === "homework" ? "No late homework, but the highest 50 of 60 count. Check Gradescope for what was received." : t.type === "quiz" || t.type === "codeReview" ? "No make-ups; the top 10 count. Check Gradescope for your score." : t.type === "lab" ? "Labs are not graded, but the quiz is built from them — still worth doing." : "";
      list.appendChild(el("li", { class: "missed-item cat-" + t.category, dataset: { item: "", category: t.category, task: t.id, search: searchText("missed check", q, note, t.title) } }, [el("div", { class: "missed-head" }, [checkbox(t.id, "missed"), el("h3", { class: "missed-title" }, [el("label", { for: "task-" + t.id + "-missed", text: q })]), tag(t.category), el("span", { class: "meta-chip due passed", text: dueText(t) })]), note ? el("p", { class: "missed-check", text: note }) : null, linkRow(t.links.slice(0, 3), "task-links")]));
    });
    DATA.MISSED_CHECKS.forEach((m) => {
      if (m.until && model.todayIso > m.until) return;
      list.appendChild(el("li", { class: "missed-item cat-" + m.category, dataset: { item: "", category: m.category, search: searchText("missed check", m.title, m.check, DATA.CATEGORIES[m.category].label, linkLabels(m.links)) } }, [el("div", { class: "missed-head" }, [icon("help", "missed-icon"), el("h3", { class: "missed-title", text: m.title }), tag(m.category)]), el("p", { class: "missed-check", text: m.check }), linkRow(m.links, "task-links")]));
    });
    $("#missed-intro").textContent = model.missed.length ? `${model.missed.length} dated item${model.missed.length === 1 ? "" : "s"} from the last ${RULES.missedDays} days ${model.missed.length === 1 ? "is" : "are"} not checked off here. This page cannot see your account — each line is something to check, not something you missed.` : `Nothing from the last ${RULES.missedDays} days is unchecked. This page cannot see your account, so use Gradescope for the real record.`;
  }

  function renderUpdates() {
    const status = BUNDLE.status || {}; const changes = BUNDLE.changes || [];
    const srcList = $("#status-sources"); srcList.textContent = "";
    const names = { home: "Course home page (weekly plan)", coursework: "Coursework page (calendar, labs, final)", homework: "Homework list", syllabus: "Syllabus", resources: "Resources", faq: "FAQ", lab0: "Lab 0", lab1: "Lab 1", hunterCalendar: "Hunter academic calendar", announcements: "Announcements (GitHub issues)" };
    Object.entries(status.sources || {}).forEach(([key, s]) => {
      srcList.appendChild(el("li", { class: "status-row" + (s.ok ? "" : " status-bad"), dataset: { item: "", category: "info", search: searchText("status source checked", names[key] || key, s.ok ? "ok" : "failed") } }, [icon(s.ok ? "check" : "alert"), el("span", null, [el("strong", { text: names[key] || key }), s.ok ? ` — checked ${s.checkedAt ? fmtStamp.format(new Date(s.checkedAt)) : "?"}` + (s.changedAt ? `, last changed ${fmtMonthDay.format(new Date(s.changedAt))}` : "") : ` — could not be read on the last run${s.checkedAt ? " (" + fmtStamp.format(new Date(s.checkedAt)) + ")" : ""}; showing the previous copy.`])]));
    });
    if (status.courseRepo && status.courseRepo.sha) srcList.appendChild(el("li", { class: "status-row", dataset: { item: "", category: "info", search: "course website source commit github" } }, [icon("globe"), el("span", null, [el("strong", { text: "Course website source" }), ` — last commit ${status.courseRepo.committedAt ? fmtStamp.format(new Date(status.courseRepo.committedAt)) : "?"} ET (${status.courseRepo.sha.slice(0, 7)}) · `, linkEl({ href: status.courseRepo.url, label: "commit history" }, "inline-link")])]));
    if (status.validation && status.validation.ok === false) srcList.appendChild(el("li", { class: "status-row status-bad" }, [icon("alert"), el("span", { text: "The last check failed validation, so the previous data is still shown: " + (status.validation.problems || []).join("; ") })]));
    const changeList = $("#change-list"); changeList.textContent = "";
    if (!changes.length) changeList.appendChild(el("li", { class: "fine-print", text: "No changes recorded yet." }));
    changes.slice(0, 8).forEach((entry) => {
      const items = entry.items || [];
      changeList.appendChild(el("li", { class: "change-entry", dataset: { item: "", category: "info", search: searchText("what changed update", items) } }, [el("p", { class: "change-when" }, [icon("clock"), ` ${fmtStamp.format(new Date(entry.detectedAt))} ET`]), el("ul", null, items.slice(0, 8).map((i) => el("li", { text: i })).concat(items.length > 8 ? [el("li", { class: "fine-print", text: `+${items.length - 8} more` })] : []))]));
    });
    $("#updates-intro").textContent = status.lastRunAt ? `A background job re-reads the official course pages several times a day and publishes any change here. Last run: ${fmtStamp.format(new Date(status.lastRunAt))} ET.` : "The background update job has not run yet.";
  }

  function renderSources() {
    const list = $("#source-list"); list.textContent = "";
    DATA.SOURCES.forEach((s) => list.appendChild(el("li", { dataset: { item: "", category: "info", search: searchText("official source", DATA.LINKS[s.key].label, s.note) } }, [linkEl({ key: s.key }, "link source-link"), el("span", { class: "source-note", text: s.note })])));
  }
  function renderQuestions() { const list = $("#question-list"); DATA.QUESTIONS.forEach((q) => list.appendChild(el("li", null, [el("a", { href: "#" + q.target, class: "question-chip" }, [q.q])]))); }
  function renderFilters() {
    const row = $("#filter-row");
    row.appendChild(el("button", { type: "button", class: "filter-chip filter-all", "aria-pressed": "true", dataset: { filter: "all" }, text: "All" }));
    FILTER_KEYS.forEach((key) => row.appendChild(el("button", { type: "button", class: "filter-chip filter-" + key, "aria-pressed": "false", dataset: { filter: key } }, [el("span", { class: "dot", "aria-hidden": "true" }), DATA.CATEGORIES[key].label])));
  }

  function renderAll() {
    buildModel();
    renderHero(); renderFocus(); renderDays(); renderWeek(); renderChecklist(); renderAnnouncements(); renderToolbox(); renderGrading(); renderLab(); renderSoftware(); renderAI(); renderMissed(); renderUpdates(); renderSources();
    updateProgress(); updateClock(); applyFilters();
  }

  /* ---------- progress & checkmarks ---------- */

  function urgentTasks() { return model.urgent || []; }
  function updateProgress() {
    const urgent = urgentTasks(); const done = urgent.filter((t) => state.done[t.id]).length; const total = urgent.length;
    $("#progress-label").textContent = total ? done + " of " + total + " items done" + (done === total ? " — all set" : "") : "Nothing urgent right now";
    const bar = $("#progress-bar"); bar.setAttribute("aria-valuemax", String(total)); bar.setAttribute("aria-valuenow", String(done)); bar.setAttribute("aria-valuetext", done + " of " + total + " urgent items done");
    $("#progress-fill").style.width = (total ? Math.round((done / total) * 100) : 0) + "%";
    bar.classList.toggle("complete", total > 0 && done === total);
  }
  function setDone(taskId, isDone, announce) {
    if (isDone) state.done[taskId] = true; else delete state.done[taskId];
    storage.set(DONE_KEY, state.done);
    $$('[data-task-check="' + taskId + '"]').forEach((input) => { input.checked = isDone; });
    $$('[data-task="' + taskId + '"]').forEach((node) => node.classList.toggle("done", isDone));
    updateProgress();
    if (announce) { const urgent = urgentTasks(); const done = urgent.filter((t) => state.done[t.id]).length; say((isDone ? "Done: " : "Not done: ") + ((model.byId[taskId] && model.byId[taskId].title) || taskId) + ". " + done + " of " + urgent.length + " urgent items complete."); }
  }
  function resetProgress() {
    state.done = {}; storage.remove(DONE_KEY);
    $$("[data-task-check]").forEach((input) => { input.checked = false; });
    $$("[data-task]").forEach((node) => node.classList.remove("done"));
    updateProgress(); say("Progress reset. All items are unchecked.");
  }
  function say(message) { const node = $("#announcer"); node.textContent = ""; window.setTimeout(() => { node.textContent = message; }, 30); }

  /* ---------- collapsible sections ---------- */

  function setExpanded(section, expanded, persist) {
    const button = $(".disclosure", section); const body = $(".panel-body", section);
    if (!button || !body) return;
    button.setAttribute("aria-expanded", expanded ? "true" : "false"); body.hidden = !expanded; section.classList.toggle("collapsed", !expanded);
    if (persist) { if (expanded) state.collapsed.delete(section.id); else state.collapsed.add(section.id); storage.set(COLLAPSED_KEY, Array.from(state.collapsed)); }
  }
  function expandHashTarget() { const target = document.getElementById(window.location.hash.slice(1)); if (target && target.hasAttribute("data-section")) setExpanded(target, true, true); }
  function initSections() {
    $$("[data-section]").forEach((section) => {
      setExpanded(section, !state.collapsed.has(section.id), false);
      $(".disclosure", section).addEventListener("click", () => setExpanded(section, $(".disclosure", section).getAttribute("aria-expanded") !== "true", true));
    });
    $("#expand-all").addEventListener("click", () => { $$("[data-section]").forEach((s) => setExpanded(s, true, true)); say("All sections expanded."); });
    $("#collapse-all").addEventListener("click", () => { $$("[data-section]").forEach((s) => setExpanded(s, false, true)); say("All sections collapsed."); });
    document.addEventListener("click", (event) => { const link = event.target.closest('a[href^="#"]'); if (!link) return; const target = document.getElementById(link.getAttribute("href").slice(1)); if (target && target.hasAttribute("data-section")) setExpanded(target, true, true); });
    window.addEventListener("hashchange", expandHashTarget);
  }

  /* ---------- search & filters ---------- */

  function normalize(text) { return (text || "").toLowerCase().trim().replace(/\s+/g, " "); }
  function applyFilters() {
    const q = normalize(state.query); const cats = state.activeCategories.size ? state.activeCategories : null; const active = Boolean(q) || Boolean(cats);
    let total = 0, visible = 0;
    $$("[data-item]").forEach((item) => { total++; const show = (!q || (item.dataset.search || "").includes(q)) && (!cats || cats.has(item.dataset.category)); item.hidden = !show; if (show) visible++; });
    $$("[data-group]").forEach((group) => { const items = $$("[data-item]", group); group.hidden = items.length > 0 && items.every((i) => i.hidden); });
    $$("[data-section]").forEach((section) => {
      const items = $$("[data-item]", section); const shown = items.filter((i) => !i.hidden).length; const empty = $(".section-empty", section);
      if (empty) empty.hidden = !(active && items.length > 0 && shown === 0);
      section.classList.toggle("no-matches", active && items.length > 0 && shown === 0);
      if (active && shown > 0 && state.collapsed.has(section.id)) setExpanded(section, true, false);
      if (!active) setExpanded(section, !state.collapsed.has(section.id), false);
    });
    const globalEmpty = $("#global-empty"); globalEmpty.hidden = !(active && visible === 0);
    if (!globalEmpty.hidden) {
      const text = $("#global-empty-text"); text.textContent = "";
      if (q) append(text, ["Nothing matches ", el("b", { text: "“" + state.query.trim() + "”" }), ". Try a shorter word like ", el("b", { text: "quiz" }), ", ", el("b", { text: "homework" }), ", or ", el("b", { text: "Navigate" }), cats ? ", or show all categories." : "."]);
      else text.textContent = "Nothing is tagged with the selected categories. Show all categories to see everything.";
    }
    const status = $("#results-status");
    status.textContent = !active ? "" : visible + " of " + total + " items shown" + (q ? " for “" + state.query.trim() + "”" : "") + (cats ? " · " + Array.from(cats).map((c) => DATA.CATEGORIES[c].label).join(", ") : "");
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

  /* ---------- nav, clock, checks ---------- */

  function initNav() {
    const toggle = $(".nav-toggle"); const nav = $("#site-nav");
    const close = () => { toggle.setAttribute("aria-expanded", "false"); nav.classList.remove("open"); };
    toggle.addEventListener("click", () => { const open = toggle.getAttribute("aria-expanded") === "true"; toggle.setAttribute("aria-expanded", open ? "false" : "true"); nav.classList.toggle("open", !open); if (!open) { const first = $("a", nav); if (first) first.focus(); } });
    nav.addEventListener("click", (event) => { if (event.target.closest("a")) close(); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape" && nav.classList.contains("open")) { close(); toggle.focus(); } });
    document.addEventListener("click", (event) => { if (nav.classList.contains("open") && !event.target.closest(".topbar")) close(); });
    if ("IntersectionObserver" in window) {
      const links = $$("a", nav);
      const observer = new IntersectionObserver((entries) => { entries.forEach((entry) => { if (!entry.isIntersecting) return; links.forEach((a) => a.toggleAttribute("aria-current", a.getAttribute("href") === "#" + entry.target.id)); }); }, { rootMargin: "-40% 0px -55% 0px" });
      $$("[data-section]").forEach((s) => observer.observe(s));
    }
  }
  function updateClock() {
    state.now = new Date();
    $("#today").textContent = "Today is " + fmtLongDay.format(state.now) + " · " + fmtTime.format(state.now) + " ET. All times are New York time.";
    $$("[data-due]").forEach((chip) => { const rel = relativeLabel(chip.dataset.due, state.now); const em = $(".due-rel", chip); if (em) em.textContent = rel ? " · " + rel : ""; chip.classList.toggle("passed", rel === "passed"); });
    // A new day in New York: rebuild everything so the page rotates on its own.
    if (model.todayIso && nyIso(state.now) !== model.todayIso) renderAll();
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
    register({ name: "read_course_summary", title: "Read course summary", description: "Read the CSCI 127 hub's urgent items, today's plan and source-of-truth links without changing the page.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute() { return { course: DATA.meta.course, today: model.todayIso, urgent: urgentTasks().map((t) => ({ id: t.id, title: t.title, completed: Boolean(state.done[t.id]), due: dueText(t) })), week: model.currentWeek ? { n: model.currentWeek.n, topics: model.currentWeek.topics } : null, sources: ["brightspace", "gradescope", "site", "calendar"].map((key) => ({ label: DATA.LINKS[key].label, href: DATA.LINKS[key].href })) }; } });
    register({ name: "show_course_information", title: "Show course information", description: "Search and filter the visible hub so matching course information is shown.", inputSchema: { type: "object", properties: { query: { type: "string" }, categories: { type: "array", items: { type: "string", enum: FILTER_KEYS }, uniqueItems: true } }, required: ["query"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) { if (!input || typeof input.query !== "string") throw new Error("query must be a string"); const categories = input.categories === undefined ? [] : input.categories; if (!Array.isArray(categories) || categories.some((k) => !FILTER_KEYS.includes(k))) throw new Error("categories contains an unknown value"); state.query = input.query.trim(); state.activeCategories = new Set(categories); $("#search").value = state.query; syncFilterButtons(); applyFilters(); return { query: state.query, categories, visibleItems: $$("[data-item]").filter((i) => !i.hidden).length }; } });
    register({ name: "update_course_task_progress", title: "Update course task progress", description: "Mark checklist items complete or incomplete in this browser.", inputSchema: { type: "object", properties: { updates: { type: "array", minItems: 1, items: { type: "object", properties: { taskId: { type: "string" }, completed: { type: "boolean" } }, required: ["taskId", "completed"], additionalProperties: false } } }, required: ["updates"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) { if (!input || !Array.isArray(input.updates) || !input.updates.length) throw new Error("updates must contain at least one task"); input.updates.forEach((u) => { if (!u || !model.byId[u.taskId] || typeof u.completed !== "boolean") throw new Error("each update needs a valid taskId and completed boolean"); }); input.updates.forEach((u) => setDone(u.taskId, u.completed, false)); const urgent = urgentTasks(); return { updated: input.updates.map((u) => ({ taskId: u.taskId, title: model.byId[u.taskId].title, completed: u.completed })), urgentCompleted: urgent.filter((t) => state.done[t.id]).length, urgentTotal: urgent.length }; } });
    window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
  }

  /* ---------- boot ---------- */

  function boot() {
    document.documentElement.classList.add("js");
    if (!COURSE) $("#no-course-data").hidden = false;
    renderQuestions(); renderFilters();
    renderAll();
    initSections(); initSearch(); initFilters(); initNav(); initChecks(); initWebMCP();
    expandHashTarget();
    window.setInterval(updateClock, 60000);
    $("#last-reviewed").textContent = fmtFull.format(new Date(DATA.meta.lastReviewed + "T12:00:00-04:00"));
  }
  boot();
})();
