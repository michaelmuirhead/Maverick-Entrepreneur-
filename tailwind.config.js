/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'system-ui', 'sans-serif'],
      },
      colors: {
        bg: "#ffffff",
        surface: "#f7f7f9",
        surface2: "#f0f1f4",
        line: "#eceef1",
        ink: "#0b0e14",
        ink2: "#3a3f4a",
        muted: "#9aa0a8",
        blue: {
          DEFAULT: "#3b82f6",
          soft: "#dbeafe",
        },
        green: {
          DEFAULT: "#10b981",
          soft: "#d1fae5",
        },
        pink: {
          DEFAULT: "#ec4899",
          soft: "#fce7f3",
        },
        purple: {
          DEFAULT: "#8b5cf6",
          soft: "#ede9fe",
        },
        yellow: {
          DEFAULT: "#eab308",
          soft: "#fef3c7",
          deep: "#a16207",
        },
        orange: {
          DEFAULT: "#f97316",
          soft: "#ffedd5",
        },
        red: {
          DEFAULT: "#ef4444",
          soft: "#fee2e2",
        },
        paper: "#ffffff",
        parchment: "#f7f7f9",
        accent: "#f97316",
        gold: "#eab308",
        moss: "#10b981",
      },
      borderRadius: {
        card: "16px",
        tile: "14px",
        chip: "10px",
      },
      boxShadow: {
        soft: "0 2px 8px -2px rgba(0,0,0,0.08)",
        float: "0 8px 24px -8px rgba(0,0,0,0.15)",
        cta: "0 4px 14px -4px rgba(59,130,246,0.4)",
      },
    },
  },
  plugins: [],
};
