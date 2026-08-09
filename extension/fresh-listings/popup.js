const $ = (selector) => document.querySelector(selector);
let currentJob = null;

document.addEventListener("DOMContentLoaded", async () => {
  $("#settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("#save").addEventListener("click", saveJob);
  await loadCurrentJob();
});

async function loadCurrentJob() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractJobFromPage });
    currentJob = result;
    if (!currentJob?.title) throw new Error("Open an individual job listing, then try again.");
    $("#job").innerHTML = `<h1>${escapeHtml(currentJob.title)}</h1><p>${escapeHtml(currentJob.company || "Company not detected")}</p><p>${escapeHtml(currentJob.location || "Location not detected")}</p><p class="source">${escapeHtml(currentJob.source)}</p>`;
    $("#save").disabled = false;
  } catch (error) { showStatus(error.message || "This page cannot be read.", true); $("#job").innerHTML = '<p class="muted">Open a job detail page on a supported job board.</p>'; }
}

async function saveJob() {
  const { driveWebhookUrl, driveSecret } = await chrome.storage.sync.get(["driveWebhookUrl", "driveSecret"]);
  if (!driveWebhookUrl || !driveSecret) { showStatus("Add your Drive connection in Settings first.", true); return; }
  try {
    const origin = `${new URL(driveWebhookUrl).origin}/*`;
    const granted = await chrome.permissions.contains({ origins: [origin] }) || await chrome.permissions.request({ origins: [origin] });
    if (!granted) throw new Error("Permission is needed to send saved jobs to your Drive archive.");
    $("#save").disabled = true; showStatus("Saving to your Drive archive…");
    const response = await fetch(driveWebhookUrl, { method: "POST", headers: { "content-type": "text/plain;charset=utf-8" }, body: JSON.stringify({ secret: driveSecret, jobs: [currentJob] }) });
    if (!response.ok) throw new Error("Drive archive did not accept this job. Check Settings.");
    showStatus("Saved to your Google Drive archive.");
  } catch (error) { showStatus(error.message || "Could not save this job.", true); }
  finally { $("#save").disabled = false; }
}

function showStatus(message, isError = false) { const status = $("#status"); status.textContent = message; status.className = isError ? "status error" : "status"; }
function escapeHtml(value) { return String(value || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }

function extractJobFromPage() {
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const host = location.hostname.replace(/^www\./, "").toLowerCase();
  const source = host.includes("linkedin") ? "LinkedIn" : host.includes("indeed") ? "Indeed" : host.includes("builtin") ? "Built In" : host.includes("glassdoor") ? "Glassdoor" : host.includes("greenhouse") ? "Greenhouse" : host.includes("trueup") ? "TrueUp" : host;
  const text = (selectors) => { for (const selector of selectors) { const value = document.querySelector(selector)?.textContent; if (clean(value)) return clean(value); } return ""; };
  const json = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap((node) => { try { const value = JSON.parse(node.textContent || "{}"); return Array.isArray(value) ? value : [value, ...(value['@graph'] || [])]; } catch { return []; } }).find((item) => String(item?.['@type'] || "").includes("JobPosting"));
  const title = clean(json?.title) || text(["h1.top-card-layout__title", "h1.jobsearch-JobInfoHeader-title", "h1", '[data-test="jobTitle"]']);
  const company = clean(json?.hiringOrganization?.name) || text(["a.topcard__org-name-link", ".jobsearch-CompanyInfoWithoutHeaderImage div", "[data-test='employerName']", ".employer-name"]);
  const jobLocation = clean(json?.jobLocation?.address?.addressLocality || json?.jobLocation?.address?.addressRegion) || text([".topcard__flavor--bullet", ".jobsearch-JobInfoHeader-subtitle div", "[data-test='location']"]);
  const posted = clean(json?.datePosted) || text(["time", ".posted-time-ago__text", "[data-test='datePosted']"]);
  return { title, company, location: jobLocation, posted, source, link: window.location.href, capturedAt: new Date().toISOString(), search: document.referrer || "" };
}
