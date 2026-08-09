"use client";

import { useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Analytics = {
  totals: { saved: number; searched: number; telegramLinked: number };
  daily: Array<{ day: string; saved: number }>;
  sources: Array<{ source: string; saved: number }>;
};
type TelegramState = { configured: boolean; linked: boolean; botUsername: string | null; link: { displayName?: string | null; notificationsEnabled?: number } | null };

export default function InsightsPanel() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [telegram, setTelegram] = useState<TelegramState | null>(null);
  const [telegramMessage, setTelegramMessage] = useState("");
  const [realtimeMessage, setRealtimeMessage] = useState("Connecting to live updates…");
  const [linking, setLinking] = useState(false);

  async function refresh() {
    const response = await fetch("/api/analytics", { cache: "no-store" });
    if (response.ok) setAnalytics(await response.json() as Analytics);
  }

  useEffect(() => {
    fetch("/api/analytics", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((value) => value && setAnalytics(value as Analytics)).catch(() => undefined);
    fetch("/api/telegram/status", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((value) => value && setTelegram(value as TelegramState)).catch(() => undefined);
  }, []);

  useEffect(() => {
    let socket: Socket | null = null;
    let cancelled = false;
    fetch("/api/realtime/token", { cache: "no-store" }).then((response) => response.json()).then((data: { configured?: boolean; url?: string; token?: string }) => {
      if (cancelled) return;
      if (!data.configured || !data.url || !data.token) { setRealtimeMessage("Live updates activate after the realtime service is configured."); return; }
      socket = io(data.url, { auth: { token: data.token }, transports: ["websocket", "polling"] });
      socket.on("connect", () => setRealtimeMessage("Live updates connected."));
      socket.on("connect_error", () => setRealtimeMessage("Live updates are temporarily unavailable."));
      for (const event of ["scrape:started", "scrape:progress", "job:saved", "digest:ready"]) socket.on(event, (payload: { count?: number; saved?: number }) => {
        setRealtimeMessage(event === "job:saved" ? `${payload.count || payload.saved || 0} new jobs saved just now.` : `${event.replace(":", " ")} received.`);
        refresh().catch(() => undefined);
      });
    }).catch(() => setRealtimeMessage("Live updates activate after the realtime service is configured."));
    return () => { cancelled = true; socket?.disconnect(); };
  }, []);

  async function linkTelegram() {
    setLinking(true); setTelegramMessage("");
    try {
      const response = await fetch("/api/telegram/link", { method: "POST" });
      const data = await response.json() as { botUrl?: string; instruction?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "Telegram linking failed.");
      setTelegramMessage(data.instruction || "Open Telegram to finish linking.");
      if (data.botUrl) window.open(data.botUrl, "_blank", "noopener,noreferrer");
    } catch (error) { setTelegramMessage(error instanceof Error ? error.message : "Telegram linking failed."); }
    finally { setLinking(false); }
  }

  const chartData = useMemo(() => analytics?.daily.length ? analytics.daily : [{ day: "No runs yet", saved: 0 }], [analytics]);
  const sourceData = useMemo(() => analytics?.sources.length ? analytics.sources.slice(0, 6) : [{ source: "No sources yet", saved: 0 }], [analytics]);

  return <section className="insights-section" aria-label="Progress analytics and integrations">
    <div className="insights-heading"><div><p className="section-kicker">Progress intelligence</p><h2>See the signal building over time.</h2></div><span className="realtime-pill"><i />{realtimeMessage}</span></div>
    <div className="metric-row"><Metric label="Jobs saved" value={analytics?.totals.saved || 0} detail="All-time history" /><Metric label="Jobs searched" value={analytics?.totals.searched || 0} detail="Provider results" /><Metric label="Telegram" value={analytics?.totals.telegramLinked ? "Linked" : "Ready to link"} detail={analytics?.totals.telegramLinked ? "Daily updates on" : "Prompt-to-search"} /></div>
    <div className="charts-grid"><article className="chart-card"><div className="chart-title"><div><p className="section-kicker">Saved momentum</p><h3>Jobs saved per day</h3></div><span>30 days</span></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 12, right: 8, left: -28, bottom: 0 }}><defs><linearGradient id="savedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0d9f8b" stopOpacity={0.32} /><stop offset="100%" stopColor="#0d9f8b" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid stroke="#e4eee9" vertical={false} /><XAxis dataKey="day" tickFormatter={(value) => String(value).slice(5)} tickLine={false} axisLine={false} tick={{ fill: "#8aa09f", fontSize: 10 }} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#8aa09f", fontSize: 10 }} /><Tooltip contentStyle={{ border: "1px solid #d7e6df", borderRadius: 8, fontSize: 12 }} /><Area type="monotone" dataKey="saved" stroke="#0d9f8b" strokeWidth={2.5} fill="url(#savedFill)" /></AreaChart></ResponsiveContainer></div></article><article className="chart-card"><div className="chart-title"><div><p className="section-kicker">Source mix</p><h3>Where your jobs come from</h3></div><span>All time</span></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={sourceData} layout="vertical" margin={{ top: 0, right: 10, left: 2, bottom: 0 }}><CartesianGrid stroke="#e4eee9" horizontal={false} /><XAxis type="number" allowDecimals={false} hide /><YAxis type="category" dataKey="source" width={84} tickLine={false} axisLine={false} tick={{ fill: "#71898b", fontSize: 10 }} /><Tooltip contentStyle={{ border: "1px solid #d7e6df", borderRadius: 8, fontSize: 12 }} /><Bar dataKey="saved" fill="#53b5a0" radius={[0, 5, 5, 0]} barSize={16} /></BarChart></ResponsiveContainer></div></article></div>
    <article className="telegram-card"><div><p className="section-kicker">Telegram control room</p><h3>{telegram?.linked ? "Telegram is connected." : "Search from Telegram."}</h3><p>{telegram?.linked ? "Send a natural-language job prompt to your bot. Search results and daily totals will arrive in the same chat." : telegram?.configured ? "Link your bot once, then use prompts instead of opening the dashboard." : "Add TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME on the server to enable prompt-based searches."}</p></div><div className="telegram-actions"><span className={telegram?.linked ? "integration-status connected" : "integration-status"}>{telegram?.linked ? "● Connected" : telegram?.configured ? "○ Not linked" : "○ Not configured"}</span>{telegram?.configured && !telegram?.linked && <button type="button" onClick={linkTelegram} disabled={linking}>{linking ? "Creating link…" : "Connect Telegram ↗"}</button>}{telegramMessage && <small role="status">{telegramMessage}</small>}</div></article>
  </section>;
}

function Metric({ label, value, detail }: { label: string; value: number | string; detail: string }) { return <div className="metric-card"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>; }
