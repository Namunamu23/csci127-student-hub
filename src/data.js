/*
  CSCI 127 Student Hub — editorial layer (the words people wrote).

  The dates, deadlines, quiz/code-review windows, labs, weekly topics, final
  exam, grading weights and holidays are NOT here: they live in
  src/course.json, which scripts/fetch-course.mjs regenerates from the
  official course pages (see README). The page combines both files and
  decides what is urgent from today's date, so nothing here needs a date.

  HOW TO UPDATE THIS FILE
  - Links: LINKS. Places: PLACES. Category labels: CATEGORIES.
  - Rules that only appear in Brightspace announcements: RULES (cite the
    announcement and set `verify` when unsure).
  - Step-by-step advice for generated tasks: TEMPLATES.
  - Reminders that are not tied to a course deadline: STANDING.
  - Everything else (toolbox, grading notes, lab, software, AI policy,
    sources, questions) is plain text you can edit freely.

  Sources of truth (in order): Brightspace and Gradescope, then the public
  course website (huntercsci127.github.io/f26). Do not add personal grades,
  names, account data, restricted documents, or other student-specific content.
*/
(function () {
  "use strict";

  const LINKS = {
    brightspace: { label: "Brightspace (CSCI 127)", href: "https://brightspace.cuny.edu/d2l/home/1315489" },
    week2Announcement: { label: "Week 2 announcement (Sep 4, Brightspace login)", href: "https://brightspace.cuny.edu/d2l/le/news/1315489/6464172/view" },
    semesterAnnouncement: { label: "Semester-start announcement (Aug 28, Brightspace login)", href: "https://brightspace.cuny.edu/d2l/le/news/1315489/6412497/view" },
    lectureSlides: { label: "Lecture slides (Brightspace login)", href: "https://brightspace.cuny.edu/d2l/common/dialogs/quickLink/quickLink.d2l?ou=1315489&type=content&rcode=553F80D6-3EB2-4A0C-B321-7D8FDFC0E4FA-9219228" },
    gradescope: { label: "Gradescope (CSCI 127)", href: "https://www.gradescope.com/courses/1270901" },
    site: { label: "Course website (Fall 2026)", href: "https://huntercsci127.github.io/f26.html" },
    syllabus: { label: "General syllabus", href: "https://huntercsci127.github.io/f26/syl.html" },
    syllabusHonors: { label: "Honors syllabus", href: "https://huntercsci127.github.io/f26/sylHC.html" },
    homework: { label: "Homework list", href: "https://huntercsci127.github.io/f26/ps.html" },
    calendar: { label: "Coursework calendar", href: "https://huntercsci127.github.io/f26/cw.html#calendar" },
    coursework: { label: "Coursework page", href: "https://huntercsci127.github.io/f26/cw.html" },
    codeReviewInfo: { label: "Code review format", href: "https://huntercsci127.github.io/f26/cw.html#cr" },
    quizInfo: { label: "How quizzes work", href: "https://huntercsci127.github.io/f26/cw.html#quizzes" },
    finalInfo: { label: "Final exam information", href: "https://huntercsci127.github.io/f26/cw.html#final" },
    resources: { label: "Resources page", href: "https://huntercsci127.github.io/f26/resources.html" },
    install: { label: "Installation guides", href: "https://huntercsci127.github.io/f26/resources.html#install" },
    faq: { label: "Course FAQ", href: "https://huntercsci127.github.io/f26/faq.html" },
    lab0: { label: "Lab 0: Setting up", href: "https://huntercsci127.github.io/f26/lab0.html", notice: "Setup guide still shows January dates; use this page's calendar for dates." },
    navigate: { label: "Navigate (book an appointment)", href: "https://hunter-cuny.navigate.eab.com/app/" },
    navigateInfo: { label: "Hunter's Navigate help page", href: "https://www.hunter.cuny.edu/navigate/students/" },
    email: { label: "Email csci127@hunter.cuny.edu", href: "mailto:csci127@hunter.cuny.edu" },
    textbook: { label: "How to Think Like a Computer Scientist (free textbook)", href: "https://runestone.academy/ns/books/published/thinkcspy/index.html" },
    hunterCalendar: { label: "Hunter academic calendar", href: "https://hunter.cuny.edu/students/registration/academic-calendar/" },
    python: { label: "Download Python", href: "https://www.python.org/downloads/" },
    pythonTutor: { label: "Python Tutor", href: "https://pythontutor.com/" },
    asciiTable: { label: "ASCII table (PDF)", href: "https://huntercsci127.github.io/files/ASCIITable.pdf" },
    ubuntuTerminal: { label: "Ubuntu terminal reference", href: "https://help.ubuntu.com/community/UsingTheTerminal" },
    circuitverse: { label: "CircuitVerse simulator", href: "https://circuitverse.org/simulator" },
    pandas10min: { label: "10 minutes to pandas", href: "https://pandas.pydata.org/pandas-docs/stable/user_guide/10min.html" },
    nycOpenData: { label: "NYC Open Data", href: "https://opendata.cityofnewyork.us" },
    plotlyMaps: { label: "Plotly maps", href: "https://plotly.com/python/maps/" },
    wemips: { label: "Course resources: MIPS tools", href: "https://huntercsci127.github.io/f26/resources.html" },
    hrm: { label: "Human Resource Machine (Hour of Code edition)", href: "https://tomorrowcorporation.com/human-resource-machine-hour-of-code-edition" },
    cppTutorial: { label: "C++ tutorial (PDF)", href: "https://cplusplus.com/files/tutorial.pdf" },
    cppTutorialsPoint: { label: "C++ at Tutorials Point", href: "https://www.tutorialspoint.com/cplusplus/index.htm" },
    onlinegdb: { label: "OnlineGDB (C++ examples)", href: "https://onlinegdb.com/" },
    brightspaceSupport: { label: "Hunter Brightspace support", href: "https://hunter.cuny.edu/information-technology/services/accounts-access/brightspace/" },
    courseRepo: { label: "Course website source (GitHub)", href: "https://github.com/HunterCSci127/HunterCSci127.github.io/commits/master" },
    hubRepo: { label: "This hub on GitHub", href: "https://github.com/Namunamu23/csci127-student-hub" },
    addAnnouncement: { label: "Add an announcement (GitHub issue)", href: "https://github.com/Namunamu23/csci127-student-hub/issues/new?template=announcement.yml" }
  };

  const PLACES = {
    gradescope: { label: "Gradescope (online)", icon: "upload", link: "gradescope", campus: false },
    brightspace: { label: "Brightspace (online)", icon: "globe", link: "brightspace", campus: false },
    navigate: { label: "Navigate (online)", icon: "calendar", link: "navigate", campus: false },
    lab: { label: "1001E HN · 10th floor, North Building", icon: "pin", short: "1001E HN", campus: true },
    lecture: { label: "118 HN · Assembly Hall, 1st floor, North Building", icon: "pin", short: "118 HN", campus: true },
    home: { label: "Anywhere (at home)", icon: "home", campus: false },
    web: { label: "Course website (online)", icon: "globe", link: "site", campus: false }
  };

  const CATEGORIES = {
    required: { label: "Required", hint: "Graded, or needed to get graded." },
    recommended: { label: "Recommended", hint: "Not graded on its own, but it makes graded work go better." },
    optional: { label: "Optional", hint: "Helpful if you have time." },
    extra: { label: "Extra credit", hint: "Bonus points on top of the regular grade." }
  };

  /* Rules the page needs that come from announcements or that the public
     pages state loosely. Cite the source; mark `verify` if it may change. */
  const RULES = {
    focusDays: 3,                 // "Do this first" = everything due within this many days
    missedDays: 14,               // "Might have missed" looks back this far
    lecture: { weekday: 2, start: "10:00", end: "11:15", label: "Tuesdays 10:00–11:15 am", where: "lecture" },
    preLecture: { label: "Optional focused review", time: "9:30–10:00 am", where: "lecture", text: "Strategies and sample questions for the upcoming quizzes, in the lecture hall (118 HN). The Sep 4 announcement says these run most Tuesdays through the semester.", source: "week2Announcement", verify: "\"Most Tuesdays\" — a week can be skipped; Brightspace announcements are the source." },
    assessmentDeadline: { time: "17:00", label: "5:00 pm", text: "Quizzes and code reviews must be finished by 5:00 pm on the last day of their window.", source: "week2Announcement", verify: "The Sep 4 announcement set 5 pm for Quiz 1 / Code Review 1; the hub assumes the same for later weeks. The public calendar only gives the end date." },
    labHours: {
      byWeekday: { 1: "11:30 am–5:15 pm", 2: "11:30 am–5:15 pm", 3: "11:30 am–5:15 pm", 4: "11:30 am–5:15 pm", 5: "11:30 am–4:00 pm" },
      text: "Monday–Thursday 11:30 am–5:15 pm; Friday 11:30 am–4:00 pm, when classes meet",
      source: "semesterAnnouncement",
      note: "From the Aug 28 Brightspace announcement. Lab 0 and Lab 1 still say M–F 11:30 am–5 pm; the announcement is newer."
    },
    campusDaysAhead: 3            // day cards to show (today, tomorrow, day after)
  };

  /* Step-by-step advice attached to generated tasks. `item` is the course
     record (homework / window / lab). Keep steps short and concrete. */
  const TEMPLATES = {
    homework: (h) => [
      "Read the description on the homework page; note the allowed libraries" + (h.libraries && h.libraries !== "none" ? " (" + h.libraries + ")" : " (none needed)") + ".",
      "Write and run it locally in IDLE first — Gradescope only says \"failed\" without the line number.",
      "Header comment with your name and email (the course example also has the date). Keep the file name simple, never turtle.py.",
      "Upload the .py file to Gradescope before " + (h.dueLabel || "5 pm") + ". No late homework; you can submit up to three or four weeks early (the pages disagree)."
    ],
    quiz: (w) => [
      "Study the lab it is built from" + (w.quiz.links.length ? ": " + w.quiz.links.map((l) => l.label).join(", ") : "") + ". Practice predicting output on paper.",
      "Book a Navigate slot in 1001E HN; appointments are seen before walk-ins.",
      "Paper only: no notes, books, phones, calculators or smart watches. Bring a pen.",
      "Top 10 quiz scores count and there are no make-ups — take it even if you feel unsure."
    ],
    codeReview: (w) => [
      "Re-type the program from memory in IDLE at home until it feels easy: " + w.codeReview.text + ".",
      "In the lab you code it from scratch in IDLE, explain each decision to a TA, then make a change they ask for.",
      "Same lab and same window as the quiz — many students do both in one visit.",
      "Top 10 code-review scores count; no make-ups."
    ],
    lab: (l) => [
      "Labs are not graded on their own, but the week's quiz and code review are built from them.",
      "Do every exercise; the target date keeps you on pace for the quiz window."
    ],
    lecture: () => [
      "Paper lecture slip solved in pairs or triples — write the names of who you worked with.",
      "Top 10 lecture slips count toward the 10% participation grade; no make-ups."
    ],
    extra: (w) => [
      "Finish before the end date to earn extra credit: 15% three or more days early, 10% two days, 5% one day.",
      "Extra credit applies to the quiz and the code review of that week."
    ],
    final: () => [
      "Closed book except one 8.5×11 two-sided sheet of notes. No electronic devices.",
      "You must score 60 or more to pass the course. Past exams with keys are on the course website."
    ]
  };

  /* Reminders that are not course deadlines. `window` limits when they show
     (ISO dates, optional). `urgent` puts them in "Do this first". */
  const STANDING = [
    {
      id: "access",
      title: "Make sure you can log in to Gradescope and Brightspace",
      category: "required", where: "home", urgent: true,
      window: { end: "2026-09-20" },
      dueLabel: "Do now — needed for everything else",
      summary: "Gradescope invitations went out by Friday, August 28. If you never got one, use the form on Brightspace to be added.",
      steps: ["Open Gradescope and confirm CSCI 127 appears in your courses.", "Open Brightspace and read the announcements posted since mid-August.", "No Gradescope invitation? Fill out the form on Brightspace (preferred email and EmplID)."],
      links: [{ key: "gradescope" }, { key: "brightspace" }, { key: "brightspaceSupport", label: "Brightspace not working?" }]
    },
    {
      id: "announcements",
      title: "Read the latest Brightspace announcements",
      category: "recommended", where: "brightspace", urgent: true, recurring: true,
      dueLabel: "Before each campus day",
      summary: "Brightspace is where the course posts changes, Quiz 0, event lists, and anything the public website does not show. This hub cannot read it for you.",
      links: [{ key: "brightspace", label: "Open Brightspace" }]
    },
    {
      id: "navigate",
      title: "Book a Navigate appointment for your next lab visit",
      category: "recommended", where: "navigate", urgent: true, urgentWhen: "labVisit", recurring: true,
      dueLabel: "Before each quiz / code-review visit",
      summary: "Quizzes and code reviews give first priority to students with Navigate appointments, then walk-ins.",
      links: [{ key: "navigate", label: "Open Navigate" }, { key: "navigateInfo" }]
    },
    {
      id: "events",
      title: "Attend department and Tech Career Center events for bonus participation",
      category: "extra", where: "brightspace",
      dueLabel: "Announced on Brightspace through the term",
      summary: "The syllabus says bonus participation is available for these events; the list is posted on Brightspace.",
      links: [{ key: "brightspace", label: "See the event list on Brightspace" }]
    },
    {
      id: "tutoring",
      title: "Get help from peer mentors in 1001E HN",
      category: "optional", where: "lab",
      dueLabel: "Weekday afternoons when classes are in session",
      summary: "Drop in or book on Navigate. Good for install problems, stuck homework, and practicing before a code review.",
      links: [{ key: "navigate", label: "Book on Navigate" }, { key: "faq", label: "Read the FAQ first" }]
    },
    {
      id: "faq",
      title: "Skim the course FAQ",
      category: "optional", where: "web",
      dueLabel: "Whenever you have 10 minutes",
      summary: "Answers to \"do I have to…\" questions: attendance, late work, extra credit, hours per week, what comes after 127.",
      links: [{ key: "faq", label: "Open the FAQ" }]
    }
  ];

  const CAMPUS_DAY = {
    bring: [
      { item: "A pen or pencil", why: "Lecture slips and quizzes are on paper." },
      { item: "The program in your head, not on paper", why: "No notes are allowed in the quiz or code review. Rehearse until you can re-type it from memory." },
      { item: "Your Navigate confirmation", why: "Appointments are seen first; walk-ins wait." },
      { item: "Nothing electronic on the desk", why: "Phones, laptops, calculators, and smart watches must stay away during the quiz." },
      { item: "Homework already submitted", why: "Then the 5 pm deadline is one less thing to think about." }
    ]
  };

  const TOOLBOX = [
    { key: "brightspace", name: "Brightspace", category: "required", icon: "globe", use: "Announcements, Quiz 0 (syllabus quiz), the Gradescope help form, the participation-event list, focused office hours, and course slides.", when: "Check before every campus day; the Aug 28 announcement says slides are posted Tuesday at 9 am.", links: [{ key: "brightspace", label: "Open Brightspace" }, { key: "lectureSlides" }, { key: "brightspaceSupport", label: "Access problems" }] },
    { key: "gradescope", name: "Gradescope", category: "required", icon: "upload", use: "Submit every homework (.py files). Quiz, code review, and exam grades appear here too.", when: "Every homework — most weekdays, due 5 pm.", links: [{ key: "gradescope", label: "Open Gradescope" }] },
    { key: "site", name: "Course website", category: "required", icon: "book", use: "The weekly plan: lecture links, lab links, textbook chapters, and homework sets for each week. This hub re-reads it automatically.", when: "Start of each week.", links: [{ key: "site", label: "Open the course website" }, { key: "courseRepo" }] },
    { key: "syllabus", name: "Syllabus", category: "required", icon: "doc", use: "Grading weights, drop rules, academic integrity and AI policy, learning outcomes.", when: "Read once; Quiz 0 is about it.", links: [{ key: "syllabus", label: "General syllabus" }, { key: "syllabusHonors", label: "Honors syllabus (Macaulay / Daedalus)" }] },
    { key: "homework", name: "Homework list", category: "required", icon: "list", use: "All 60 programs with due dates, in sets of five. Rules: .py files compatible with Python 3.10, header comment, no late work. The homework page says three weeks early; the syllabus says four. Check the assignment's availability on Gradescope.", when: "Every week.", links: [{ key: "homework", label: "Open the homework list" }] },
    { key: "labs", name: "Labs", category: "required", icon: "flask", use: "Self-paced online exercises. Each quiz is built from the matching lab. The coursework page links every lab with its target date.", when: "One lab per week, before its quiz.", links: [{ key: "coursework", label: "All labs (0–13)" }, { key: "lab0" }] },
    { key: "calendar", name: "Coursework calendar", category: "recommended", icon: "calendar", use: "Quiz and code review windows, the early-finish extra-credit dates, and final exam details.", when: "Whenever you plan a lab visit.", links: [{ key: "calendar", label: "Open the calendar" }, { key: "finalInfo", label: "Final exam information" }] },
    { key: "resources", name: "Resources", category: "recommended", icon: "tools", use: "Installation guides, the free textbook, reference sheets (ASCII, MIPS), and links for later units.", when: "Setup week, then as new tools appear.", links: [{ key: "resources", label: "Open resources" }, { key: "install", label: "Installation guides" }] },
    { key: "faq", name: "FAQ", category: "optional", icon: "help", use: "Attendance, late work, extra credit, hours per week, what comes after 127, how to become a UTA.", when: "When you wonder \"is this allowed?\"", links: [{ key: "faq", label: "Open the FAQ" }] },
    { key: "navigate", name: "Navigate", category: "recommended", icon: "calendar", use: "Book quiz, code review, and tutoring appointments in 1001E HN. Appointments are seen before walk-ins.", when: "Before each lab visit.", links: [{ key: "navigate", label: "Open Navigate" }, { key: "navigateInfo", label: "How Navigate works" }] },
    { key: "tutoring", name: "Tutoring & peer mentoring", category: "optional", icon: "people", use: "Help with installs, homework, and code-review practice in 1001E HN. Drop in or book on Navigate.", when: "Weekday afternoons when classes are in session.", links: [{ key: "navigate", label: "Book on Navigate" }] },
    { key: "email", name: "Course email", category: "optional", icon: "mail", use: "csci127@hunter.cuny.edu for questions the FAQ and Brightspace do not answer. Include your name and EmplID.", when: "Only after checking the FAQ and Brightspace.", links: [{ key: "email" }] },
    { key: "textbook", name: "Free textbook", category: "recommended", icon: "book", use: "How to Think Like a Computer Scientist (Python 3). No purchase needed.", when: "Chapters are linked week by week on the course site.", links: [{ key: "textbook" }] },
    { key: "hunterCalendar", name: "Hunter academic calendar", category: "optional", icon: "calendar", use: "College closures, no-class days, and add/drop deadlines. This hub re-reads it automatically.", when: "Before planning around a holiday.", links: [{ key: "hunterCalendar" }] }
  ];

  /* Notes shown next to each grading weight (weights themselves come from the syllabus via course.json). */
  const GRADING_NOTES = {
    "Homework": "Highest 50 homework grades count. Due 5 pm; no late work. The homework page's academic-integrity section mentions 20% — the syllabus says 10%.",
    "Quizzes": "Top 10 quiz scores count. Paper, no notes or devices, no make-ups.",
    "Code Reviews": "Top 10 code review scores count. In IDLE on a lab computer, no make-ups.",
    "Participation": "Top 10 lecture slips count, plus bonus events announced on Brightspace.",
    "Final Exam": "Cumulative, on paper, during finals week."
  };
  const GRADING_EXTRA = {
    format: "10 questions, 10 points each. Closed book except one 8.5×11 two-sided sheet of notes. No electronic devices.",
    prep: "A mock final is given at the last lecture, with the key released that afternoon. Past exams with keys are on the course website.",
    finalVerify: "The coursework page says Tuesday, December 15; the course home page says \"Friday, 12/15\" (December 15, 2026 is a Tuesday). Hunter's finals week is Dec 15–21.",
    source: { key: "syllabus", label: "Syllabus: grading" }
  };

  const LAB = {
    room: "1001E HN",
    where: "10th floor, North Building",
    services: [
      "Quizzes (paper) and code reviews (IDLE on a lab computer) — appointments first, then walk-ins.",
      "Peer mentoring and tutoring, weekday afternoons.",
      "University computers with Python, IDLE, and all required software — for this course only."
    ],
    links: [{ key: "semesterAnnouncement", label: "Lab hours: Aug 28 announcement" }, { key: "navigate", label: "Book an appointment" }, { key: "hunterCalendar", label: "Hunter closures" }]
  };

  const SOFTWARE = [
    {
      phase: "Now — weeks 1 to 2",
      items: [
        { name: "Python 3", category: "required", why: "Free from python.org. Any stable Python 3 works; the autograders run Python 3.10, so keep your code 3.10-compatible.", links: [{ key: "python" }, { key: "install", label: "Course install guide" }] },
        { name: "IDLE", category: "required", why: "Comes with Python. Code reviews happen in IDLE on lab computers, so do your homework in it too.", links: [{ key: "lab0", label: "Lab 0: setting up" }] },
        { name: "Gradescope, Brightspace, and Navigate accounts", category: "required", why: "Submitting, announcements, and appointments. Any browser works.", links: [{ key: "gradescope" }, { key: "brightspace" }, { key: "navigate" }] },
        { name: "A pen and paper", category: "required", why: "Quizzes and lecture slips are on paper with no devices.", links: [] },
        { name: "The turtle library", category: "required", why: "Built into Python. Never name your own file turtle.py; the course explains the import conflict in the Homework 2 notes.", links: [{ key: "homework", label: "Turtle filename and allowed commands" }] }
      ]
    },
    {
      phase: "Soon — weeks 2 to 5",
      items: [
        { name: "A terminal with Unix commands", category: "required", why: "Files and directories, paths, wildcards. Quiz 2 covers Unix commands. Lab machines have it; macOS Terminal or Ubuntu work at home.", links: [{ key: "ubuntuTerminal" }] },
        { name: "Python packages: numpy, pandas, matplotlib, scipy, plotly, image", category: "recommended", why: "Lab 0 lists a single pip3 install for all of them. Needed for image work (Lab 3) and data work later.", links: [{ key: "lab0", label: "Install command in Lab 0" }] },
        { name: "ASCII table", category: "recommended", why: "Quiz 2 includes a reference sheet with an ASCII chart; practice reading one.", links: [{ key: "asciiTable" }] },
        { name: "Python Tutor", category: "optional", why: "Lecture examples are shared as Python Tutor links; step through loops visually.", links: [{ key: "pythonTutor" }] }
      ]
    },
    {
      phase: "Mid-semester — weeks 5 to 10",
      items: [
        { name: "CircuitVerse", category: "recommended", why: "Logic gates and circuits (Lab 5, Quiz 6). Runs in the browser.", links: [{ key: "circuitverse" }] },
        { name: "pandas and NYC Open Data", category: "required", why: "CSV manipulation (Labs 6–7, Quiz 7).", links: [{ key: "pandas10min" }, { key: "nycOpenData" }] },
        { name: "GitHub", category: "required", why: "Introduced in Lab 6. A free account is enough.", links: [{ key: "resources", label: "See resources" }] },
        { name: "Plotly maps", category: "recommended", why: "Spatial data (Lab 9).", links: [{ key: "plotlyMaps" }] }
      ]
    },
    {
      phase: "Late semester — weeks 11 to 14",
      items: [
        { name: "WeMIPS emulator", category: "required", why: "Machine language (Lab 11, Quiz 13). The course's emulator link currently has a certificate error. Check the course resources or ask a TA for a working option when this unit starts; do not bypass the browser warning.", links: [{ key: "wemips" }] },
        { name: "Human Resource Machine", category: "optional", why: "Hour of Code edition is free; the full version is on lab machines.", links: [{ key: "hrm" }] },
        { name: "C++ compiler", category: "required", why: "The last quarter of the course. Examples use OnlineGDB; lab machines have a compiler.", links: [{ key: "onlinegdb" }, { key: "cppTutorial" }, { key: "cppTutorialsPoint" }] }
      ]
    }
  ];

  const AI_POLICY = {
    allowed: [
      "Ask ChatGPT, Copilot, or similar tools to explain a general programming concept without sharing the wording or details of graded work.",
      "Use code from the textbook, lecture, and lab exercises unless an assignment says otherwise.",
      "Talk with classmates about the overall design of a program."
    ],
    notAllowed: [
      "Use an AI tool to generate or suggest answers or code for graded work, or paste assignment questions into one as a prompt.",
      "Use AI chat or autocomplete suggestions while writing submitted code. If your editor has AI features, turn them off — all typing must be your own.",
      "Copy code from the internet (for example StackOverflow) or ask for help on forums such as Discord.",
      "Share your solution, debug someone else's code, or post solutions where others can see them."
    ],
    consequences: "The general syllabus says: first incident, a 0 that is not dropped; second incident, failure of the course; cases are reported to the Office of Student Conduct. The homework page describes a different penalty sequence and also calls homework 20% even though the syllabus lists 10%. Because those official pages conflict, confirm the current rule on Brightspace or with course staff.",
    source: { key: "syllabus", label: "Syllabus: academic integrity" }
  };

  /* Checks that do not come from a deadline (deadline-based ones are generated). */
  const MISSED_CHECKS = [
    { title: "Your Gradescope invitation", check: "Invitations were sent by Friday, Aug 28. If CSCI 127 is not in your Gradescope account, use the form on Brightspace.", category: "required", links: [{ key: "gradescope", label: "Check Gradescope" }, { key: "brightspace", label: "Find the form on Brightspace" }], until: "2026-10-01" },
    { title: "Brightspace announcements you have not read", check: "This hub cannot read Brightspace. Scroll the announcements once a week; anything a classmate adds here appears under Announcements.", category: "recommended", links: [{ key: "brightspace", label: "Open Brightspace" }] },
    { title: "Add/drop and withdrawal deadlines", check: "Hunter's calendar lists the last day to add or change sections, refund dates, and the withdrawal period. Check it before acting.", category: "optional", links: [{ key: "hunterCalendar" }] }
  ];

  const SOURCES = [
    { key: "brightspace", note: "Source of truth for announcements, Quiz 0, and anything that changes. Not read by this hub." },
    { key: "gradescope", note: "Source of truth for what is due and what was received. Not read by this hub." },
    { key: "site", note: "Public weekly plan — re-read automatically." },
    { key: "syllabus", note: "Grading, policies, AI rules — re-read automatically." },
    { key: "coursework", note: "Quiz and code review windows, labs, final exam — re-read automatically." },
    { key: "homework", note: "Program descriptions and due dates — re-read automatically." },
    { key: "hunterCalendar", note: "College closures and registration deadlines — re-read automatically." },
    { key: "week2Announcement", note: "Checked Sep 6: Tuesday review 9:30–10 am in 118 HN; Homework 1, Quiz 1 and Code Review 1 due 5 pm. Login required." },
    { key: "semesterAnnouncement", note: "Checked Sep 6: regular lab hours and lecture-slide access. Login required." },
    { key: "hubRepo", note: "Where this page's code and update log live." }
  ];

  const QUESTIONS = [
    { q: "What must I do first?", target: "first" },
    { q: "What is due, when, and where?", target: "checklist" },
    { q: "What is happening today and tomorrow?", target: "days" },
    { q: "What do I bring to campus?", target: "days" },
    { q: "What is this week about?", target: "week" },
    { q: "Which website do I use for what?", target: "toolbox" },
    { q: "What software will I need?", target: "software" },
    { q: "How is the course graded?", target: "grading" },
    { q: "What might I have missed?", target: "missed" },
    { q: "Is this page up to date?", target: "updates" }
  ];

  window.CSCI127_DATA = {
    meta: {
      course: "CSCI 127: Introduction to Computer Science",
      school: "Hunter College · Fall 2026",
      timeZone: "America/New_York",
      lastReviewed: "2026-09-07"
    },
    LINKS, PLACES, CATEGORIES, RULES, TEMPLATES, STANDING, CAMPUS_DAY, TOOLBOX, GRADING_NOTES, GRADING_EXTRA, LAB, SOFTWARE, AI_POLICY, MISSED_CHECKS, SOURCES, QUESTIONS
  };
})();
