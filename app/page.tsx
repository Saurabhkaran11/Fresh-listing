"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import InsightsPanel from "./components/insights-panel";

type TimeWindow = "r86400" | "r604800" | "r2592000";
type Source = "linkedin" | "indeed" | "builtin" | "glassdoor" | "greenhouse" | "trueup" | "google_jobs";

type Job = { id: string; title: string; company: string; location: string; posted: string; link: string; source: Source; capturedAt: string; fitScore?: number };
type SourceLink = { source: Source; label: string; url: string; note: string };
type SearchResponse = { jobs: Job[]; exhausted: boolean; scanned: number; notice?: string; sourceLinks?: SourceLink[]; provider?: string; persistedCount?: number };
type GoogleStatus = { connected: boolean; googleAccountEmail?: string | null; spreadsheetUrl: string | null; driveFolderUrl?: string | null; googleConfigured?: boolean; providerConfigured?: boolean; emailConfigured?: boolean; error?: string };
type SessionState = { authenticated: boolean; signInPath?: string; user?: { displayName: string; email: string } };

const DRIVE_ARCHIVE_URL = "https://docs.google.com/document/d/1NVTbiB73OGInnZHU7R70OSMGAIE1jINwYPWT_q1b-q0/edit";
const windows: { value: TimeWindow; label: string; detail: string }[] = [
  { value: "r86400", label: "Last 24 hours", detail: "Freshest" },
  { value: "r604800", label: "Last 7 days", detail: "This week" },
  { value: "r2592000", label: "Last 30 days", detail: "This month" },
];
const sourceOptions: { id: Source; label: string; detail: string }[] = [
  { id: "linkedin", label: "LinkedIn", detail: "Free extension" },
  { id: "indeed", label: "Indeed", detail: "Native search" },
  { id: "builtin", label: "Built In", detail: "Native search" },
  { id: "glassdoor", label: "Glassdoor", detail: "Native search" },
  { id: "greenhouse", label: "Greenhouse", detail: "Board API" },
  { id: "trueup", label: "TrueUp", detail: "Native search" },
  { id: "google_jobs", label: "Google Jobs", detail: "Automated feed" },
];
const popularSearches = ["Product designer", "Data analyst", "Software engineer"];

function csvCell(value: string) { return `"${value.replaceAll('"', '""')}"`; }

export default function Home() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [keywords, setKeywords] = useState("Product designer");
  const [location, setLocation] = useState("United States");
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("r86400");
  const [selectedSources, setSelectedSources] = useState<Source[]>(sourceOptions.map((source) => source.id));
  const [greenhouseBoards, setGreenhouseBoards] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [sourceLinks, setSourceLinks] = useState<SourceLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [notice, setNotice] = useState("");
  const [scanned, setScanned] = useState(0);
  const [isExhausted, setIsExhausted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [googleStatus, setGoogleStatus] = useState<GoogleStatus>({ connected: false, spreadsheetUrl: null });
  const [automationMessage, setAutomationMessage] = useState("");
  const [automationBusy, setAutomationBusy] = useState(false);
  const [analyzingId, setAnalyzingId] = useState("");

  const selectedWindow = useMemo(() => windows.find((window) => window.value === timeWindow) ?? windows[0], [timeWindow]);

  useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" }).then((response) => response.json()).then((data: SessionState) => setSession(data)).catch(() => setSession({ authenticated: false, signInPath: "/signin-with-chatgpt?return_to=%2F" }));
  }, []);

  useEffect(() => {
    fetch("/api/google/status").then((response) => response.json()).then((data: GoogleStatus) => setGoogleStatus(data)).catch(() => setGoogleStatus({ connected: false, spreadsheetUrl: null }));
  }, []);

  function toggleSource(source: Source) {
    setSelectedSources((current) => current.includes(source) ? current.filter((item) => item !== source) : [...current, source]);
  }

  async function runSearch(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!keywords.trim()) { setNotice("Add a job title or keyword to start your search."); return; }
    if (!selectedSources.length) { setNotice("Select at least one job source."); return; }

    setLoading(true); setSearched(true); setCopied(false); setNotice("");
    try {
      const response = await fetch("/api/scraper/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ keywords: keywords.trim(), location: location.trim() || "Worldwide", timeWindow, sources: selectedSources, greenhouseBoards: greenhouseBoards.split(",").map((value) => value.trim()).filter(Boolean) }) });
      const data = (await response.json()) as SearchResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Search is unavailable right now.");
      setJobs(data.jobs); setScanned(data.scanned); setIsExhausted(data.exhausted); setSourceLinks(data.sourceLinks || []); setNotice(data.notice || `${data.persistedCount || data.jobs.length} listings saved to your Fresh Listings history.`);
    } catch (error) {
      setJobs([]); setSourceLinks([]); setScanned(0); setIsExhausted(false); setNotice(error instanceof Error ? error.message : "Search is unavailable right now.");
    } finally { setLoading(false); }
  }

  async function copyLinks() {
    if (!jobs.length) return;
    try { await navigator.clipboard.writeText(jobs.map((job) => job.link).join("\n")); setCopied(true); window.setTimeout(() => setCopied(false), 2200); }
    catch { setNotice("Your browser blocked copying. You can still open or export every result."); }
  }

  function exportCsv() {
    if (!jobs.length) return;
    const rows = [["Job title", "Company", "Source", "Location", "Posted", "Captured at", "Direct job link"], ...jobs.map((job) => [job.title, job.company, job.source, job.location, job.posted, job.capturedAt, job.link])];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `fresh-listings-${timeWindow.replace("r", "")}.csv`; link.click(); URL.revokeObjectURL(url);
  }

  function connectGoogle() { window.location.href = "/api/google/oauth/start"; }

  async function syncToSheet() {
    setAutomationBusy(true); setAutomationMessage("");
    try {
      const response = await fetch("/api/google/sync", { method: "POST" });
      const data = await response.json() as { url?: string; saved?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "Google Sheet sync failed.");
      setGoogleStatus((current) => ({ ...current, connected: true, spreadsheetUrl: data.url || current.spreadsheetUrl }));
      setAutomationMessage(`${data.saved || 0} saved listings synced to your Excel-compatible Google Sheet.`);
    } catch (error) { setAutomationMessage(error instanceof Error ? error.message : "Google Sheet sync failed."); }
    finally { setAutomationBusy(false); }
  }

  async function sendDigest() {
    setAutomationBusy(true); setAutomationMessage("");
    try {
      const response = await fetch("/api/digest/send", { method: "POST" });
      const data = await response.json() as { recipient?: string; count?: number; error?: string };
      if (!response.ok) throw new Error(data.error || "Digest could not be sent.");
      setAutomationMessage(`Digest sent to ${data.recipient} with ${data.count} listings.`);
    } catch (error) { setAutomationMessage(error instanceof Error ? error.message : "Digest could not be sent."); }
    finally { setAutomationBusy(false); }
  }

  async function analyzeFit(job: Job) {
    setAnalyzingId(job.id); setAutomationMessage("");
    try {
      const response = await fetch("/api/ai/fit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ externalId: job.id, candidateSkills: "TypeScript, JavaScript, React, Node.js, SQL, AWS" }) });
      const data = await response.json() as { analysis?: { score?: number; summary?: string }; error?: string };
      if (!response.ok) throw new Error(data.error || "AI fit analysis failed.");
      const score = Number(data.analysis?.score || 0);
      setJobs((current) => current.map((item) => item.id === job.id ? { ...item, fitScore: score } : item));
      setAutomationMessage(`AI fit score: ${score}/100. ${data.analysis?.summary || "Analysis saved to your history."}`);
    } catch (error) { setAutomationMessage(error instanceof Error ? error.message : "AI fit analysis failed."); }
    finally { setAnalyzingId(""); }
  }

  if (!session) return <main className="auth-shell"><div className="auth-card"><span className="brand-mark" aria-hidden="true"><i /></span><p className="section-kicker">Fresh Listings</p><h1>Preparing your private workspace…</h1><p>Checking your secure session before loading your saved job history.</p><span className="spinner auth-spinner" /></div></main>;
  if (!session.authenticated) return <main className="auth-shell"><div className="auth-card"><span className="brand-mark" aria-hidden="true"><i /></span><p className="section-kicker">Private job workspace</p><h1>Sign in to start collecting.</h1><p>Your jobs, Google Drive connection, Telegram link, and progress analytics are private to your account.</p><a className="search-button auth-button" href={session.signInPath || "/signin-with-chatgpt?return_to=%2F"}>Sign in with ChatGPT ↗</a></div></main>;

  return (
    <main className="app-shell">
      <div className="page-glow page-glow-left" aria-hidden="true" /><div className="page-glow page-glow-right" aria-hidden="true" />
      <header className="topbar">
        <a className="brand" href="#search" aria-label="Fresh Listings home"><span className="brand-mark" aria-hidden="true"><i /></span><span>fresh listings</span></a>
        <div className="topbar-note"><span className="live-dot" /> {session.user?.displayName || "Private workspace"}</div>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <p className="eyebrow"><span>✦</span> The signal, in one place</p>
        <h1 id="hero-title">Don&apos;t miss the <em>window.</em></h1>
        <p className="hero-copy">Collect fresh public listings, open native searches on every major board, and save the opportunities worth keeping to your Drive archive.</p>
      </section>

      <section className="search-card" id="search" aria-label="Multi-source job search">
        <form onSubmit={runSearch}>
          <div className="search-fields">
            <label className="field field-keyword"><span className="field-label">What role are you looking for?</span><span className="input-wrap"><span aria-hidden="true">⌕</span><input value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="e.g. Product designer" /></span></label>
            <label className="field"><span className="field-label">Where?</span><span className="input-wrap"><span aria-hidden="true">⌖</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City, country, or remote" /></span></label>
            <button className="search-button" type="submit" disabled={loading}>{loading ? <><span className="spinner" /> Searching</> : <>Search jobs <span aria-hidden="true">↗</span></>}</button>
          </div>

          <div className="window-row"><span className="window-label">Posted</span><div className="window-picker" role="radiogroup" aria-label="Posting date range">{windows.map((window) => <button key={window.value} type="button" role="radio" aria-checked={timeWindow === window.value} className={timeWindow === window.value ? "window-option selected" : "window-option"} onClick={() => setTimeWindow(window.value)}><span>{window.label}</span><small>{window.detail}</small></button>)}</div><div className="popular"><span>Try:</span>{popularSearches.map((search) => <button type="button" key={search} onClick={() => setKeywords(search)}>{search}</button>)}</div></div>

          <div className="sources-row">
            <div className="sources-copy"><span className="window-label">Sources</span><small>Use the free extension for live LinkedIn collection; open native searches everywhere else.</small></div>
            <div className="source-picker" role="group" aria-label="Job sources">{sourceOptions.map((source) => <button key={source.id} type="button" aria-pressed={selectedSources.includes(source.id)} className={selectedSources.includes(source.id) ? "source-option selected" : "source-option"} onClick={() => toggleSource(source.id)}><span>{source.label}</span><small>{source.detail}</small></button>)}</div>
            {selectedSources.includes("greenhouse") && <label className="greenhouse-field"><span>Greenhouse board tokens <small>optional</small></span><input value={greenhouseBoards} onChange={(event) => setGreenhouseBoards(event.target.value)} placeholder="e.g. stripe, airbnb" /><em>Use the token in a company&apos;s greenhouse.io board URL.</em></label>}
          </div>
        </form>
      </section>

      <section className="archive-card" aria-label="Google Drive archive">
        <div><p className="section-kicker">Google Drive + Excel-compatible tracker</p><h2>{googleStatus.connected ? "Your cloud archive is connected." : "Connect your cloud archive."}</h2><p>Every saved listing is written to a native Google Sheet inside a Fresh Listings folder in the selected Google Drive account. You can open it in Drive or download it as Excel.</p>{googleStatus.connected && <p className="connected-account">Google account: <strong>{googleStatus.googleAccountEmail || "Connected account"}</strong></p>}</div>
        <div className="archive-actions"><a className="drive-button" href={googleStatus.spreadsheetUrl || DRIVE_ARCHIVE_URL} target="_blank" rel="noreferrer">{googleStatus.spreadsheetUrl ? "Open job tracker" : "Open job archive"} <span aria-hidden="true">↗</span></a>{googleStatus.driveFolderUrl && <a className="extension-button" href={googleStatus.driveFolderUrl} target="_blank" rel="noreferrer">Open Drive folder ↗</a>}<button className="extension-button" type="button" onClick={connectGoogle}>{googleStatus.connected ? "Switch Google account" : "Connect Google Drive"}</button><a className="extension-button" href="/fresh-listings-extension.zip" download>Free LinkedIn extension <span aria-hidden="true">↓</span></a></div>
      </section>

      <section className="automation-card" aria-label="Automation controls">
        <div className="automation-heading"><div><p className="section-kicker">Automation control room</p><h2>Collect once. Keep everything.</h2></div><span className={googleStatus.connected ? "connection-pill connected" : "connection-pill"}>{googleStatus.connected ? "● Drive connected" : "○ Drive not connected"}</span></div>
        <div className="automation-grid"><div><span>01</span><h3>Live provider</h3><p>{googleStatus.providerConfigured ? "SerpApi Google Jobs is ready for server-side collection." : "Add SERPAPI_API_KEY for automated cloud collection; the free extension remains available for LinkedIn."}</p></div><div><span>02</span><h3>Persistent history</h3><p>Every run is stored with source, application URL, posting age, skills, and capture time so refreshes do not erase your work.</p></div><div><span>03</span><h3>Sheets + digest</h3><p>Sync new rows to your Drive tracker and send the latest matches by email whenever you are ready.</p></div></div>
        <div className="automation-actions"><button type="button" className="automation-button" onClick={syncToSheet} disabled={automationBusy || !googleStatus.connected}>Sync new jobs to Sheet <span aria-hidden="true">↗</span></button><button type="button" className="automation-button secondary" onClick={sendDigest} disabled={automationBusy}>Send digest now <span aria-hidden="true">↗</span></button></div>
        <p className="automation-message" role="status">{automationMessage || (googleStatus.emailConfigured ? "Email digest is configured." : "Email digest becomes active after adding RESEND_API_KEY and EMAIL_FROM in Site settings.")}</p>
      </section>

      <InsightsPanel />

      <section className="results-section" aria-labelledby="results-title">
        <div className="results-heading"><div><p className="section-kicker">Search results</p><h2 id="results-title">{loading ? "Looking for fresh matches…" : searched ? `${jobs.length} ${jobs.length === 1 ? "listing" : "listings"} collected` : "Your fresh results will appear here"}</h2></div><div className="results-actions">{jobs.length > 0 && <><button type="button" onClick={copyLinks}>{copied ? "Links copied" : "Copy links"}</button><button type="button" className="export-button" onClick={exportCsv}>Export CSV <span aria-hidden="true">↓</span></button></>}</div></div>

        {searched && !loading && <div className="status-line" role="status"><span className="status-check">✓</span><span>{isExhausted ? `Reached the end of the public results (${scanned} checked).` : `Scanned ${scanned} public listings, capped at 250 per source.`}</span></div>}
        {sourceLinks.length > 0 && <div className="source-links" aria-label="Continue your search on selected sources">{sourceLinks.map((source) => <a key={source.source} href={source.url} target="_blank" rel="noreferrer"><strong>{source.label}</strong><span>{source.note}</span><b aria-hidden="true">↗</b></a>)}</div>}
        <div className={jobs.length ? "results-table" : "results-table empty"}>{loading ? <LoadingRows /> : jobs.length ? <JobRows jobs={jobs} onAnalyze={analyzeFit} analyzingId={analyzingId} /> : <EmptyState searched={searched} windowLabel={selectedWindow.label} notice={notice} />}</div>
        <p className="disclaimer">The free extension collects LinkedIn listings from your own browser, avoiding hosted-server limits. Greenhouse collects only from named public company boards. Indeed, Built In, Glassdoor, and TrueUp open their native searches; use the extension to save any result you keep into Drive.</p>
      </section>
    </main>
  );
}

function JobRows({ jobs, onAnalyze, analyzingId }: { jobs: Job[]; onAnalyze: (job: Job) => void; analyzingId: string }) {
  return <><div className="table-head" aria-hidden="true"><span>Role</span><span>Company</span><span>Source</span><span>Posted</span><span>Location</span><span /></div><div className="table-body">{jobs.map((job) => <article className="job-row" key={job.id}><div className="role-cell"><span className="job-avatar">{job.company.slice(0, 1).toUpperCase()}</span><div><h3>{job.title}</h3><p className="mobile-company">{job.company} · {job.source}</p></div><button className="fit-button" type="button" onClick={() => onAnalyze(job)} disabled={analyzingId === job.id}>{analyzingId === job.id ? "…" : job.fitScore ? `${job.fitScore}%` : "AI fit"}</button></div><p className="company-cell">{job.company}</p><p className="source-cell">{sourceOptions.find((source) => source.id === job.source)?.label}</p><p className="posted-cell"><span className="tiny-clock" aria-hidden="true" />{job.posted}</p><p className="location-cell">{job.location}</p><a className="open-job" href={job.link} target="_blank" rel="noreferrer" aria-label={`Open ${job.title} at ${job.company}`}>View <span aria-hidden="true">↗</span></a></article>)}</div></>;
}

function LoadingRows() { return <div className="loading-rows" aria-label="Loading results"><div /><div /><div /><div /><div /></div>; }
function EmptyState({ searched, windowLabel, notice }: { searched: boolean; windowLabel: string; notice: string }) { return <div className="empty-state"><span className="empty-mark" aria-hidden="true">✦</span><h3>{searched ? "No matching listings just yet" : "A clean slate, for now."}</h3><p>{notice || (searched ? "Try a broader job title, another location, or a longer date range." : `Choose a role and we’ll collect public jobs posted in ${windowLabel.toLowerCase()}.`)}</p></div>; }
