# CSCI 127 Student Hub

An unofficial, ADHD-friendly dashboard for Hunter College CSCI 127, Fall 2026 — live at
<https://namunamu23.github.io/csci127-student-hub/>.

It answers, for *today*: what to do first, what is due and where, what is happening on
campus, which website to use, and what you might have missed. Checkmarks are saved in the
visitor's own browser only. No login, analytics, or tracking.

Course requirements must always be confirmed against Brightspace, Gradescope, and the
official course website. This hub never reads Brightspace or Gradescope.

## How it stays up to date

1. **Course Watch** (`scripts/fetch-course.mjs`) reads the official public pages —
   the weekly plan (`f26.html`), coursework calendar (`cw.html`), homework list (`ps.html`),
   syllabus, resources, FAQ, Lab 0/1 — and Hunter's academic calendar. It turns them into
   `src/course.json` (weeks, all 60 homework due dates, every quiz/code-review window with
   extra-credit dates, lab targets, final exam, grading weights, closures).
2. It compares with the previous snapshot, writes a human-readable log to `src/changes.json`
   and per-source timestamps to `src/status.json`, and validates the result. If a page is
   unreachable the previous copy is kept and marked; if the data fails validation nothing is
   published and a `course-watch` issue is opened.
3. **Announcements** that only exist inside Brightspace are added by people: open a GitHub
   issue with the *Add a Brightspace announcement* form (label `announcement`). The next run
   copies open announcement issues into `src/announcements.json`; closing the issue removes it.
   The hub shows **summaries only** (title, date, one or two sentences, link): issue texts are
   cut to about 300 characters and the full wording stays on Brightspace behind the login.
4. `build.mjs` copies `src/` to `dist/` and bundles the JSON files into `dist/course.js`.
5. The page (`src/app.js`) computes everything from today's date in New York time, so the
   focus list, day cards, "this week", checklist and "might have missed" rotate on their own
   even between runs.

The GitHub Actions workflow `.github/workflows/course-watch.yml` runs all of this four times a
day (03:17, 09:17, 15:17, 21:17 UTC), on every push to `main`, whenever an announcement issue
changes, and on demand. It commits data changes as `course-watch[bot]` and deploys `dist/` to
GitHub Pages.

## Files

| Path | What it is | Who edits it |
| --- | --- | --- |
| `src/data.js` | Editorial layer: links, rules from announcements, step templates, toolbox, software, AI policy, sources | people |
| `src/course.json`, `src/changes.json`, `src/status.json` | Generated course data, change log, source status | Course Watch |
| `src/announcements.json` | Announcements (from issues + hand-added `maintainer` entries) | Course Watch / people |
| `src/index.html`, `src/styles.css`, `src/app.js` | The page | people |
| `scripts/fetch-course.mjs` | Course Watch | people |
| `build.mjs`, `check.mjs`, `server.mjs` | Build, validation, local preview | people |

## Local commands (Node 20+)

```
npm run watch    # re-read the course pages → src/course.json etc.
npm run check    # validate data.js, course.json and index.html
npm run build    # write dist/ (includes course.js and .nojekyll)
npm run update   # watch + check + build
npm run dev      # serve dist/ at http://127.0.0.1:4173/
```

## Publishing (one-time setup)

The repository must contain this whole project (not just the built files) so the workflow
can run:

```
git remote add origin https://github.com/Namunamu23/csci127-student-hub.git
git fetch origin
git push --force-with-lease origin main
```

Then in the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Open **Actions → Course Watch → Run workflow** once; from then on it runs by itself. The old
built files at the repository root are no longer needed once the workflow deploys.

Scheduled workflows are paused by GitHub after 60 days without any commit; a Course Watch
commit counts, and the *Run workflow* button restarts them.

## Editing course facts

- Dates, windows, topics and weights come from the official pages. Do not type them into
  `data.js`; fix the source page or wait for the next run.
- Rules that only exist in Brightspace announcements (lab hours, the 5 pm assessment
  deadline, the optional pre-lecture review) live in `RULES` in `src/data.js` with the
  announcement cited. Mark anything uncertain with `verify`.
- Never add personal grades, names, account data, or private course documents.

## Optional: automatic announcements from Brightspace e-mails

Brightspace can e-mail you every new announcement. `scripts/gmail-bridge.gs` is a Google
Apps Script that watches that Gmail inbox and opens the announcement issue for you, so
announcements reach the hub with no clicks. It posts only the title, date, the first sentence
or two and the Brightspace link; the full text never leaves the mailbox. Setup steps are at
the top of the file. It needs only a fine-grained GitHub token limited to *Issues: read and
write* on this repository; your Brightspace login is never stored anywhere.
