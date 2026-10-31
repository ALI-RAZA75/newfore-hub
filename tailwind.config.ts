import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: "#F15D26", dark: "#B8441A", soft: "#FDE9E0" },
        ink: { DEFAULT: "#2C3338", soft: "#363E44", muted: "#6A7179" },
        paper: { DEFAULT: "#F6F8FA", card: "#FFFFFF", line: "#E3E7EB" },
      },
      fontFamily: {
        display: ["Urbanist", "Arial", "sans-serif"],
        sans: ["Raleway", "Arial", "sans-serif"],
      },
      borderRadius: { xl: "14px" },
    },
  },
  plugins: [],
} satisfies Config;
