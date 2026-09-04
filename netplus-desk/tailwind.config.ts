import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        primary: {
          50: "#EEF3FF", 100: "#DCE7FF", 200: "#BED1FF", 300: "#91B1FF",
          400: "#638CFF", 500: "#4169E1", 600: "#3155C6", 700: "#2945A2",
          800: "#263D82", 900: "#24366B",
        },
        // Net Plus brand green (from the logo leaf / "Net")
        brand: {
          50: "#F3FAE8", 100: "#E4F4CF", 300: "#A9D96E", 500: "#6DB33F",
          600: "#579931", 700: "#427327",
        },
        // Net Plus brand blue (from the logo drop / "plus")
        netblue: { 500: "#2E86AB", 600: "#256E8D" },
        surface: {
          DEFAULT: "#FFFFFF", muted: "#F0F3F8", hover: "#EEF2FF",
          app: "#F6F7FB",
        },
        sidebar: { DEFAULT: "#0D1630", elevated: "#15203D" },
        ink: {
          heading: "#111827", primary: "#263247", secondary: "#667085",
          muted: "#98A2B3", disabled: "#B8C0CC",
        },
        line: { DEFAULT: "#E4E8F0", strong: "#D5DAE4" },
        success: { DEFAULT: "#16A36A", soft: "#EAF8F1" },
        warning: { DEFAULT: "#D98B18", soft: "#FFF6E5" },
        danger: { DEFAULT: "#D64545", soft: "#FDECEC" },
        info: { DEFAULT: "#3485F6", soft: "#EBF4FF" },
      },
      borderRadius: {
        control: "9px", button: "10px", icon: "12px", card: "14px", panel: "16px",
      },
      boxShadow: {
        card: "0 1px 2px rgba(16,24,40,0.04), 0 4px 12px rgba(16,24,40,0.04)",
        hover: "0 8px 24px rgba(49,85,198,0.09)",
        popover: "0 12px 32px rgba(15,23,42,0.12)",
      },
    },
  },
  plugins: [],
} satisfies Config;
