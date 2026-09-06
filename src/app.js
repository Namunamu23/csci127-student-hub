/*
  CSCI 127 Student Hub — page behaviour.
  Renders everything from data.js, keeps checkmarks and collapsed sections in
  localStorage (this browser only), and powers search, filters, and progress.
  No network requests, no analytics, no personal data.
*/
(function () {
  "use strict";

  const DATA = window.CSCI127_DATA;
  if (!DATA) return;

  const TZ = DATA.meta.timeZone || "America/New_York";
  const DONE_KEY = "csci127hub.done.v1";
  const COLLAPSED_KEY = "csci127hub.collapsed.v1";
  const FILTER_KEYS = Object.keys(DATA.CATEGORIES);

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
        else if (key === "html") node.innerHTML = value;
        else if (key === "dataset") Object.assign(node.dataset, value);
        else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value === true ? "" : value);
      }
    }
    append(node, children);
    return node;
  }

  function append(node, children) {
    if (children === undefined || children === null) return node;
    (Array.isArray(children) ? children : [children]).forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });
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
    get(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (_) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch (_) {
        /* private mode or storage blocked: the page still works for this visit */
      }
    },
    remove(key) {
      try { window.localStorage.removeItem(key); } catch (_) { /* ignore */ }
    }
  };

  /* ---------- dates (always shown in New York time) ---------- */

  const fmtDay = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
  const fmtLongDay = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "long", month: "long", day: "numeric" });
  const fmtTime = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
  const fmtParts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric" });

  function nyDayNumber(date) {
    const parts = {};
    fmtParts.formatToParts(date).forEach((p) => { if (p.type !== "literal") parts[p.type] = Number(p.value); });
    return Date.UTC(parts.year, parts.month - 1, parts.day) / 86400000;
  }

  function relativeLabel(iso, now) {
    const target = new Date(iso);
    if (Number.isNaN(target.getTime())) return "";
    const diffMs = target - now;
    if (diffMs < 0) return "passed";
    const dayDiff = nyDayNumber(target) - nyDayNumber(now);
    if (dayDiff <= 0) {
      const hours = Math.floor(diffMs / 3600000);
      if (hours < 1) return "in " + Math.max(1, Math.round(diffMs / 60000)) + " min";
      return "in " + hours + " h";
    }
    if (dayDiff === 1) return "tomorrow";
    return "in " + dayDiff + " days";
  }

  function dueText(task) {
    if (task.start && task.due) {
      return fmtDay.format(new Date(task.start)) + " · " + fmtTime.format(new Date(task.start)) + "–" + fmtTime.format(new Date(task.due)) + " ET";
    }
    if (task.dueLabel) return task.dueLabel;
    if (task.due) return "Due " + fmtDay.format(new Date(task.due)) + " · " + fmtTime.format(new Date(task.due)) + " ET";
    return "";
  }

  /* ---------- links ---------- */

  function resolveLink(spec) {
    if (!spec) return null;
    const base = spec.key ? DATA.LINKS[spec.key] : null;
    if (spec.key && !base) return null;
    return { href: spec.href || base.href, label: spec.label || (base && base.label) || spec.href };
  }

  function linkEl(spec, className) {
    const link = resolveLink(spec);
    if (!link) return null;
    const isMail = link.href.startsWith("mailto:");
    const a = el("a", { href: link.href, class: className || "link" }, [link.label]);
    if (!isMail) {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
      a.appendChild(icon("external", "ext"));
      a.appendChild(el("span", { class: "sr-only", text: " (opens in a new tab)" }));
    } else {
      a.appendChild(icon("mail", "ext"));
    }
    return a;
  }

  function linkRow(specs, className) {
    if (!specs || !specs.length) return null;
    return el("div", { class: className || "links" }, specs.map((s) => linkEl(s)));
  }

  function tag(category) {
    const cat = DATA.CATEGORIES[category];
    if (!cat) return null;
    return el("span", { class: "tag tag-" + category, text: cat.label });
  }

  function verifyTag() {
    return el("span", { class: "tag tag-verify", title: "Needs verification" }, [icon("info"), "Verify"]);
  }

  function placeChip(whereKey) {
    const place = DATA.PLACES[whereKey];
    if (!place) return null;
    return el("span", { class: "meta-chip where" }, [icon(place.icon || "pin"), place.label]);
  }

  function searchText() {
    return Array.from(arguments).flat(Infinity).filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, " ");
  }

  function linkLabels(specs) {
    return (specs || []).map((s) => { const l = resolveLink(s); return l ? l.label : ""; });
  }

  /* ---------- state ---------- */

  const state = {
    done: storage.get(DONE_KEY, {}),
    collapsed: new Set(storage.get(COLLAPSED_KEY, [])),
    activeCategories: new Set(),
    query: "",
    now: new Date()
  };
  if (typeof state.done !== "object" || state.done === null) state.done = {};

  const taskById = {};
  const titleById = {};
  DATA.TASKS.forEach((t) => { taskById[t.id] = t; titleById[t.id] = t.title; });

  /* ---------- rendering: tasks ---------- */

  function checkbox(taskId, suffix) {
    const input = el("input", { type: "checkbox", class: "check", id: "task-" + taskId + "-" + suffix, dataset: { taskCheck: taskId } });
    input.checked = Boolean(state.done[taskId]);
    return input;
  }

  function taskItem(task, suffix, compact) {
    const inputId = "task-" + task.id + "-" + suffix;
    const place = DATA.PLACES[task.where];
    const due = dueText(task);
    const li = el("li", {
      class: "task-item cat-" + task.category + (state.done[task.id] ? " done" : "") + (task.urgent ? " urgent" : ""),
      dataset: {
        item: "", category: task.category, task: task.id,
        search: searchText(task.title, task.summary, task.steps, due, task.dueLabel, place && place.label, DATA.CATEGORIES[task.category].label, task.urgent ? "urgent this week" : "", linkLabels(task.links), task.verify ? "verify" : "")
      }
    });

    const meta = el("div", { class: "task-meta" }, [
      tag(task.category),
      due ? el("span", { class: "meta-chip due", dataset: task.due ? { due: task.due } : {} }, [icon("clock"), el("span", { class: "due-text", text: due }), el("em", { class: "due-rel" })]) : null,
      placeChip(task.where),
      task.verify ? verifyTag() : null
    ]);

    const title = el("h3", { class: "task-title" }, [el("label", { for: inputId, text: task.title })]);
    const body = el("div", { class: "task-body" }, [meta, title]);
    if (task.summary) body.appendChild(el("p", { class: "task-summary", text: task.summary }));

    if ((task.steps && task.steps.length) || task.verify) {
      const details = el("details", { class: "task-details" }, [
        el("summary", null, [icon("chevron", "chevron"), task.steps && task.steps.length ? "How to do it" : "Details"])
      ]);
      if (task.steps && task.steps.length) details.appendChild(el("ol", { class: "steps" }, task.steps.map((s) => el("li", { text: s }))));
      if (task.verify) details.appendChild(el("p", { class: "verify-note" }, [icon("info"), el("span", { text: task.verify })]));
      body.appendChild(details);
    }
    const links = linkRow(task.links, "task-links");
    if (links) body.appendChild(links);

    li.appendChild(el("div", { class: "task-check" }, [checkbox(task.id, suffix)]));
    li.appendChild(body);
    if (compact) li.classList.add("compact");
    return li;
  }

  function renderFocus() {
    const before = $("#focus-before");
    const tuesday = $("#focus-tuesday");
    DATA.TASKS.filter((t) => t.urgent).forEach((task) => {
      const target = task.day === "tuesday" ? tuesday : before;
      target.appendChild(taskItem(task, "focus", true));
    });
    $("#focus-window").textContent = DATA.meta.focus.label;
    $$(".focus-group").forEach((g) => { g.dataset.group = ""; });
  }

  function renderChecklist() {
    const list = $("#task-list");
    const groups = [
      { label: "This week · " + DATA.meta.focus.label, test: (t) => t.urgent },
      { label: "Next week", test: (t) => !t.urgent && (Boolean(t.due) || t.week === "next") },
      { label: "Ongoing", test: (t) => !t.urgent && !t.due && t.week !== "next" }
    ];
    groups.forEach((group) => {
      const tasks = DATA.TASKS.filter(group.test);
      if (!tasks.length) return;
      const wrapper = el("li", { class: "task-group", dataset: { group: "" } }, [
        el("h3", { class: "group-title", text: group.label }),
        el("ol", { class: "task-list" }, tasks.map((t) => taskItem(t, "full", false)))
      ]);
      list.appendChild(wrapper);
    });

    const legend = $("#category-legend");
    FILTER_KEYS.forEach((key) => {
      legend.appendChild(el("span", { class: "legend-item" }, [tag(key), el("span", { class: "legend-hint", text: DATA.CATEGORIES[key].hint })]));
    });
  }

  /* ---------- rendering: Monday & Tuesday ---------- */

  function renderMonday() {
    const m = DATA.MONDAY;
    $("#monday-headline").textContent = m.headline;
    m.closed.forEach((t) => $("#monday-closed").appendChild(el("li", { text: t, dataset: { item: "", category: "info", search: searchText("monday labor day closed", t) } })));
    m.open.forEach((t) => $("#monday-open").appendChild(el("li", { text: t, dataset: { item: "", category: "info", search: searchText("monday labor day open online", t) } })));
    m.plan.forEach((step) => {
      const task = step.taskId ? taskById[step.taskId] : null;
      const checkId = task ? task.id : step.id;
      if (!task && step.id) titleById[step.id] = step.title;
      const inputId = "task-" + checkId + "-monday";
      const category = task ? task.category : (step.category || "recommended");
      const li = el("li", {
        class: "plan-item" + (state.done[checkId] ? " done" : ""),
        dataset: { item: "", category: category, task: checkId, search: searchText("monday plan", step.title, step.detail, task && task.title, DATA.CATEGORIES[category].label) }
      });
      li.appendChild(el("div", { class: "task-check" }, [checkbox(checkId, "monday")]));
      li.appendChild(el("div", { class: "plan-body" }, [
        el("h4", { class: "plan-title" }, [el("label", { for: inputId, text: step.title })]),
        el("p", { class: "plan-detail", text: step.detail }),
        tag(category)
      ]));
      $("#monday-plan").appendChild(li);
    });
    const links = $("#monday-links");
    links.textContent = "Source: ";
    m.links.forEach((l) => links.appendChild(linkEl(l)));
  }

  function renderTuesday() {
    const t = DATA.TUESDAY;
    $("#tuesday-intro").textContent = t.intro;
    t.timeline.forEach((entry) => {
      const task = entry.taskId ? taskById[entry.taskId] : null;
      const inputId = task ? "task-" + task.id + "-tuesday" : null;
      const li = el("li", {
        class: "timeline-item cat-" + entry.category + (task && state.done[task.id] ? " done" : ""),
        dataset: { item: "", category: entry.category, task: task ? task.id : "", search: searchText("tuesday", entry.time, entry.title, entry.detail, entry.verify ? "verify" : "", DATA.PLACES[entry.where] && DATA.PLACES[entry.where].label, DATA.CATEGORIES[entry.category].label, linkLabels(entry.links)) }
      });
      li.appendChild(el("div", { class: "timeline-time" }, [icon("clock"), entry.time]));
      const body = el("div", { class: "timeline-body" });
      const head = el("div", { class: "timeline-head" });
      if (task) {
        head.appendChild(el("div", { class: "task-check" }, [checkbox(task.id, "tuesday")]));
        head.appendChild(el("h4", { class: "timeline-title" }, [el("label", { for: inputId, text: entry.title })]));
      } else {
        head.appendChild(el("h4", { class: "timeline-title", text: entry.title }));
      }
      body.appendChild(head);
      body.appendChild(el("div", { class: "task-meta" }, [tag(entry.category), placeChip(entry.where), entry.verify ? verifyTag() : null]));
      body.appendChild(el("p", { class: "timeline-detail", text: entry.detail }));
      if (entry.verify) body.appendChild(el("p", { class: "verify-note" }, [icon("info"), el("span", { text: entry.verify })]));
      const links = linkRow(entry.links, "task-links");
      if (links) body.appendChild(links);
      li.appendChild(body);
      $("#tuesday-timeline").appendChild(li);
    });
    t.bring.forEach((b) => {
      $("#tuesday-bring").appendChild(el("li", { dataset: { item: "", category: "info", search: searchText("tuesday bring prepare", b.item, b.why) } }, [
        icon("check"),
        el("div", null, [el("strong", { text: b.item }), el("span", { class: "bring-why", text: b.why })])
      ]));
    });
  }

  /* ---------- rendering: toolbox, grading, lab, software, AI, missed, sources ---------- */

  function renderToolbox() {
    const grid = $("#toolbox-grid");
    DATA.TOOLBOX.forEach((tool) => {
      grid.appendChild(el("li", { class: "card cat-" + tool.category, dataset: { item: "", category: tool.category, search: searchText(tool.name, tool.use, tool.when, DATA.CATEGORIES[tool.category].label, linkLabels(tool.links)) } }, [
        el("div", { class: "card-head" }, [icon(tool.icon || "globe", "card-icon"), el("h3", { class: "card-title", text: tool.name }), tag(tool.category)]),
        el("p", { class: "card-use" }, [el("strong", { text: "Use it for: " }), tool.use]),
        el("p", { class: "card-when" }, [icon("clock"), el("span", null, [el("strong", { text: "When: " }), tool.when])]),
        linkRow(tool.links, "card-links")
      ]));
    });
  }

  function renderGrading() {
    const g = DATA.GRADING;
    const list = $("#grading-weights");
    g.weights.forEach((w) => {
      list.appendChild(el("li", { class: "weight", dataset: { item: "", category: "info", search: searchText("grading weight percent", w.label, w.percent + "%", w.note) } }, [
        el("div", { class: "weight-row" }, [
          el("span", { class: "weight-label", text: w.label }),
          el("span", { class: "weight-bar", "aria-hidden": "true" }, [el("span", { class: "weight-fill", style: "width:" + w.percent + "%" })]),
          el("span", { class: "weight-pct", text: w.percent + "%" })
        ]),
        el("p", { class: "weight-note", text: w.note })
      ]));
    });
    $("#grading-final-rule").textContent = g.finalRule;
    $("#grading-extra").textContent = g.extraCredit;
    const ruleCard = $("#grading-final-rule").closest(".info-card");
    Object.assign(ruleCard.dataset, { item: "", category: "info", search: searchText("pass final exam 60 points rule", g.finalRule) });
    Object.assign($("#grading-extra-card").dataset, { item: "", category: "extra", search: searchText("extra credit early quiz code review", g.extraCredit) });
    const dl = $("#grading-final");
    const f = g.finalExam;
    [["When", f.when], ["Where", f.where], ["Format", f.format], ["Preparation", f.prep]].forEach(([k, v]) => {
      dl.appendChild(el("dt", { text: k }));
      dl.appendChild(el("dd", { text: v }));
    });
    if (f.verify) {
      dl.appendChild(el("dt", null, [verifyTag()]));
      dl.appendChild(el("dd", { class: "verify-note", text: f.verify }));
    }
    Object.assign($("#grading-final-card").dataset, { item: "", category: "info", search: searchText("final exam december mock exam", f.when, f.where, f.format, f.prep, f.verify ? "verify" : "") });
    const src = el("p", { class: "fine-print" }, ["Source: ", linkEl(g.source)]);
    $("#grading-body").appendChild(src);
  }

  function renderLab() {
    const lab = DATA.LAB;
    const where = $("#lab-where");
    where.appendChild(el("h3", null, [icon("pin"), " Where and when"]));
    where.appendChild(el("p", { class: "lab-room", text: lab.room }));
    where.appendChild(el("p", { class: "lab-floor", text: lab.where }));
    where.appendChild(el("p", { class: "lab-hours" }, [icon("clock"), el("span", { text: lab.hours }), lab.hoursVerify ? verifyTag() : null]));
    if (lab.hoursVerify) where.appendChild(el("p", { class: "verify-note" }, [icon("info"), el("span", { text: lab.hoursVerify })]));
    where.appendChild(el("p", { class: "fine-print", text: lab.opened }));
    Object.assign(where.dataset, { item: "", category: "info", search: searchText("lab location hours 1001E north building", lab.room, lab.where, lab.hours, lab.opened) });
    lab.services.forEach((s) => $("#lab-services").appendChild(el("li", { text: s, dataset: { item: "", category: "info", search: searchText("lab services tutoring", s) } })));
    lab.closures.forEach((c) => {
      $("#lab-closures").appendChild(el("li", { dataset: { item: "", category: "info", search: searchText("lab closed closure", c.date, c.text, c.verify ? "verify" : "") } }, [
        el("strong", { text: c.date + ": " }), c.text, c.verify ? el("span", { class: "verify-inline" }, [" ", verifyTag(), " ", el("span", { text: c.verify })]) : null
      ]));
    });
    const links = $("#lab-links");
    lab.links.forEach((l) => links.appendChild(linkEl(l)));
  }

  function renderSoftware() {
    const root = $("#software-phases");
    DATA.SOFTWARE.forEach((phase, index) => {
      const section = el("section", { class: "phase" + (index === 0 ? " phase-now" : ""), dataset: { group: "" }, "aria-labelledby": "phase-" + index });
      section.appendChild(el("h3", { class: "phase-title", id: "phase-" + index }, [icon(index === 0 ? "sparkle" : "calendar"), phase.phase]));
      section.appendChild(el("ul", { class: "software-list" }, phase.items.map((item) => el("li", { class: "software-item cat-" + item.category, dataset: { item: "", category: item.category, search: searchText("software tools install", phase.phase, item.name, item.why, DATA.CATEGORIES[item.category].label, linkLabels(item.links)) } }, [
        el("div", { class: "software-head" }, [el("h4", { class: "software-name", text: item.name }), tag(item.category)]),
        el("p", { class: "software-why", text: item.why }),
        linkRow(item.links, "task-links")
      ]))));
      root.appendChild(section);
    });
  }

  function renderAI() {
    const ai = DATA.AI_POLICY;
    ai.allowed.forEach((t) => $("#ai-allowed").appendChild(el("li", { text: t, dataset: { item: "", category: "info", search: searchText("ai policy allowed chatgpt copilot", t) } })));
    ai.notAllowed.forEach((t) => $("#ai-not-allowed").appendChild(el("li", { text: t, dataset: { item: "", category: "info", search: searchText("ai policy not allowed cheating plagiarism", t) } })));
    $("#ai-consequences").textContent = ai.consequences;
    Object.assign($("#ai-consequences-card").dataset, { item: "", category: "info", search: searchText("academic integrity consequences cheating plagiarism", ai.consequences) });
    const src = $("#ai-source");
    src.textContent = "Source: ";
    src.appendChild(linkEl(ai.source));
  }

  function renderMissed() {
    DATA.POSSIBLY_MISSED.forEach((m) => {
      $("#missed-list").appendChild(el("li", { class: "missed-item cat-" + m.category, dataset: { item: "", category: m.category, search: searchText("missed check", m.title, m.check, DATA.CATEGORIES[m.category].label, linkLabels(m.links)) } }, [
        el("div", { class: "missed-head" }, [icon("help", "missed-icon"), el("h3", { class: "missed-title", text: m.title }), tag(m.category)]),
        el("p", { class: "missed-check", text: m.check }),
        linkRow(m.links, "task-links")
      ]));
    });
  }

  function renderSources() {
    DATA.SOURCES.forEach((s) => {
      $("#source-list").appendChild(el("li", { dataset: { item: "", category: "info", search: searchText("official source", DATA.LINKS[s.key].label, s.note) } }, [
        linkEl({ key: s.key }, "link source-link"), el("span", { class: "source-note", text: s.note })
      ]));
    });
  }

  function renderQuestions() {
    const list = $("#question-list");
    DATA.QUESTIONS.forEach((q) => {
      list.appendChild(el("li", null, [el("a", { href: "#" + q.target, class: "question-chip" }, [q.q])]));
    });
  }

  function renderFilters() {
    const row = $("#filter-row");
    const all = el("button", { type: "button", class: "filter-chip filter-all", "aria-pressed": "true", dataset: { filter: "all" }, text: "All" });
    row.appendChild(all);
    FILTER_KEYS.forEach((key) => {
      row.appendChild(el("button", { type: "button", class: "filter-chip filter-" + key, "aria-pressed": "false", dataset: { filter: key } }, [el("span", { class: "dot", "aria-hidden": "true" }), DATA.CATEGORIES[key].label]));
    });
  }

  /* ---------- progress & checkmarks ---------- */

  function urgentTasks() { return DATA.TASKS.filter((t) => t.urgent); }

  function updateProgress() {
    const urgent = urgentTasks();
    const done = urgent.filter((t) => state.done[t.id]).length;
    const total = urgent.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    $("#progress-label").textContent = done + " of " + total + " urgent tasks done" + (total && done === total ? " — all set for Tuesday" : "");
    const bar = $("#progress-bar");
    bar.setAttribute("aria-valuemax", String(total));
    bar.setAttribute("aria-valuenow", String(done));
    bar.setAttribute("aria-valuetext", done + " of " + total + " urgent tasks done");
    $("#progress-fill").style.width = pct + "%";
    bar.classList.toggle("complete", total > 0 && done === total);
  }

  function setDone(taskId, isDone, announce) {
    if (isDone) state.done[taskId] = true; else delete state.done[taskId];
    storage.set(DONE_KEY, state.done);
    $$('[data-task-check="' + taskId + '"]').forEach((input) => { input.checked = isDone; });
    $$('[data-task="' + taskId + '"]').forEach((node) => node.classList.toggle("done", isDone));
    updateProgress();
    if (announce) {
      const urgent = urgentTasks();
      const done = urgent.filter((t) => state.done[t.id]).length;
      say((isDone ? "Done: " : "Not done: ") + (titleById[taskId] || taskId) + ". " + done + " of " + urgent.length + " urgent tasks complete.");
    }
  }

  function resetProgress() {
    state.done = {};
    storage.remove(DONE_KEY);
    $$("[data-task-check]").forEach((input) => { input.checked = false; });
    $$("[data-task]").forEach((node) => node.classList.remove("done"));
    updateProgress();
    say("Progress reset. All tasks are unchecked.");
  }

  function say(message) {
    const node = $("#announcer");
    node.textContent = "";
    window.setTimeout(() => { node.textContent = message; }, 30);
  }

  /* ---------- collapsible sections ---------- */

  function setExpanded(section, expanded, persist) {
    const button = $(".disclosure", section);
    const body = $(".panel-body", section);
    if (!button || !body) return;
    button.setAttribute("aria-expanded", expanded ? "true" : "false");
    body.hidden = !expanded;
    section.classList.toggle("collapsed", !expanded);
    if (persist) {
      if (expanded) state.collapsed.delete(section.id); else state.collapsed.add(section.id);
      storage.set(COLLAPSED_KEY, Array.from(state.collapsed));
    }
  }

  function initSections() {
    $$("[data-section]").forEach((section) => {
      setExpanded(section, !state.collapsed.has(section.id), false);
      $(".disclosure", section).addEventListener("click", () => {
        const expanded = $(".disclosure", section).getAttribute("aria-expanded") === "true";
        setExpanded(section, !expanded, true);
      });
    });
    $("#expand-all").addEventListener("click", () => { $$("[data-section]").forEach((s) => setExpanded(s, true, true)); say("All sections expanded."); });
    $("#collapse-all").addEventListener("click", () => { $$("[data-section]").forEach((s) => setExpanded(s, false, true)); say("All sections collapsed."); });

    // Opening a section from the nav or a question chip should expand it.
    document.addEventListener("click", (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      const target = document.getElementById(link.getAttribute("href").slice(1));
      if (target && target.hasAttribute("data-section")) setExpanded(target, true, true);
    });
    if (window.location.hash) {
      const target = document.getElementById(window.location.hash.slice(1));
      if (target && target.hasAttribute("data-section")) setExpanded(target, true, false);
    }
  }

  /* ---------- search & filters ---------- */

  function normalize(text) { return (text || "").toLowerCase().trim().replace(/\s+/g, " "); }

  function applyFilters() {
    const q = normalize(state.query);
    const cats = state.activeCategories.size ? state.activeCategories : null;
    const active = Boolean(q) || Boolean(cats);
    let total = 0;
    let visible = 0;

    $$("[data-item]").forEach((item) => {
      total++;
      const matchQ = !q || (item.dataset.search || "").includes(q);
      const matchC = !cats || cats.has(item.dataset.category);
      const show = matchQ && matchC;
      item.hidden = !show;
      if (show) visible++;
    });

    $$("[data-group]").forEach((group) => {
      const items = $$("[data-item]", group);
      group.hidden = items.length > 0 && items.every((i) => i.hidden);
    });

    $$("[data-section]").forEach((section) => {
      const items = $$("[data-item]", section);
      const shown = items.filter((i) => !i.hidden).length;
      const empty = $(".section-empty", section);
      const hasMatches = shown > 0;
      if (empty) empty.hidden = !(active && items.length > 0 && !hasMatches);
      section.classList.toggle("no-matches", active && items.length > 0 && !hasMatches);
      if (active && hasMatches && state.collapsed.has(section.id)) setExpanded(section, true, false);
      if (!active) setExpanded(section, !state.collapsed.has(section.id), false);
    });

    const globalEmpty = $("#global-empty");
    globalEmpty.hidden = !(active && visible === 0);
    if (!globalEmpty.hidden) {
      $("#global-empty-text").innerHTML = q
        ? "Nothing matches <b></b>. Try a shorter word like <b>quiz</b>, <b>homework</b>, or <b>Navigate</b>" + (cats ? ", or show all categories." : ".")
        : "Nothing is tagged with the selected categories. Show all categories to see everything.";
      const strong = $("#global-empty-text b");
      if (q && strong) strong.textContent = "“" + state.query.trim() + "”";
    }

    const status = $("#results-status");
    if (!active) status.textContent = "";
    else status.textContent = visible + " of " + total + " items shown" + (q ? " for “" + state.query.trim() + "”" : "") + (cats ? " · " + Array.from(cats).map((c) => DATA.CATEGORIES[c].label).join(", ") : "");
    $("#search-clear").hidden = !state.query;
  }

  function initSearch() {
    const input = $("#search");
    let timer = null;
    input.addEventListener("input", () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => { state.query = input.value; applyFilters(); }, 120);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && input.value) { event.preventDefault(); clearSearch(); }
    });
    $("#search-form").addEventListener("submit", (event) => { event.preventDefault(); state.query = input.value; applyFilters(); });
    $("#search-clear").addEventListener("click", () => { clearSearch(); input.focus(); });
    $("#empty-clear-search").addEventListener("click", () => { clearSearch(); input.focus(); });
    $("#empty-clear-filters").addEventListener("click", () => { setFilter("all"); $('[data-filter="all"]').focus(); });

    function clearSearch() { input.value = ""; state.query = ""; applyFilters(); }
  }

  function setFilter(key) {
    if (key === "all") state.activeCategories.clear();
    else if (state.activeCategories.has(key)) state.activeCategories.delete(key);
    else state.activeCategories.add(key);
    syncFilterButtons();
    applyFilters();
  }

  function syncFilterButtons() {
    $$("[data-filter]").forEach((button) => {
      const k = button.dataset.filter;
      const pressed = k === "all" ? state.activeCategories.size === 0 : state.activeCategories.has(k);
      button.setAttribute("aria-pressed", pressed ? "true" : "false");
    });
  }

  function initFilters() {
    $("#filter-row").addEventListener("click", (event) => {
      const button = event.target.closest("[data-filter]");
      if (button) setFilter(button.dataset.filter);
    });
  }

  /* ---------- nav, clock, misc ---------- */

  function initNav() {
    const toggle = $(".nav-toggle");
    const nav = $("#site-nav");
    function close() { toggle.setAttribute("aria-expanded", "false"); nav.classList.remove("open"); }
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", open ? "false" : "true");
      nav.classList.toggle("open", !open);
      if (!open) { const first = $("a", nav); if (first) first.focus(); }
    });
    nav.addEventListener("click", (event) => { if (event.target.closest("a")) close(); });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && nav.classList.contains("open")) { close(); toggle.focus(); }
    });
    document.addEventListener("click", (event) => {
      if (nav.classList.contains("open") && !event.target.closest(".topbar")) close();
    });

    // Highlight the section in view.
    if ("IntersectionObserver" in window) {
      const links = $$("a", nav);
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((a) => a.toggleAttribute("aria-current", a.getAttribute("href") === "#" + entry.target.id));
        });
      }, { rootMargin: "-40% 0px -55% 0px" });
      $$("[data-section]").forEach((s) => observer.observe(s));
    }
  }

  function updateClock() {
    state.now = new Date();
    $("#today").textContent = "Today is " + fmtLongDay.format(state.now) + " · " + fmtTime.format(state.now) + " ET. All times are New York time.";
    $$("[data-due]").forEach((chip) => {
      const rel = relativeLabel(chip.dataset.due, state.now);
      const em = $(".due-rel", chip);
      if (em) em.textContent = rel ? " · " + rel : "";
      chip.classList.toggle("passed", rel === "passed");
    });
    const lastUrgentDue = urgentTasks().map((t) => t.due).filter(Boolean).sort().pop();
    const windowPassed = lastUrgentDue && new Date(lastUrgentDue) < state.now;
    let banner = $("#window-passed");
    if (windowPassed && !banner) {
      banner = el("div", { class: "callout window-passed", id: "window-passed" }, [
        icon("info"),
        el("p", null, ["The ", DATA.meta.focus.label, " window has passed. Check ", linkEl({ key: "gradescope", label: "Gradescope" }), " and ", linkEl({ key: "brightspace", label: "Brightspace" }), " for what was received, then use the checklist below for what comes next."])
      ]);
      $("#first-body").insertBefore(banner, $("#first-body").firstChild);
    }
  }

  function initChecks() {
    document.addEventListener("change", (event) => {
      const input = event.target.closest("[data-task-check]");
      if (!input) return;
      setDone(input.dataset.taskCheck, input.checked, true);
    });

    const resetButton = $("#reset-progress");
    const confirm = $("#reset-confirm");
    resetButton.addEventListener("click", () => {
      confirm.hidden = false;
      resetButton.hidden = true;
      $("#reset-yes").focus();
    });
    $("#reset-yes").addEventListener("click", () => {
      resetProgress();
      confirm.hidden = true;
      resetButton.hidden = false;
      resetButton.focus();
    });
    $("#reset-no").addEventListener("click", () => {
      confirm.hidden = true;
      resetButton.hidden = false;
      resetButton.focus();
    });
    confirm.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { confirm.hidden = true; resetButton.hidden = false; resetButton.focus(); }
    });
  }

  /* ---------- WebMCP: the same journeys as the visible interface ---------- */

  function initWebMCP() {
    const context = document.modelContext;
    if (!context || typeof context.registerTool !== "function") return;

    const lifecycle = new AbortController();
    const register = (tool) => {
      try {
        Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {});
      } catch (_) {
        /* WebMCP is optional; the visible interface remains fully functional. */
      }
    };

    register({
      name: "read_course_summary",
      title: "Read course summary",
      description: "Read the CSCI 127 hub's urgent-task status, Monday closure, Tuesday plan, and source-of-truth links without changing the page.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute() {
        const urgent = urgentTasks();
        return {
          course: DATA.meta.course,
          focus: DATA.meta.focus.label,
          urgent: urgent.map((task) => ({
            id: task.id,
            title: task.title,
            completed: Boolean(state.done[task.id]),
            due: dueText(task)
          })),
          monday: DATA.MONDAY.headline,
          tuesday: DATA.TUESDAY.timeline.map((item) => ({
            time: item.time,
            title: item.title,
            category: item.category
          })),
          sources: ["brightspace", "gradescope", "site", "calendar"].map((key) => ({
            label: DATA.LINKS[key].label,
            href: DATA.LINKS[key].href
          }))
        };
      }
    });

    register({
      name: "show_course_information",
      title: "Show course information",
      description: "Search and filter the visible CSCI 127 hub so matching course information is shown on the page.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Words to find, such as quiz, Navigate, Python, or final exam."
          },
          categories: {
            type: "array",
            description: "Optional course categories to show. An empty array shows every category.",
            items: { type: "string", enum: FILTER_KEYS },
            uniqueItems: true
          }
        },
        required: ["query"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input.query !== "string") throw new Error("query must be a string");
        const categories = input.categories === undefined ? [] : input.categories;
        if (!Array.isArray(categories) || categories.some((key) => !FILTER_KEYS.includes(key))) {
          throw new Error("categories contains an unknown value");
        }
        state.query = input.query.trim();
        state.activeCategories = new Set(categories);
        $("#search").value = state.query;
        syncFilterButtons();
        applyFilters();
        const visible = $$("[data-item]").filter((item) => !item.hidden).length;
        return { query: state.query, categories, visibleItems: visible };
      }
    });

    register({
      name: "update_course_task_progress",
      title: "Update course task progress",
      description: "Mark one or more visible CSCI 127 checklist tasks complete or incomplete and update the saved progress indicator in this browser.",
      inputSchema: {
        type: "object",
        properties: {
          updates: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                taskId: { type: "string", enum: DATA.TASKS.map((task) => task.id) },
                completed: { type: "boolean" }
              },
              required: ["taskId", "completed"],
              additionalProperties: false
            }
          }
        },
        required: ["updates"],
        additionalProperties: false
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || !Array.isArray(input.updates) || input.updates.length === 0) {
          throw new Error("updates must contain at least one task");
        }
        input.updates.forEach((update) => {
          if (!update || !taskById[update.taskId] || typeof update.completed !== "boolean") {
            throw new Error("each update needs a valid taskId and completed boolean");
          }
        });
        input.updates.forEach((update) => setDone(update.taskId, update.completed, false));
        const urgent = urgentTasks();
        return {
          updated: input.updates.map((update) => ({
            taskId: update.taskId,
            title: titleById[update.taskId],
            completed: update.completed
          })),
          urgentCompleted: urgent.filter((task) => state.done[task.id]).length,
          urgentTotal: urgent.length
        };
      }
    });

    window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
  }

  /* ---------- boot ---------- */

  function boot() {
    document.documentElement.classList.add("js");
    renderQuestions();
    renderFilters();
    renderFocus();
    renderChecklist();
    renderMonday();
    renderTuesday();
    renderToolbox();
    renderGrading();
    renderLab();
    renderSoftware();
    renderAI();
    renderMissed();
    renderSources();
    initSections();
    initSearch();
    initFilters();
    initNav();
    initChecks();
    initWebMCP();
    updateProgress();
    updateClock();
    window.setInterval(updateClock, 60000);
    applyFilters();
    const reviewed = new Date(DATA.meta.lastReviewed + "T12:00:00-04:00");
    $("#last-reviewed").textContent = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "long", day: "numeric", year: "numeric" }).format(reviewed);
  }

  boot();
})();
