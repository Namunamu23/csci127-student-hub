/**
 * Brightspace → hub bridge (Google Apps Script)
 *
 * Watches your Gmail for Brightspace announcement e-mails from CSCI 127 and
 * opens one GitHub issue per announcement (label "announcement"). The hub's
 * Course Watch job then shows it on the next run.
 *
 * Privacy: only the title, the date, a one-or-two-sentence summary and the
 * Brightspace link are posted. The full announcement text never leaves your
 * mailbox; readers open Brightspace for it.
 *
 * Setup (once):
 *   1. Brightspace → your name (top right) → Notifications → e-mail:
 *      turn on "Announcements – new announcement available" (instant, not digest).
 *      CUNY sends them to your Hunter (Outlook) mailbox. In Outlook on the web:
 *      gear → Mail → Forwarding → forward to the Gmail this script runs in, keep a
 *      copy. Only e-mails whose subject contains COURSE_CODE are considered;
 *      summaries, receipts and other courses are ignored.
 *   2. GitHub → Settings → Developer settings → Personal access tokens →
 *      Fine-grained tokens → Generate: repository access = only
 *      Namunamu23/csci127-student-hub; Repository permissions → Issues:
 *      Read and write. Copy the token.
 *   3. script.google.com → New project → paste this file → Project Settings →
 *      Script properties → add GITHUB_TOKEN = <the token>.
 *   4. Run `setup` once (authorise Gmail access when asked). It installs a
 *      15-minute trigger. Run `testOnLatest` to dry-run against the newest
 *      matching e-mail without posting.
 *
 * Nothing leaves your account except the issue text sent to GitHub.
 */

var REPO = "Namunamu23/csci127-student-hub";
var COURSE_ORG_UNIT = "1315489";            // Brightspace course id for CSCI 127 (appears in announcement links)
var COURSE_CODE = "CSCI 12700";             // exactly as it appears in Brightspace e-mail subjects ("2026 FA [1] CSCI 12700 01 …")
var COURSE_WORDS = /CSCI\s*127/i;           // fallback match on subject/body
var GMAIL_SEARCH = 'newer_than:30d -label:hub-posted subject:("' + COURSE_CODE + '")';   // survives Outlook forwarding (FW: prefix, original sender or not)
var DONE_LABEL = "hub-posted";
var SUMMARY_CHARS = 240;                    // longest summary posted (about two sentences)
var SUMMARY_SENTENCES = 2;
var COURSE_HOME = "https://brightspace.cuny.edu/d2l/home/" + COURSE_ORG_UNIT;   // used when the e-mail has no direct link

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("bridge").timeBased().everyMinutes(15).create();
  GmailApp.createLabel(DONE_LABEL);
  Logger.log("Trigger installed: bridge() every 15 minutes. Token present: " + Boolean(token_()));
}

function bridge() {
  var label = GmailApp.getUserLabelByName(DONE_LABEL) || GmailApp.createLabel(DONE_LABEL);
  var threads = GmailApp.search(GMAIL_SEARCH, 0, 20);
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      var parsed = parseMessage_(msg);
      if (!parsed) return;                         // not a CSCI 127 announcement
      if (alreadyPosted_(parsed.key)) return;
      var issue = postIssue_(parsed);
      if (issue) { remember_(parsed.key, issue); Logger.log("Posted: " + parsed.title + " → " + issue); }
    });
    thread.addLabel(label);
  });
}

function testOnLatest() {
  var threads = GmailApp.search(GMAIL_SEARCH.replace("-label:hub-posted ", ""), 0, 3);
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (msg) {
      var parsed = parseMessage_(msg);
      Logger.log(parsed ? JSON.stringify(parsed, null, 2) : "(skipped: " + msg.getSubject() + ")");
      Logger.log("Brightspace links in this e-mail: " + JSON.stringify(brightspaceLinks_(msg)));
    });
  });
  if (!threads.length) Logger.log("No matching e-mails in the last 30 days. Check GMAIL_SEARCH and your Brightspace notification settings.");
}

/* ---------- internals ---------- */

function parseMessage_(msg) {
  var subject = msg.getSubject() || "";
  var html = unwrapSafeLinks_(msg.getBody() || "");
  var text = unwrapSafeLinks_(msg.getPlainBody() || html.replace(/<[^>]+>/g, " "));
  var links = brightspaceLinks_(msg);
  // Best link first: the announcement itself, else the course's announcement list, else nothing (course home is used later).
  var newsLink = links.filter(function (u) { return u.indexOf("/le/news/" + COURSE_ORG_UNIT + "/") >= 0; })[0]
    || links.filter(function (u) { return /news/i.test(u) && u.indexOf(COURSE_ORG_UNIT) >= 0; })[0] || "";
  var isCourse = Boolean(newsLink) || links.some(function (u) { return u.indexOf(COURSE_ORG_UNIT) >= 0; }) || COURSE_WORDS.test(subject) || COURSE_WORDS.test(text.slice(0, 2000));
  if (!isCourse) return null;
  if (/activity summary|summary of activity|digest|submission receipt|due date|end date|content item|feedback|grade/i.test(subject)) return null;   // other notification types
  if (!newsLink && !/announcement/i.test(subject + " " + text.slice(0, 800))) return null;   // must be an announcement notice
  var newsId = (newsLink.match(/\/news\/\d+\/(\d+)\//) || [])[1];
  // Title: CUNY subjects end with "… - Announcements: <title>"; otherwise strip the course prefix.
  var cleanSubject = subject.replace(/^(fwd?|fw|re):\s*/gi, "").trim();
  var m = cleanSubject.match(/announcements?:\s*(.+)$/i);
  var title = m ? m[1].trim() : cleanSubject.replace(/^\d{4}\s+[A-Z]{2}\s+\[\d+\]\s+[A-Z]{2,5}\s*\d{3,5}\s+\S+.*?[-–:]\s*/i, "").trim();
  title = title.trim() || "Brightspace announcement";

  // Body: drop forwarded-mail headers, the repeated subject, the "Posted …" line, and any e-mail addresses.
  var lines = text.replace(/\r/g, "").split("\n");
  var out = [], skippingHeader = false, postedDate = null;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (/^_{5,}$/.test(line)) { skippingHeader = true; continue; }
    if (skippingHeader) { if (/^subject:/i.test(line)) skippingHeader = false; continue; }
    if (/^(from|sent|to|cc|subject):/i.test(line)) continue;
    if (line && cleanSubject.indexOf(line) >= 0 && line.length > 30) continue;   // repeated subject line
    if (line.toLowerCase() === title.toLowerCase()) continue;                       // repeated title line
    var pm = line.match(/^Posted\s+([A-Za-z]+,\s*[A-Za-z]+\s+\d{1,2},\s*\d{4})/i);
    if (pm) { var d = new Date(pm[1]); if (!isNaN(d)) postedDate = Utilities.formatDate(d, "America/New_York", "yyyy-MM-dd"); continue; }
    if (/^(this is an automated|you are receiving|to change your notification|unsubscribe|manage notifications|get outlook for)/i.test(line)) break;
    out.push(lines[i].replace(/\s+$/, ""));
  }
  var body = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // Drop the Brightspace footer, then boil the text down to a short summary. The full text stays in your mailbox.
  body = body.replace(/\n[^\n]*Go to Announcements\s*>>[^\n]*$/i, "").replace(/\n\d{4}\s+[A-Z]{2}\s+\[\d+\][^\n]*<https:\/\/brightspace[^>]*>\s*$/i, "").trim();
  var summary = summarize_(body, SUMMARY_CHARS, SUMMARY_SENTENCES);
  var date = postedDate || Utilities.formatDate(msg.getDate(), "America/New_York", "yyyy-MM-dd");
  var key = newsId ? "news-" + newsId : "post-" + date + "-" + title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
  return { key: key, title: title.slice(0, 120), date: date, text: summary, link: newsLink || COURSE_HOME };
}

// Every distinct Brightspace link in the e-mail (HTML and plain-text parts), safe-links unwrapped.
function brightspaceLinks_(msg) {
  var html = unwrapSafeLinks_(msg.getBody() || ""), text = unwrapSafeLinks_(msg.getPlainBody() || "");
  var seen = {}, out = [];
  ((html + "\n" + text).match(/https?:\/\/brightspace\.cuny\.edu\/[^"'\s<>]+/g) || []).forEach(function (u) {
    u = u.replace(/&amp;/g, "&").replace(/[.,;)]+$/, "");
    if (!seen[u]) { seen[u] = 1; out.push(u); }
  });
  return out;
}

// Outlook rewrites links as https://urldefense.com/v3/__REAL__;...$ — put the real address back.
function unwrapSafeLinks_(s) {
  return s.replace(/https?:\/\/urldefense\.com\/v3\/__([^_>"\s]+(?:_[^_>"\s]+)*)__;[^>"\s]*/g, function (all, real) { return real.replace(/\*/g, "#"); });
}

// First sentence or two of the announcement, without links, addresses or bullet marks.
function summarize_(text, maxChars, maxSentences) {
  var flat = text
    .replace(/<?https?:\/\/[^\s<>]+>?/g, " ")
    .replace(/<?mailto:[^\s<>]+>?/gi, " ")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "")
    .replace(/^\s*(?:[*\-•]|\d+[.)])\s+/gm, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?)])/g, "$1")
    .trim();
  var sentences = flat.match(/[^.!?]+(?:[.!?]+|$)/g) || [flat];
  var summary = "", used = 0;
  for (var i = 0; i < sentences.length && used < maxSentences; i++) {
    var s = sentences[i].trim();
    if (!s) continue;
    if (summary && (summary + " " + s).length > maxChars) break;
    summary = summary ? summary + " " + s : s;
    used++;
  }
  if (summary.length > maxChars) summary = summary.slice(0, maxChars).replace(/\s+\S*$/, "").replace(/[,;:\s]+$/, "") + " …";
  else if (summary.length < flat.length) summary += " …";
  return summary || "(See Brightspace for the text.)";
}

function postIssue_(a) {
  var tok = token_();
  if (!tok) { Logger.log("GITHUB_TOKEN missing in Script properties."); return null; }
  var issueBody = "### Date\n\n" + a.date + "\n\n### What it says\n\n" + a.text + "\n\n### Link\n\n" + (a.link || "_No response_") + "\n\n_Posted automatically from a Brightspace notification e-mail. Summary only; the full text is on Brightspace._";
  var res = UrlFetchApp.fetch("https://api.github.com/repos/" + REPO + "/issues", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + tok, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    payload: JSON.stringify({ title: "[Announcement] " + a.title, body: issueBody, labels: ["announcement"] }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) { Logger.log("GitHub refused (" + res.getResponseCode() + "): " + res.getContentText().slice(0, 300)); return null; }
  return JSON.parse(res.getContentText()).html_url;
}

function token_() { return PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN"); }
function alreadyPosted_(key) { return Boolean(PropertiesService.getScriptProperties().getProperty("posted:" + key)); }
function remember_(key, url) { PropertiesService.getScriptProperties().setProperty("posted:" + key, url); }
