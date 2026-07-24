import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#EFF6FF",
          100: "#DBEAFE",
          500: "#1463FF",
          600: "#0B4FDB",
          700: "#093FAF",
        },
        navy: {
          900: "#0B1635",
          800: "#17264A",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          soft: "#F1F6FF",
          page: "#F7FAFF",
        },
        ink: {
          950: "#0B1635",
          900: "#17264A",
          800: "#334155",
        },
      },
      fontFamily: {
        sans: ["var(--font-manrope)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        control: "13px",
        card: "20px",
        modal: "24px",
      },
      boxShadow: {
        subtle: "0 1px 2px rgba(11,22,53,0.04)",
        card: "0 8px 24px rgba(20,99,255,0.06)",
        elevated: "0 16px 40px rgba(11,22,53,0.10)",
        glow: "0 8px 24px rgba(20,99,255,0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
