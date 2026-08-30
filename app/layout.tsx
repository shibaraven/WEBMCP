import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const title = "Physical AI WebMCP Command Center - HERO-001";
const description = "A safe agent-native warehouse control layer with human approval, deterministic safety, live blockage recovery and seven WebMCP tools.";

export const metadata: Metadata = {
  metadataBase: new URL("https://physical-ai-webmcp-hero001.mingjen.chatgpt.site"),
  title,
  description,
  openGraph: { title, description, type: "website", images: [{ url: "/og.png", width: 1536, height: 1024, alt: title }] },
  twitter: { card: "summary_large_image", title, description, images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>{children}</body>
    </html>
  );
}
