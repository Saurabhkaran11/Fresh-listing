/* global chrome */
const $ = (selector) => document.querySelector(selector);

document.addEventListener("DOMContentLoaded", () => {
  $("#settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
  $("#save-form").addEventListener("submit", saveManualJob);
});

async function saveManualJob(event) {
  event.preventDefault();
  const link = $("#link").value.trim();
  let parsed;
  try {
    parsed = new URL(link);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
  } catch {
    showStatus("Enter a valid http(s) job URL.", true);
    return;
  }

  const job = {
    id: `${$("#source").value}-${stableId(link)}`,
    title: $("#title").value.trim(),
    company: $("#company").value.trim(),
    location: $("#location").value.trim() || "Location not listed",
    posted: $("#posted").value.trim() || "Recently listed",
    source: $("#source").value,
    link: parsed.toString(),
    capturedAt: new Date().toISOString(),
    search: $("#search").value.trim(),
  };
  await saveJobs([job]);
}

async function saveJobs(jobs) {
  const { driveWebhookUrl, driveSecret } = await chrome.storage.sync.get(["driveWebhookUrl", "driveSecret"]);
  if (!driveWebhookUrl || !driveSecret) { showStatus("Add your Drive connection in Settings first.", true); return; }
  try {
    const endpointOrigin = `${new URL(driveWebhookUrl).origin}/*`;
    const origins = [endpointOrigin, "https://script.googleusercontent.com/*"];
    const granted = await chrome.permissions.contains({ origins }) || await chrome.permissions.request({ origins });
    if (!granted) throw new Error("Permission is needed to send the saved job to your Drive archive.");
    $("#save").disabled = true;
    showStatus("Saving the job to your Drive archive…");
    const response = await fetch(driveWebhookUrl, { method: "POST", credentials: "omit", headers: { "content-type": "text/plain;charset=utf-8" }, body: JSON.stringify({ secret: driveSecret, jobs }) });
    if (!response.ok) throw new Error("Drive archive did not accept the job. Check Settings.");
    showStatus("Saved to your Google Drive archive.");
    $("#save-form").reset();
  } catch (error) { showStatus(error.message || "Could not save this job.", true); }
  finally { $("#save").disabled = false; }
}

function stableId(value) { let hash = 2166136261; for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return Math.abs(hash).toString(36); }
function showStatus(message, isError = false) { const status = $("#status"); status.textContent = message; status.className = isError ? "status error" : "status"; }
