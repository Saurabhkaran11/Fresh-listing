/* global chrome */
const $ = (selector) => document.querySelector(selector);
const PAGE_SIZE = 25;
const MAX_RESULTS = 100;
let results = [];

document.addEventListener("DOMContentLoaded", () => {
  $("#settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("#search-form").addEventListener("submit", searchLinkedIn);
  $("#save-selected").addEventListener("click", saveSelected);
  $("#save-current").addEventListener("click", saveCurrentPage);
  $("#results").addEventListener("change", updateSelectedButton);
  $("#results").addEventListener("click", (event) => { if (event.target.matches(".save-one")) saveOne(event.target.dataset.id); });
});

async function searchLinkedIn(event) {
  event.preventDefault();
  const keywords = $("#keywords").value.trim();
  const location = $("#location").value.trim() || "Worldwide";
  const time = $("#time").value;
  if (!keywords) return;
  setSearching(true); showStatus("Searching LinkedIn from your browser…");
  try {
    const jobs = [];
    for (let start = 0; start < MAX_RESULTS; start += PAGE_SIZE) {
      const url = new URL("https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search");
      url.search = new URLSearchParams({ keywords, location, f_TPR: time, start: String(start) }).toString();
      const response = await fetch(url, { headers: { accept: "text/html,application/xhtml+xml", "accept-language": "en-US,en;q=0.9" } });
      if (!response.ok) throw new Error(response.status === 429 ? "LinkedIn is temporarily rate-limiting searches. Try again shortly." : "LinkedIn did not return public results for this search.");
      const page = parseLinkedInJobs(await response.text(), keywords, location, time);
      jobs.push(...page);
      if (page.length < PAGE_SIZE) break;
    }
    results = uniqueById(jobs);
    renderResults();
    showStatus(results.length ? "Select any jobs to save to Drive." : "No public matches in that time window. Try 7 or 30 days.");
  } catch (error) { results = []; renderResults(); showStatus(error.message || "Search could not be completed.", true); }
  finally { setSearching(false); }
}

function parseLinkedInJobs(html, keywords, location, time) {
  const clean = (value) => String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const field = (card, className) => {
    const match = card.match(new RegExp(`<[^>]*class="[^"]*${className}[^"]*"[^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i"));
    return match ? decodeHtml(clean(match[1])) : "";
  };
  return html.split(/(?=<li\b)/i).filter((card) => /base-search-card--link/i.test(card)).flatMap((card) => {
    const rawId = card.match(/data-entity-urn="urn:li:jobPosting:(\d+)"/i)?.[1];
    const rawLink = card.match(/href="(https:\/\/[^"]*linkedin\.com\/jobs\/view\/[^"?]+)[^"]*"/i)?.[1];
    const title = field(card, "base-search-card__title");
    const company = field(card, "base-search-card__subtitle");
    const jobLocation = field(card, "job-search-card__location");
    const posted = field(card, "job-search-card__listdate") || "Recently posted";
    if (!rawId || !rawLink || !title || !company) return [];
    return [{ id: `linkedin-${rawId}`, title, company, location: jobLocation || "Location not listed", posted, source: "LinkedIn", link: decodeHtml(rawLink), capturedAt: new Date().toISOString(), search: `${keywords} · ${location} · ${timeLabel(time)}` }];
  });
}

function renderResults() {
  $("#result-count").textContent = results.length ? `${results.length} LinkedIn listings` : "No results";
  $("#results").innerHTML = results.length ? results.map((job) => `<article class="result"><input type="checkbox" data-id="${job.id}" checked aria-label="Select ${escapeHtml(job.title)}"><div><h2 title="${escapeHtml(job.title)}">${escapeHtml(job.title)}</h2><p>${escapeHtml(job.company)} · ${escapeHtml(job.location)}</p><p>${escapeHtml(job.posted)}</p></div><button class="save-one" type="button" data-id="${job.id}">Save</button></article>`).join("") : '<p class="muted">Results will appear here.</p>';
  updateSelectedButton();
}

function updateSelectedButton() { const count = [...document.querySelectorAll("#results input:checked")].length; $("#save-selected").disabled = !count; $("#save-selected").textContent = count ? `Save ${count} to Drive` : "Save selected"; }
async function saveSelected() { const selected = new Set([...document.querySelectorAll("#results input:checked")].map((input) => input.dataset.id)); await saveJobs(results.filter((job) => selected.has(job.id))); }
async function saveOne(id) { await saveJobs(results.filter((job) => job.id === id)); }

async function saveCurrentPage() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: extractJobFromPage });
    if (!result?.title) throw new Error("Open an individual job listing, then try again.");
    await saveJobs([result]);
  } catch (error) { showStatus(error.message || "This page cannot be read.", true); }
}

async function saveJobs(jobs) {
  if (!jobs.length) return;
  const { driveWebhookUrl, driveSecret } = await chrome.storage.sync.get(["driveWebhookUrl", "driveSecret"]);
  if (!driveWebhookUrl || !driveSecret) { showStatus("Add your Drive connection in Settings first.", true); return; }
  try {
    const endpointOrigin = `${new URL(driveWebhookUrl).origin}/*`;
    const origins = [endpointOrigin, "https://script.googleusercontent.com/*"];
    const granted = await chrome.permissions.contains({ origins }) || await chrome.permissions.request({ origins });
    if (!granted) throw new Error("Permission is needed to send saved jobs to your Drive archive.");
    showStatus(`Saving ${jobs.length} job${jobs.length === 1 ? "" : "s"} to Drive…`);
    const response = await fetch(driveWebhookUrl, { method: "POST", credentials: "include", headers: { "content-type": "text/plain;charset=utf-8" }, body: JSON.stringify({ secret: driveSecret, jobs }) });
    if (!response.ok) throw new Error("Drive archive did not accept the jobs. Check Settings.");
    showStatus(`Saved ${jobs.length} job${jobs.length === 1 ? "" : "s"} to your Google Drive archive.`);
  } catch (error) { showStatus(error.message || "Could not save these jobs.", true); }
}

function setSearching(searching) { $("#search").disabled = searching; $("#search").textContent = searching ? "Searching…" : "Search LinkedIn"; }
function showStatus(message, isError = false) { const status = $("#status"); status.textContent = message; status.className = isError ? "status error" : "status"; }
function uniqueById(items) { return [...new Map(items.map((item) => [item.id, item])).values()]; }
function timeLabel(time) { return time === "r86400" ? "Last 24 hours" : time === "r604800" ? "Last 7 days" : "Last 30 days"; }
function decodeHtml(value) { return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">"); }
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
