export default {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#f97316", // Orange 500
          light: "#fb923c", // Orange 400
          dark: "#ea580c", // Orange 600
          darker: "#c2410c", // Orange 700
        },
        secondary: {
          DEFAULT: "#38bdf8", // Sky 400
          light: "#7dd3fc", // Sky 300
          dark: "#0284c7", // Sky 600
        },
        surface: {
          bg: "#0A0F18",
          card: "#121A27",
          elevated: "#182235",
          border: "#263448",
        },
        content: {
          primary: "#f9fafb", // Gray 50
          secondary: "#d8dee8",
          muted: "#94a3b8",
        },
        state: {
          success: "#22c55e", // Green 500
          warning: "#eab308", // Yellow 500
          error: "#ef4444", // Red 500
        },
        action: {
          primary: "#f97316",
          "primary-hover": "#ea580c",
          secondary: "#3b82f6",
          "secondary-hover": "#2563eb",
          danger: "#ef4444",
          "danger-hover": "#dc2626",
        },
      },
      boxShadow: {
        "glow-primary": "0 18px 45px rgba(249, 115, 22, 0.18)",
        "glow-secondary": "0 18px 45px rgba(56, 189, 248, 0.16)",
        "glow-error": "0 0 20px rgba(239, 68, 68, 0.4)",
        panel: "0 18px 55px rgba(0, 0, 0, 0.28)",
      },
      spacing: { 18: "4.5rem" },
      zIndex: { modal: "9999", tooltip: "99999" },
    },
  },
  plugins: [],
};
