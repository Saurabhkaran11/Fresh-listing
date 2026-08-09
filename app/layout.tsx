import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const metadataBase = new URL(`${protocol}://${host}`);

  return {
    metadataBase,
    title: "Fresh Listings — Automated SDE job tracker",
    description: "Search live job listings, persist every detail, sync to Google Drive and Excel-compatible Sheets, and send a daily digest.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title: "Fresh Listings — Automated SDE job tracker", description: "Live job search with persistent history, Drive sync, and digests.", images: [{ url: "/og.png", width: 1731, height: 909, alt: "Fresh Listings automated job tracker" }] },
    twitter: { card: "summary_large_image", title: "Fresh Listings — Automated SDE job tracker", description: "Live job search with persistent history, Drive sync, and digests.", images: ["/og.png"] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
