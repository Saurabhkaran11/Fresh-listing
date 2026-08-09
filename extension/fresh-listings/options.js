const webhook = document.querySelector("#webhook");
const secret = document.querySelector("#secret");
const status = document.querySelector("#status");

document.addEventListener("DOMContentLoaded", async () => {
  const stored = await chrome.storage.sync.get(["driveWebhookUrl", "driveSecret"]);
  webhook.value = stored.driveWebhookUrl || "";
  secret.value = stored.driveSecret || "";
  document.querySelector("#save").addEventListener("click", save);
});

async function save() {
  try { new URL(webhook.value); } catch { status.textContent = "Enter a valid Google Apps Script Web app URL."; return; }
  if (!secret.value.trim()) { status.textContent = "Enter the archive secret from your Apps Script."; return; }
  await chrome.storage.sync.set({ driveWebhookUrl: webhook.value.trim(), driveSecret: secret.value.trim() });
  status.textContent = "Connection saved. You can now save jobs from a detail page.";
}
