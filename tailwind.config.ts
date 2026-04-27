import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Brand palette
        brand: {
          50: "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a",
          700: "#15803d",
          800: "#166534",
          900: "#14532d",
        },
        // Entry type colors
        food: "#22c55e",
        exercise: "#3b82f6",
        sleep: "#a855f7",
        symptom: "#f97316",
        mood: "#eab308",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      // Safe area insets for mobile notch/home bar
      spacing: {
        "safe-top": "env(safe-area-inset-top)",
        "safe-bottom": "env(safe-area-inset-bottom)",
      },
      keyframes: {
        "scan-line": {
          "0%":   { top: "0%" },
          "50%":  { top: "calc(100% - 2px)" },
          "100%": { top: "0%" },
        },
      },
      animation: {
        "scan-line": "scan-line 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
