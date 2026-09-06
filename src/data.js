/*
  CSCI 127 Student Hub — single source of truth for course content.

  HOW TO UPDATE
  - Edit facts here; the page (app.js) renders everything from this file.
  - Dates are ISO 8601 with the New York offset (-04:00 for EDT, -05:00 for EST).
  - Anything you are not sure about: set `verify: "why"` and it will show a
    "Verify" badge instead of being stated as fact.
  - `category` must be one of: required | recommended | optional | extra
  - `urgent: true` puts a task in "Do this first" and in the progress count;
    `week: "next"` groups an undated task under "Next week" in the checklist.
  - `where` must be a key from PLACES. `links[].key` may be a key from LINKS.

  Sources of truth (in order): Brightspace and Gradescope, then the public
  course website (huntercsci127.github.io/f26). Do not add personal grades,
  names, account data, restricted documents, or other student-specific content.
*/
(function () {
  "use strict";

  const LINKS = {
    brightspace: { label: "Brightspace (CSCI 127)", href: "https://brightspace.cuny.edu/d2l/home/1315489" },
    gradescope: { label: "Gradescope (CSCI 127)", href: "https://www.gradescope.com/courses/1270901" },
    site: { label: "Course website (Fall 2026)", href: "https://huntercsci127.github.io/f26.html" },
    syllabus: { label: "General syllabus", href: "https://huntercsci127.github.io/f26/syl.html" },
    syllabusHonors: { label: "Honors syllabus", href: "https://huntercsci127.github.io/f26/sylHC.html" },
    homework: { label: "Homework list", href: "https://huntercsci127.github.io/f26/ps.html" },
    homeworkSet1: { label: "Programs 1–5", href: "https://huntercsci127.github.io/f26/ps.html#set1" },
    homeworkSet2: { label: "Programs 6–10", href: "https://huntercsci127.github.io/f26/ps.html#set2" },
    calendar: { label: "Coursework calendar", href: "https://huntercsci127.github.io/f26/cw.html#calendar" },
    coursework: { label: "Coursework page", href: "https://huntercsci127.github.io/f26/cw.html" },
    codeReviewInfo: { label: "Code review format", href: "https://huntercsci127.github.io/f26/cw.html#cr" },
    finalInfo: { label: "Final exam information", href: "https://huntercsci127.github.io/f26/cw.html#final" },
    resources: { label: "Resources page", href: "https://huntercsci127.github.io/f26/resources.html" },
    install: { label: "Installation guides", href: "https://huntercsci127.github.io/f26/resources.html#install" },
    faq: { label: "Course FAQ", href: "https://huntercsci127.github.io/f26/faq.html" },
    lab0: { label: "Lab 0: Setting up", href: "https://huntercsci127.github.io/f26/lab0.html" },
    lab1: { label: "Lab 1: First program & turtles", href: "https://huntercsci127.github.io/f26/lab1.html" },
    lab2: { label: "Lab 2: Strings & loops", href: "https://huntercsci127.github.io/f26/lab2.html" },
    lab3: { label: "Lab 3: Colors & images", href: "https://huntercsci127.github.io/f26/lab3.html" },
    navigate: { label: "Navigate (book an appointment)", href: "https://hunter-cuny.navigate.eab.com/app/" },
    navigateInfo: { label: "Hunter's Navigate help page", href: "https://www.hunter.cuny.edu/navigate/students/" },
    email: { label: "Email csci127@hunter.cuny.edu", href: "mailto:csci127@hunter.cuny.edu" },
    textbook: { label: "How to Think Like a Computer Scientist (free textbook)", href: "https://runestone.academy/ns/books/published/thinkcspy/index.html" },
    textbookCh1: { label: "Textbook chapter 1", href: "https://runestone.academy/ns/books/published/thinkcspy/GeneralIntro/toctree.html" },
    textbookCh4: { label: "Textbook chapter 4 (turtles)", href: "https://runestone.academy/ns/books/published/thinkcspy/PythonTurtle/toctree.html" },
    textbookCh2: { label: "Textbook chapter 2", href: "https://runestone.academy/ns/books/published//thinkcspy/SimplePythonData/toctree.html" },
    textbookCh3: { label: "Textbook chapter 3", href: "https://runestone.academy/ns/books/published//thinkcspy/Debugging/toctree.html" },
    hunterCalendar: { label: "Hunter academic calendar", href: "https://hunter.cuny.edu/students/registration/academic-calendar/" },
    python: { label: "Download Python", href: "https://www.python.org/downloads/" },
    pythonTutor: { label: "Python Tutor", href: "https://pythontutor.com/" },
    asciiTable: { label: "ASCII table (PDF)", href: "https://huntercsci127.github.io/files/ASCIITable.pdf" },
    ubuntuTerminal: { label: "Ubuntu terminal reference", href: "https://help.ubuntu.com/community/UsingTheTerminal" },
    circuitverse: { label: "CircuitVerse simulator", href: "https://circuitverse.org/simulator" },
    pandas10min: { label: "10 minutes to pandas", href: "https://pandas.pydata.org/pandas-docs/stable/user_guide/10min.html" },
    nycOpenData: { label: "NYC Open Data", href: "https://opendata.cityofnewyork.us" },
    plotlyMaps: { label: "Plotly maps", href: "https://plotly.com/python/maps/" },
    wemips: { label: "WeMIPS emulator", href: "https://wemips.ralfgerlich.biz/WeMips.html" },
    hrm: { label: "Human Resource Machine (Hour of Code edition)", href: "https://tomorrowcorporation.com/human-resource-machine-hour-of-code-edition" },
    cppTutorial: { label: "C++ tutorial (PDF)", href: "http://www.cplusplus.com/files/tutorial.pdf" },
    cppTutorialsPoint: { label: "C++ at Tutorials Point", href: "https://www.tutorialspoint.com/cplusplus/index.htm" },
    onlinegdb: { label: "OnlineGDB (C++ examples)", href: "https://onlinegdb.com/" },
    hunterSoftware: { label: "Hunter software & apps", href: "https://hunter.cuny.edu/information-technology/services/software-apps/" },
    brightspaceSupport: { label: "Hunter Brightspace support", href: "https://hunter.cuny.edu/information-technology/services/accounts-access/brightspace/#brightspaceforstudents" }
  };

  const PLACES = {
    gradescope: { label: "Gradescope (online)", icon: "upload", link: "gradescope" },
    brightspace: { label: "Brightspace (online)", icon: "globe", link: "brightspace" },
    navigate: { label: "Navigate (online)", icon: "calendar", link: "navigate" },
    lab: { label: "1001E HN · 10th floor, North Building", icon: "pin", short: "1001E HN" },
    lecture: { label: "118 HN · Assembly Hall, 1st floor, North Building", icon: "pin", short: "118 HN" },
    home: { label: "Anywhere (at home)", icon: "home" },
    web: { label: "Course website (online)", icon: "globe", link: "site" }
  };

  const CATEGORIES = {
    required: { label: "Required", hint: "Graded, or needed to get graded." },
    recommended: { label: "Recommended", hint: "Not graded on its own, but it makes graded work go better." },
    optional: { label: "Optional", hint: "Helpful if you have time." },
    extra: { label: "Extra credit", hint: "Bonus points on top of the regular grade." }
  };

  /* Ordered by priority: the first task is the first thing to do. */
  const TASKS = [
    {
      id: "access",
      title: "Make sure you can log in to Gradescope and Brightspace",
      category: "required",
      urgent: true,
      day: "before",
      where: "home",
      dueLabel: "Do now — needed for everything else",
      summary: "Gradescope invitations went out by Friday, August 28. If you never got one, use the form on Brightspace to be added.",
      steps: [
        "Open Gradescope and confirm CSCI 127 appears in your courses.",
        "Open Brightspace and read any announcements posted since mid-August.",
        "No Gradescope invitation? Fill out the form on Brightspace (it asks for your preferred email and EmplID)."
      ],
      links: [{ key: "gradescope" }, { key: "brightspace" }, { key: "brightspaceSupport", label: "Brightspace not working?" }]
    },
    {
      id: "hw1",
      title: "Submit Homework 1: Hello!",
      category: "required",
      urgent: true,
      day: "before",
      where: "gradescope",
      due: "2026-09-08T17:00:00-04:00",
      summary: "A short Python program that prints a welcome message with your name. Write and test it in IDLE, then upload the .py file to Gradescope.",
      steps: [
        "Start with the Lab 1 \"Hello, World\" program and change the message to include your name and the semester.",
        "Put a comment at the top with your name, email, and the date — it is required for full credit.",
        "Run it in IDLE. Then drag the .py file into the Homework 1 assignment on Gradescope. Results show in about a minute.",
        "No late homework is accepted. You can submit again before the deadline if the autograder reports a problem."
      ],
      links: [{ key: "gradescope", label: "Submit on Gradescope" }, { key: "homeworkSet1", label: "Read Homework 1 (Programs 1–5)" }, { key: "lab1", label: "Follow Lab 1" }]
    },
    {
      id: "lab1",
      title: "Work through Lab 1 (turtles and for-loops)",
      category: "recommended",
      urgent: true,
      day: "before",
      where: "home",
      dueLabel: "Before Quiz 1 — ideally Sunday or Monday",
      summary: "Labs are not a separate grade, but Quiz 1 is written from Lab 1. The lab's target date (Fri Sep 4) has passed; it is still the study guide for the quiz.",
      steps: [
        "Do every exercise, especially the turtle commands (forward, left, right) and the for-loop examples.",
        "Practice predicting what a loop prints before you run it — the quiz is on paper with no computer.",
        "Read textbook chapters 1 and 4 if anything is fuzzy."
      ],
      links: [{ key: "lab1", label: "Open Lab 1" }, { key: "textbookCh4" }, { key: "textbookCh1" }]
    },
    {
      id: "navigate",
      title: "Book a Navigate appointment for Tuesday in 1001E HN",
      category: "recommended",
      urgent: true,
      day: "before",
      where: "navigate",
      dueLabel: "Before Tuesday (slots may fill)",
      summary: "Quizzes and code reviews give first priority to students with Navigate appointments, then walk-ins. Tuesday is the last day of the Quiz 1 / Code Review 1 window, so an appointment is the safest plan.",
      steps: [
        "Log in to Navigate and look for CSCI 127 appointments in 1001E HN.",
        "Pick a Tuesday, Sep 8 slot after lecture (lecture ends 11:15 am; the lab runs into the afternoon).",
        "No slot? You can still walk in — arrive early and expect a wait."
      ],
      links: [{ key: "navigate", label: "Open Navigate" }, { key: "navigateInfo" }],
      verify: "Appointment availability and exact lab hours are managed by the course — confirm on Navigate and Brightspace."
    },
    {
      id: "announcements",
      title: "Read the latest Brightspace announcements",
      category: "recommended",
      urgent: true,
      day: "before",
      where: "brightspace",
      dueLabel: "Before Tuesday",
      summary: "Brightspace is where the course posts changes, Quiz 0, event lists, and anything the public website does not show. Five minutes here prevents surprises.",
      links: [{ key: "brightspace", label: "Open Brightspace" }]
    },
    {
      id: "lecture2",
      title: "Go to lecture (bring a pen for the lecture slip)",
      category: "required",
      urgent: true,
      day: "tuesday",
      where: "lecture",
      start: "2026-09-08T10:00:00-04:00",
      due: "2026-09-08T11:15:00-04:00",
      summary: "Tuesdays 10:00–11:15 am in 118 HN. Each lecture has a paper lecture slip solved in pairs or triples; completed slips count toward the 10% participation grade. No make-ups, but only your top 10 count.",
      links: [{ key: "site", label: "See this week's lecture links" }]
    },
    {
      id: "quiz1",
      title: "Take Quiz 1: Turtles and Loops",
      category: "required",
      urgent: true,
      day: "tuesday",
      where: "lab",
      due: "2026-09-08T17:00:00-04:00",
      summary: "A short paper quiz on turtle commands and for-loops, built from Lab 1. No notes, books, or devices. The lab is closed Monday, so Tuesday is the last day in this window. Complete it by 5:00 pm.",
      steps: [
        "Go to 1001E HN (10th floor, North Building) during lab hours — appointments first, then walk-ins.",
        "Bring a pen or pencil. Phones, laptops, calculators, and smart watches must stay away.",
        "Only your top 10 quiz scores count and there are no make-ups, so take it, even if you feel unsure."
      ],
      links: [{ key: "calendar", label: "See the quiz window on the calendar" }, { key: "lab1", label: "Study Lab 1" }, { key: "navigate", label: "Book on Navigate" }]
    },
    {
      id: "cr1",
      title: "Do Code Review 1: Hello (Homework 1)",
      category: "required",
      urgent: true,
      day: "tuesday",
      where: "lab",
      due: "2026-09-08T17:00:00-04:00",
      summary: "You re-create Homework 1 in IDLE on a lab computer and explain each decision to a teaching assistant. About half an hour. No notes. Complete it by 5:00 pm.",
      steps: [
        "Before you go, re-type Homework 1 from memory in IDLE at home until it feels easy.",
        "Be ready to explain: what the comment header is for, what print does, and why the message looks the way it does.",
        "Same lab, same window as Quiz 1 — many students do both in one visit."
      ],
      links: [{ key: "codeReviewInfo", label: "Read the code review format" }, { key: "calendar", label: "See the window on the calendar" }, { key: "navigate", label: "Book on Navigate" }]
    },
    {
      id: "quiz0",
      title: "Check whether Quiz 0 (syllabus quiz) is still open on Brightspace",
      category: "required",
      urgent: false,
      day: "later",
      where: "brightspace",
      dueLabel: "Calendar lists Tue, Sep 1 — check Brightspace",
      summary: "Quiz 0 covers the syllabus and is taken on Brightspace, not in the lab. The public calendar lists it for September 1; only Brightspace can tell you if it is still available.",
      links: [{ key: "brightspace", label: "Open Brightspace" }, { key: "syllabus", label: "Read the syllabus" }],
      verify: "Availability is set inside Brightspace and is not visible on the public site."
    },
    {
      id: "hw2",
      title: "Submit Homework 2: Triangle (turtle)",
      category: "required",
      urgent: false,
      day: "later",
      where: "gradescope",
      due: "2026-09-09T17:00:00-04:00",
      summary: "Draw a triangle with the turtle library. Do not name your file turtle.py — it breaks the import.",
      links: [{ key: "gradescope", label: "Submit on Gradescope" }, { key: "homeworkSet1", label: "Read Homework 2" }]
    },
    {
      id: "hw3",
      title: "Submit Homework 3: Turtle Drawing",
      category: "required",
      urgent: false,
      day: "later",
      where: "gradescope",
      due: "2026-09-10T17:00:00-04:00",
      summary: "A turtle drawing of a dream home using at least 6 colors and 2000+ steps.",
      links: [{ key: "gradescope", label: "Submit on Gradescope" }, { key: "homeworkSet1", label: "Read Homework 3" }]
    },
    {
      id: "lab2",
      title: "Work through Lab 2 (strings, loops, Unix commands)",
      category: "recommended",
      urgent: false,
      week: "next",
      day: "later",
      where: "home",
      dueLabel: "Target: Thu, Sep 10",
      summary: "Quiz 2 is built from Lab 2: looping through strings, ASCII values, and Unix file and directory commands.",
      links: [{ key: "lab2", label: "Open Lab 2" }, { key: "textbookCh2" }, { key: "textbookCh3" }]
    },
    {
      id: "quiz2",
      title: "Take Quiz 2: Strings, ASCII, Unix commands",
      category: "required",
      urgent: false,
      day: "later",
      where: "lab",
      due: "2026-09-15T17:00:00-04:00",
      dueLabel: "Window: Wed, Sep 9 – Tue, Sep 15",
      summary: "Paper quiz in 1001E HN. It includes a reference sheet with an ASCII chart. Extra credit for finishing early: 15% by Wed Sep 9, 10% by Thu Sep 10, 5% by Mon Sep 14.",
      links: [{ key: "calendar", label: "See the window on the calendar" }, { key: "lab2", label: "Study Lab 2" }, { key: "navigate", label: "Book on Navigate" }],
      verify: "Dates from the public coursework calendar. Note Hunter lists Fri Sep 11–Sun Sep 13 as \"no classes scheduled\" — confirm whether the lab is open that Friday."
    },
    {
      id: "cr2",
      title: "Do Code Review 2: Using the Turtle Library (HW 2 & 5)",
      category: "required",
      urgent: false,
      day: "later",
      where: "lab",
      due: "2026-09-15T17:00:00-04:00",
      dueLabel: "Window: Wed, Sep 9 – Tue, Sep 15",
      summary: "Choose Homework 2 or Homework 5 and re-create it in IDLE on a lab computer while explaining it. Same early extra credit as Quiz 2.",
      links: [{ key: "codeReviewInfo", label: "Read the code review format" }, { key: "calendar", label: "See the window on the calendar" }],
      verify: "Dates from the public coursework calendar."
    },
    {
      id: "lab3",
      title: "Work through Lab 3 (colors and images)",
      category: "recommended",
      urgent: false,
      week: "next",
      day: "later",
      where: "home",
      dueLabel: "Target: Fri, Sep 11",
      summary: "Representing colors and manipulating images. Quiz 3 (Sep 16–22) covers color formats, slicing, and Unix.",
      links: [{ key: "lab3", label: "Open Lab 3" }],
      verify: "Hunter's calendar lists Sep 11–13 as \"no classes scheduled\". The lab target date is from the public coursework page."
    },
    {
      id: "hw4",
      title: "Submit Homework 4: Multiple Greetings",
      category: "required",
      urgent: false,
      day: "later",
      where: "gradescope",
      due: "2026-09-14T17:00:00-04:00",
      summary: "Print \"Welcome!\" a number of times based on a calculation with your EmplID.",
      links: [{ key: "gradescope", label: "Submit on Gradescope" }, { key: "homeworkSet1", label: "Read Homework 4" }]
    },
    {
      id: "hw5",
      title: "Submit Homework 5: Flower",
      category: "required",
      urgent: false,
      day: "later",
      where: "gradescope",
      due: "2026-09-15T17:00:00-04:00",
      summary: "Implement the given pseudocode to draw a flower pattern with the turtle.",
      links: [{ key: "gradescope", label: "Submit on Gradescope" }, { key: "homeworkSet1", label: "Read Homework 5" }]
    },
    {
      id: "ec-quiz2",
      title: "Take Quiz 2 early for extra credit",
      category: "extra",
      urgent: false,
      day: "later",
      where: "lab",
      due: "2026-09-09T17:00:00-04:00",
      dueLabel: "15% by Wed Sep 9 · 10% by Thu Sep 10 · 5% by Mon Sep 14",
      summary: "Every quiz and code review earns up to 15% extra credit when you finish before the end date. Quiz 1's early dates have passed, but Quiz 2's have not.",
      links: [{ key: "calendar", label: "See early dates on the calendar" }, { key: "navigate", label: "Book on Navigate" }]
    },
    {
      id: "ec-cr2",
      title: "Do Code Review 2 early for extra credit",
      category: "extra",
      urgent: false,
      day: "later",
      where: "lab",
      due: "2026-09-09T17:00:00-04:00",
      dueLabel: "15% by Wed Sep 9 · 10% by Thu Sep 10 · 5% by Mon Sep 14",
      summary: "Needs Homework 2 or 5 to be solid. Homework 2 is due Wed Sep 9 anyway, so finishing it a day early opens the 15% tier.",
      links: [{ key: "calendar", label: "See early dates on the calendar" }, { key: "codeReviewInfo" }]
    },
    {
      id: "ec-events",
      title: "Attend department and Tech Career Center events for bonus participation",
      category: "extra",
      urgent: false,
      day: "later",
      where: "brightspace",
      dueLabel: "Announced on Brightspace through the term",
      summary: "The syllabus says bonus participation is available for these events; the list is posted on Brightspace.",
      links: [{ key: "brightspace", label: "See the event list on Brightspace" }]
    },
    {
      id: "reading",
      title: "Read textbook chapters 1 and 4 (this week) and 2 and 3 (next week)",
      category: "recommended",
      urgent: false,
      day: "later",
      where: "home",
      dueLabel: "Alongside labs 1–3",
      summary: "The free textbook is linked from each week on the course website. Quizzes cover the reading as well as labs and lecture.",
      links: [{ key: "textbookCh1" }, { key: "textbookCh4" }, { key: "textbookCh2" }, { key: "textbookCh3" }]
    },
    {
      id: "tutoring",
      title: "Get help from peer mentors in 1001E HN",
      category: "optional",
      urgent: false,
      day: "later",
      where: "lab",
      dueLabel: "Weekday afternoons when classes are in session",
      summary: "Drop in or book on Navigate. Good for install problems, stuck homework, and practicing before a code review.",
      links: [{ key: "navigate", label: "Book on Navigate" }, { key: "faq", label: "Read the FAQ first" }]
    },
    {
      id: "faq",
      title: "Skim the course FAQ",
      category: "optional",
      urgent: false,
      day: "later",
      where: "web",
      dueLabel: "Whenever you have 10 minutes",
      summary: "Answers to \"do I have to…\" questions: attendance, late work, extra credit, hours per week, what comes after 127.",
      links: [{ key: "faq", label: "Open the FAQ" }]
    }
  ];

  const MONDAY = {
    date: "2026-09-07",
    headline: "Monday, September 7 is Labor Day. Hunter is closed.",
    closed: [
      "No classes.",
      "The 1001E HN lab is closed: no tutoring, no quizzes, no code reviews.",
      "Navigate appointments are not offered while the lab is closed."
    ],
    open: [
      "Gradescope accepts submissions any time — Homework 1 can go in on Monday.",
      "Brightspace, the course website, labs, and the textbook are all online.",
      "Navigate is online, so you can still book Tuesday's appointment."
    ],
    plan: [
      { title: "Finish and submit Homework 1", detail: "Submitting Monday leaves Tuesday free and gives you time if the autograder flags something.", taskId: "hw1" },
      { title: "Do Lab 1 as quiz practice", detail: "Work the turtle and for-loop exercises on paper, then check them in IDLE.", taskId: "lab1" },
      { id: "rehearse-cr1", title: "Rehearse Code Review 1", detail: "Close your notes and re-type Homework 1 in IDLE from scratch. Say out loud what each line does. (The real code review happens Tuesday in the lab.)" },
      { title: "Book Tuesday on Navigate", detail: "Appointments get priority over walk-ins in the lab.", taskId: "navigate" },
      { title: "Read Brightspace announcements", detail: "Check for any change to Tuesday's plan and for Quiz 0.", taskId: "announcements" }
    ],
    links: [{ key: "hunterCalendar", label: "Hunter academic calendar (Sep 7: College closed)" }]
  };

  const TUESDAY = {
    date: "2026-09-08",
    headline: "Tuesday, September 8 — your one campus day this week",
    intro: "Lecture in the morning, then Quiz 1 and Code Review 1 in the lab, and Homework 1 due at 5 pm. Here is the day in order.",
    timeline: [
      {
        time: "9:30–10:00 am",
        title: "Optional: focused review session",
        category: "optional",
        where: "lecture",
        detail: "A short review before lecture in 118 HN. Bring questions from Lab 1 or anything you want clarified before Quiz 1.",
        links: [{ key: "brightspace", label: "Check the Brightspace announcement" }]
      },
      {
        time: "10:00 – 11:15 am",
        title: "Lecture in 118 HN (Assembly Hall)",
        category: "required",
        where: "lecture",
        detail: "Paper lecture slip solved in pairs or triples; write the names of who you worked with. Counts toward participation.",
        taskId: "lecture2",
        links: [{ key: "site", label: "This week's lecture links" }]
      },
      {
        time: "11:30 am – 5:00 pm",
        title: "Quiz 1 in 1001E HN",
        category: "required",
        where: "lab",
        detail: "Paper. Turtle commands and for-loops. No notes, books, phones, calculators, or smart watches. Appointments first, then walk-ins. Due by 5:00 pm.",
        taskId: "quiz1",
        links: [{ key: "navigate", label: "Book on Navigate" }, { key: "lab1", label: "Last look at Lab 1" }]
      },
      {
        time: "Same visit · by 5:00 pm",
        title: "Code Review 1 in 1001E HN",
        category: "required",
        where: "lab",
        detail: "Re-create Homework 1 in IDLE on a lab computer and explain it to a TA. Due by 5:00 pm.",
        taskId: "cr1",
        links: [{ key: "codeReviewInfo", label: "Code review format" }]
      },
      {
        time: "5:00 pm",
        title: "Homework 1 due on Gradescope",
        category: "required",
        where: "gradescope",
        detail: "No late homework. Submit before you head to the lab if you have not already.",
        taskId: "hw1",
        links: [{ key: "gradescope", label: "Submit on Gradescope" }]
      }
    ],
    bring: [
      { item: "A pen or pencil", why: "The lecture slip and the quiz are both on paper." },
      { item: "Homework 1 in your head, not on paper", why: "No notes are allowed in the quiz or code review. Rehearse until you can re-type it from memory." },
      { item: "Your Navigate confirmation", why: "Appointments are seen first; walk-ins wait." },
      { item: "Nothing electronic on the desk", why: "Phones, laptops, calculators, and smart watches must stay away during the quiz." },
      { item: "Homework 1 already submitted", why: "Then the 5 pm deadline is one less thing to think about." }
    ]
  };

  const TOOLBOX = [
    { key: "brightspace", name: "Brightspace", category: "required", icon: "globe", use: "Announcements, Quiz 0 (syllabus quiz), the Gradescope help form, the participation-event list, and course slides.", when: "Check before every campus day.", links: [{ key: "brightspace", label: "Open Brightspace" }, { key: "brightspaceSupport", label: "Access problems" }] },
    { key: "gradescope", name: "Gradescope", category: "required", icon: "upload", use: "Submit every homework (.py files). Quiz, code review, and exam grades appear here too.", when: "Every homework — most weekdays, due 5 pm.", links: [{ key: "gradescope", label: "Open Gradescope" }] },
    { key: "site", name: "Course website", category: "required", icon: "book", use: "The weekly plan: lecture links, lab links, textbook chapters, and homework sets for each week.", when: "Start of each week.", links: [{ key: "site", label: "Open the course website" }] },
    { key: "syllabus", name: "Syllabus", category: "required", icon: "doc", use: "Grading weights, drop rules, academic integrity and AI policy, learning outcomes.", when: "Read once; Quiz 0 is about it.", links: [{ key: "syllabus", label: "General syllabus" }, { key: "syllabusHonors", label: "Honors syllabus (Macaulay / Daedalus)" }] },
    { key: "homework", name: "Homework list", category: "required", icon: "list", use: "All programs with due dates, in sets of five. Rules: .py files compatible with Python 3.10, header comment, no late work, submit up to three weeks early.", when: "Every week.", links: [{ key: "homework", label: "Open the homework list" }, { key: "homeworkSet1", label: "Programs 1–5" }, { key: "homeworkSet2", label: "Programs 6–10" }] },
    { key: "labs", name: "Labs", category: "required", icon: "flask", use: "Self-paced online exercises. Each quiz is built from the matching lab.", when: "One lab per week, before its quiz.", links: [{ key: "lab0" }, { key: "lab1" }, { key: "lab2" }, { key: "lab3" }] },
    { key: "calendar", name: "Coursework calendar", category: "recommended", icon: "calendar", use: "Quiz and code review windows, the early-finish extra-credit dates, and final exam details.", when: "Whenever you plan a lab visit.", links: [{ key: "calendar", label: "Open the calendar" }, { key: "finalInfo", label: "Final exam information" }] },
    { key: "resources", name: "Resources", category: "recommended", icon: "tools", use: "Installation guides, the free textbook, reference sheets (ASCII, MIPS), and links for later units.", when: "Setup week, then as new tools appear.", links: [{ key: "resources", label: "Open resources" }, { key: "install", label: "Installation guides" }] },
    { key: "faq", name: "FAQ", category: "optional", icon: "help", use: "Attendance, late work, extra credit, hours per week, what comes after 127, how to become a UTA.", when: "When you wonder \"is this allowed?\"", links: [{ key: "faq", label: "Open the FAQ" }] },
    { key: "navigate", name: "Navigate", category: "recommended", icon: "calendar", use: "Book quiz, code review, and tutoring appointments in 1001E HN. Appointments are seen before walk-ins.", when: "Before each lab visit.", links: [{ key: "navigate", label: "Open Navigate" }, { key: "navigateInfo", label: "How Navigate works" }] },
    { key: "tutoring", name: "Tutoring & peer mentoring", category: "optional", icon: "people", use: "Help with installs, homework, and code-review practice in 1001E HN. Drop in or book on Navigate.", when: "Weekday afternoons when classes are in session.", links: [{ key: "navigate", label: "Book on Navigate" }] },
    { key: "email", name: "Course email", category: "optional", icon: "mail", use: "csci127@hunter.cuny.edu for questions the FAQ and Brightspace do not answer. Include your name and EmplID.", when: "Only after checking the FAQ and Brightspace.", links: [{ key: "email" }] },
    { key: "textbook", name: "Free textbook", category: "recommended", icon: "book", use: "How to Think Like a Computer Scientist (Python 3). No purchase needed.", when: "Chapters are linked week by week on the course site.", links: [{ key: "textbook" }] },
    { key: "hunterCalendar", name: "Hunter academic calendar", category: "optional", icon: "calendar", use: "College closures, no-class days, and add/drop deadlines.", when: "Before planning around a holiday.", links: [{ key: "hunterCalendar" }] }
  ];

  const GRADING = {
    weights: [
      { label: "Homework", percent: 10, note: "Highest 50 homework grades count. Due 5 pm; no late work." },
      { label: "Quizzes", percent: 30, note: "Top 10 quiz scores count. Paper, no notes or devices, no make-ups." },
      { label: "Code reviews", percent: 20, note: "Top 10 code review scores count. In IDLE on a lab computer, no make-ups." },
      { label: "Participation", percent: 10, note: "Top 10 lecture slips count, plus bonus events announced on Brightspace." },
      { label: "Final exam", percent: 30, note: "Cumulative, on paper, during finals week." }
    ],
    finalRule: "You must take and pass the final (60 points or more) to pass the course.",
    extraCredit: "Up to 15% extra credit on each quiz and code review for finishing before the end date: 5% one day early, 10% two days early, 15% three or more days early.",
    finalExam: {
      when: "Tuesday, December 15, 9:00–11:00 am",
      where: "118 HN (Assembly Hall)",
      format: "10 questions, 10 points each. Closed book except one 8.5×11 two-sided sheet of notes. No electronic devices.",
      prep: "A mock exam is planned for December 8, with the key released that afternoon. Past exams with keys are on the course website.",
      verify: "The coursework page says Tuesday, December 15; the home page says \"Friday, 12/15\" (December 15, 2026 is a Tuesday). Confirm the registrar's slot before finals."
    },
    source: { key: "syllabus", label: "Syllabus: grading" }
  };

  const LAB = {
    room: "1001E HN",
    where: "10th floor, North Building",
    hours: "Monday–Thursday, 11:30 am–5:15 pm; Friday, 11:30 am–4:00 pm, when classes meet",
    opened: "Open since Monday, August 31",
    services: [
      "Quizzes (paper) and code reviews (IDLE on a lab computer) — appointments first, then walk-ins.",
      "Peer mentoring and tutoring, weekday afternoons.",
      "University computers with Python, IDLE, and all required software — for this course only."
    ],
    closures: [
      { date: "Mon, Sep 7", text: "Labor Day — College closed. Lab closed: no tutoring, quizzes, or code reviews." },
      { date: "Fri, Sep 11 – Sun, Sep 13", text: "Hunter lists \"no classes scheduled\". The public course site does not say whether the lab is open that Friday.", verify: "Confirm on Brightspace before planning a Friday visit." }
    ],
    links: [{ key: "navigate", label: "Book an appointment" }, { key: "hunterCalendar", label: "Hunter closures" }]
  };

  const SOFTWARE = [
    {
      phase: "Now — weeks 1 to 2",
      items: [
        { name: "Python 3", category: "required", why: "Free from python.org. Any stable Python 3 works; the autograders run Python 3.10, so keep your code 3.10-compatible.", links: [{ key: "python" }, { key: "install", label: "Course install guide" }] },
        { name: "IDLE", category: "required", why: "Comes with Python. Code reviews happen in IDLE on lab computers, so do your homework in it too.", links: [{ key: "lab0", label: "Lab 0: setting up" }] },
        { name: "Gradescope, Brightspace, and Navigate accounts", category: "required", why: "Submitting, announcements, and appointments. Any browser works.", links: [{ key: "gradescope" }, { key: "brightspace" }, { key: "navigate" }] },
        { name: "A pen and paper", category: "required", why: "Quizzes and lecture slips are on paper with no devices.", links: [] },
        { name: "The turtle library", category: "required", why: "Built into Python. Never name your own file turtle.py.", links: [{ key: "textbookCh4" }] }
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
        { name: "WeMIPS emulator", category: "required", why: "Machine language (Lab 11, Quiz 13). Browser-based.", links: [{ key: "wemips" }] },
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
    consequences: "First incident: a 0 that is not dropped as your lowest grade. Second incident: you fail the course. Cases are reported to the Office of Student Conduct.",
    source: { key: "syllabus", label: "Syllabus: academic integrity" }
  };

  const POSSIBLY_MISSED = [
    { title: "Quiz 0, the syllabus quiz on Brightspace", check: "The public calendar lists it for Tuesday, Sep 1. Open Brightspace to see whether it is still available to you.", category: "required", links: [{ key: "brightspace", label: "Check Brightspace" }] },
    { title: "Your Gradescope invitation", check: "Invitations were sent by Friday, Aug 28. If CSCI 127 is not in your Gradescope account, use the form on Brightspace.", category: "required", links: [{ key: "gradescope", label: "Check Gradescope" }, { key: "brightspace", label: "Find the form on Brightspace" }] },
    { title: "Lab 0 (setup) and Lab 1", check: "Lab 0's target was Sep 1 and Lab 1's was Sep 4. Labs are not graded on their own, but the quizzes are built from them.", category: "recommended", links: [{ key: "lab0" }, { key: "lab1" }] },
    { title: "The first lecture slip (Tue, Sep 1)", check: "Lecture slips have no make-ups, but only your top 10 count. One missed slip can be left out if you complete at least 10 others.", category: "required", links: [{ key: "faq", label: "FAQ: missing lectures" }] },
    { title: "Early-finish extra credit for Quiz 1 and Code Review 1", check: "The 15/10/5% dates (Sep 2–4) have passed. Full credit is still available through Tuesday, Sep 8.", category: "extra", links: [{ key: "calendar", label: "See the calendar" }] },
    { title: "Brightspace announcements since mid-August", check: "The course says to watch Brightspace for announcements. Scroll back to the start of the term once.", category: "recommended", links: [{ key: "brightspace", label: "Open Brightspace" }] },
    { title: "Add/drop deadline", check: "Hunter's calendar lists Thursday, Sep 3 as the last day to add a class or change sections. Later drop dates affect refunds only.", category: "optional", links: [{ key: "hunterCalendar" }] }
  ];

  const SOURCES = [
    { key: "brightspace", note: "Source of truth for announcements, Quiz 0, and anything that changes." },
    { key: "gradescope", note: "Source of truth for what is due and what was received." },
    { key: "site", note: "Public weekly plan." },
    { key: "syllabus", note: "Grading, policies, AI rules." },
    { key: "coursework", note: "Quiz and code review windows, final exam." },
    { key: "homework", note: "Program descriptions and due dates." },
    { key: "hunterCalendar", note: "College closures and registration deadlines." }
  ];

  const QUESTIONS = [
    { q: "What must I do first?", target: "first" },
    { q: "What is due, when, and where?", target: "checklist" },
    { q: "What should I do on Monday?", target: "monday" },
    { q: "What do I bring on Tuesday?", target: "tuesday" },
    { q: "Which website do I use for what?", target: "toolbox" },
    { q: "What software will I need?", target: "software" },
    { q: "How is the course graded?", target: "grading" },
    { q: "What might I have missed?", target: "missed" }
  ];

  window.CSCI127_DATA = {
    meta: {
      course: "CSCI 127: Introduction to Computer Science",
      school: "Hunter College · Fall 2026",
      timeZone: "America/New_York",
      lastReviewed: "2026-09-06",
      focus: { start: "2026-09-06", end: "2026-09-08", label: "September 6–8" }
    },
    LINKS, PLACES, CATEGORIES, TASKS, MONDAY, TUESDAY, TOOLBOX, GRADING, LAB, SOFTWARE, AI_POLICY, POSSIBLY_MISSED, SOURCES, QUESTIONS
  };
})();
