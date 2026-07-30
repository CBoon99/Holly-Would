import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0b0c10",
          900: "#12141c",
          800: "#1a1d29",
          700: "#252a3a",
        },
        stage: {
          gold: "#e8c547",
          coral: "#ff6b6b",
          mint: "#4ecdc4",
          mist: "#a8b2d1",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
