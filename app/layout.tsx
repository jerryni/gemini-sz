import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gemini SZ",
  description: "Mobile-first Gemini chat on Next.js and Cloudflare Workers."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
