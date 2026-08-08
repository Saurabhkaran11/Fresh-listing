"use client";

import { FormEvent, useMemo, useState } from "react";

type TimeWindow = "r86400" | "r604800" | "r2592000";

type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  posted: string;
  link: string;
};

type SearchResponse = {
  jobs: Job[];
  exhausted: boolean;
  scanned: number;
  notice?: string;
};

const windows: { value: TimeWindow; label: string; detail: string }[] = [
  { value: "r86400", label: "Last 24 hours", detail: "Freshest" },
  { value: "r604800", label: "Last 7 days", detail: "This week" },
  { value: "r2592000", label: "Last 30 days", detail: "This month" },
];

const popularSearches = ["Product designer", "Data analyst", "Software engineer"];

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export default function Home() {
  const [keywords, setKeywords] = useState("Product designer");
  const [location, setLocation] = useState("United States");
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("r86400");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [notice, setNotice] = useState("");
  const [scanned, setScanned] = useState(0);
  const [isExhausted, setIsExhausted] = useState(false);
  const [copied, setCopied] = useState(false);

  const selectedWindow = useMemo(
    () => windows.find((window) => window.value === timeWindow) ?? windows[0],
    [timeWindow],
  );

  async function runSearch(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!keywords.trim()) {
      setNotice("Add a job title or keyword to start your search.");
      return;
    }

    setLoading(true);
    setSearched(true);
    setCopied(false);
    setNotice("");

    try {
      const params = new URLSearchParams({
        keywords: keywords.trim(),
        location: location.trim() || "Worldwide",
        time: timeWindow,
        limit: "250",
      });
      const response = await fetch(`/api/jobs?${params.toString()}`);
      const data = (await response.json()) as SearchResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Search is unavailable right now.");

      setJobs(data.jobs);
      setScanned(data.scanned);
      setIsExhausted(data.exhausted);
      setNotice(data.notice || "");
    } catch (error) {
      setJobs([]);
      setScanned(0);
      setIsExhausted(false);
      setNotice(error instanceof Error ? error.message : "Search is unavailable right now.");
    } finally {
      setLoading(false);
    }
  }

  async function copyLinks() {
    if (!jobs.length) return;
    try {
      await navigator.clipboard.writeText(jobs.map((job) => job.link).join("\n"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setNotice("Your browser blocked copying. You can still open or export every result.");
    }
  }

  function exportCsv() {
    if (!jobs.length) return;
    const rows = [
      ["Job title", "Company", "Location", "Posted", "LinkedIn link"],
      ...jobs.map((job) => [job.title, job.company, job.location, job.posted, job.link]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `fresh-listings-${timeWindow.replace("r", "")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <div className="page-glow page-glow-left" aria-hidden="true" />
      <div className="page-glow page-glow-right" aria-hidden="true" />

      <header className="topbar">
        <a className="brand" href="#search" aria-label="Fresh Listings home">
          <span className="brand-mark" aria-hidden="true"><i /></span>
          <span>fresh listings</span>
        </a>
        <div className="topbar-note"><span className="live-dot" /> Public LinkedIn jobs</div>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <p className="eyebrow"><span>✦</span> A quieter way to search</p>
        <h1 id="hero-title">Don&apos;t miss the <em>window.</em></h1>
        <p className="hero-copy">
          Search current LinkedIn job listings, keep only the dates that matter,
          and save every direct link in one focused place.
        </p>
      </section>

      <section className="search-card" id="search" aria-label="Job search">
        <form onSubmit={runSearch}>
          <div className="search-fields">
            <label className="field field-keyword">
              <span className="field-label">What role are you looking for?</span>
              <span className="input-wrap"><span aria-hidden="true">⌕</span><input value={keywords} onChange={(event) => setKeywords(event.target.value)} placeholder="e.g. Product designer" /></span>
            </label>
            <label className="field">
              <span className="field-label">Where?</span>
              <span className="input-wrap"><span aria-hidden="true">⌖</span><input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="City, country, or remote" /></span>
            </label>
            <button className="search-button" type="submit" disabled={loading}>
              {loading ? <><span className="spinner" /> Searching</> : <>Search jobs <span aria-hidden="true">↗</span></>}
            </button>
          </div>

          <div className="window-row">
            <span className="window-label">Posted</span>
            <div className="window-picker" role="radiogroup" aria-label="Posting date range">
              {windows.map((window) => (
                <button
                  key={window.value}
                  type="button"
                  role="radio"
                  aria-checked={timeWindow === window.value}
                  className={timeWindow === window.value ? "window-option selected" : "window-option"}
                  onClick={() => setTimeWindow(window.value)}
                >
                  <span>{window.label}</span><small>{window.detail}</small>
                </button>
              ))}
            </div>
            <div className="popular"><span>Try:</span>{popularSearches.map((search) => <button type="button" key={search} onClick={() => setKeywords(search)}>{search}</button>)}</div>
          </div>
        </form>
      </section>

      <section className="results-section" aria-labelledby="results-title">
        <div className="results-heading">
          <div>
            <p className="section-kicker">Search results</p>
            <h2 id="results-title">
              {loading ? "Looking for fresh matches…" : searched ? `${jobs.length} ${jobs.length === 1 ? "listing" : "listings"} found` : "Your fresh results will appear here"}
            </h2>
          </div>
          <div className="results-actions">
            {jobs.length > 0 && <><button type="button" onClick={copyLinks}>{copied ? "Links copied" : "Copy links"}</button><button type="button" className="export-button" onClick={exportCsv}>Export CSV <span aria-hidden="true">↓</span></button></>}
          </div>
        </div>

        {searched && !loading && (
          <div className="status-line" role="status">
            <span className="status-check">✓</span>
            <span>{isExhausted ? `Reached the end of the public results (${scanned} checked).` : `Scanned ${scanned} public listings, capped at 250 per search.`}</span>
          </div>
        )}

        <div className={jobs.length ? "results-table" : "results-table empty"}>
          {loading ? <LoadingRows /> : jobs.length ? <JobRows jobs={jobs} /> : <EmptyState searched={searched} windowLabel={selectedWindow.label} notice={notice} />}
        </div>

        <p className="disclaimer">
          Fresh Listings reads the public job search feed on demand. Availability and posting dates are supplied by LinkedIn; direct links open on LinkedIn.
        </p>
      </section>
    </main>
  );
}

function JobRows({ jobs }: { jobs: Job[] }) {
  return (
    <>
      <div className="table-head" aria-hidden="true"><span>Role</span><span>Company</span><span>Posted</span><span>Location</span><span /></div>
      <div className="table-body">
        {jobs.map((job) => (
          <article className="job-row" key={job.id}>
            <div className="role-cell"><span className="job-avatar">{job.company.slice(0, 1).toUpperCase()}</span><div><h3>{job.title}</h3><p className="mobile-company">{job.company}</p></div></div>
            <p className="company-cell">{job.company}</p>
            <p className="posted-cell"><span className="tiny-clock" aria-hidden="true" />{job.posted}</p>
            <p className="location-cell">{job.location}</p>
            <a className="open-job" href={job.link} target="_blank" rel="noreferrer" aria-label={`Open ${job.title} at ${job.company} on LinkedIn`}>View <span aria-hidden="true">↗</span></a>
          </article>
        ))}
      </div>
    </>
  );
}

function LoadingRows() {
  return <div className="loading-rows" aria-label="Loading results"><div /><div /><div /><div /><div /></div>;
}

function EmptyState({ searched, windowLabel, notice }: { searched: boolean; windowLabel: string; notice: string }) {
  return (
    <div className="empty-state">
      <span className="empty-mark" aria-hidden="true">✦</span>
      <h3>{searched ? "No matching listings just yet" : "A clean slate, for now."}</h3>
      <p>{notice || (searched ? "Try a broader job title, another location, or a longer date range." : `Choose a role and we’ll collect public jobs posted in ${windowLabel.toLowerCase()}.`)}</p>
    </div>
  );
}
