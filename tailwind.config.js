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
          DEFAULT: "#3b82f6", // Blue 500
          light: "#60a5fa", // Blue 400
          dark: "#2563eb", // Blue 600
        },
        surface: {
          bg: "#111827", // Gray 900
          card: "#1f2937", // Gray 800
          elevated: "#2C3E50", // Gray 700
          border: "#4b5563", // Gray 600
        },
        content: {
          primary: "#f9fafb", // Gray 50
          secondary: "#e5e7eb", // Gray 200
          muted: "#9ca3af", // Gray 400
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
        "glow-primary": "0 0 20px rgba(249, 115, 22, 0.4)",
        "glow-secondary": "0 0 20px rgba(59, 130, 246, 0.4)",
        "glow-error": "0 0 20px rgba(239, 68, 68, 0.4)",
      },
      spacing: { 18: "4.5rem" },
      zIndex: { modal: "9999", tooltip: "99999" },
    },
  },
  plugins: [],
};
