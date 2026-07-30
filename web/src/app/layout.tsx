import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Holly Would — Hollywood acting practice",
  description:
    "Series · technical · hilarious. Audio-first Hollywood scene practice. Filter, perform, listen back.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-screen antialiased">
        <header className="border-b border-white/10">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <a href="/" className="font-display text-xl tracking-tight text-white">
              Holly Would
              <span className="ml-2 rounded-full bg-stage-gold/15 px-2 py-0.5 text-xs font-sans font-medium text-stage-gold">
                series · hilarious
              </span>
            </a>
            <nav className="flex gap-4 text-sm text-stage-mist">
              <a href="/" className="hover:text-white">
                Scenes
              </a>
              <a href="/library" className="hover:text-white">
                My takes
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
      </body>
    </html>
  );
}
