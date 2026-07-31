import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#07080c",
          900: "#0e1016",
          800: "#161922",
          700: "#222632",
          600: "#2e3444",
        },
        stage: {
          /** Warm cream — primary CTA fill (not loud yellow blocks) */
          cream: "#f3efe6",
          /** Soft amber — accents only */
          gold: "#c9a962",
          coral: "#e07a6a",
          mint: "#7eb8b0",
          mist: "#9aa3b8",
          chalk: "#e8e6e1",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 20px 50px -24px rgba(0,0,0,0.75)",
        glow: "0 0 0 1px rgba(201,169,98,0.18), 0 18px 40px -20px rgba(0,0,0,0.7)",
      },
      backgroundImage: {
        "cinema-fade":
          "radial-gradient(ellipse 90% 60% at 50% -20%, rgba(90,70,40,0.18), transparent 55%), radial-gradient(ellipse 50% 40% at 100% 0%, rgba(40,50,80,0.2), transparent 50%)",
      },
    },
  },
  plugins: [],
};

export default config;
