// Fresh Listings Saver — paste this file into script.google.com, then deploy as a Web app.
// This document lives in the connected Google Drive account and becomes the permanent job log.
const ARCHIVE_DOCUMENT_ID = "1NVTbiB73OGInnZHU7R70OSMGAIE1jINwYPWT_q1b-q0";
const ARCHIVE_SECRET = "REPLACE_WITH_A_LONG_RANDOM_SECRET";

function doPost(event) {
  try {
    const payload = JSON.parse(event.postData.contents || "{}");
    if (!payload.secret || payload.secret !== ARCHIVE_SECRET) return json({ ok: false, error: "Unauthorized" });
    const jobs = Array.isArray(payload.jobs) ? payload.jobs : [];
    if (!jobs.length) return json({ ok: false, error: "No jobs received" });

    const document = DocumentApp.openById(ARCHIVE_DOCUMENT_ID);
    const body = document.getBody();
    jobs.slice(0, 100).forEach((job) => appendJob(body, job));
    document.saveAndClose();
    return json({ ok: true, saved: Math.min(jobs.length, 100) });
  } catch (error) {
    return json({ ok: false, error: String(error) });
  }
}

function appendJob(body, job) {
  body.appendParagraph(`${safe(job.title) || "Untitled role"} — ${safe(job.company) || "Company not detected"}`)
    .setHeading(DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(`Source: ${safe(job.source)}\nLocation: ${safe(job.location)}\nPosted: ${safe(job.posted)}\nCaptured: ${safe(job.capturedAt)}\nSearch: ${safe(job.search)}`);
  const link = body.appendParagraph(safe(job.link));
  if (safe(job.link)) link.setLinkUrl(safe(job.link));
  body.appendParagraph("");
}

function safe(value) { return String(value || "").replace(/[\u0000-\u001F\u007F]/g, " ").slice(0, 2000); }
function json(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
