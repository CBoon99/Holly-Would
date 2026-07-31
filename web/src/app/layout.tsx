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
  title: "Holly Would — Scene practice for actors",
  description:
    "Audio-first scene practice. Original rights-safe dialogue. Choose a role, play opposite a partner, listen back.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-ink-950/70 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <a href="/" className="group flex items-baseline gap-3">
              <span className="font-display text-xl tracking-tight text-stage-chalk transition group-hover:text-white">
                Holly Would
              </span>
              <span className="hidden text-[11px] uppercase tracking-[0.18em] text-stage-mist/80 sm:inline">
                Scene practice
              </span>
            </a>
            <nav className="flex items-center gap-1 text-sm text-stage-mist">
              <a
                href="/"
                className="rounded-full px-3.5 py-1.5 transition hover:bg-white/5 hover:text-white"
              >
                Scenes
              </a>
              <a
                href="/library"
                className="rounded-full px-3.5 py-1.5 transition hover:bg-white/5 hover:text-white"
              >
                My takes
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10 md:py-14">{children}</main>
        <footer className="mx-auto max-w-6xl border-t border-white/[0.05] px-6 py-8 text-center text-xs text-stage-mist/60">
          Original platform scenes · rights-safe · audio-first craft
        </footer>
      </body>
    </html>
  );
}
