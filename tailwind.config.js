module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#f97316',     // Orange 500
          light: '#fb923c',       // Orange 400
          dark: '#ea580c',        // Orange 600
        },
        secondary: {
          DEFAULT: '#3b82f6',     // Blue 500
          light: '#60a5fa',       // Blue 400
          dark: '#2563eb',        // Blue 600
        },
        surface: {
          bg: '#111827',          // Gray 900
          card: '#1f2937',        // Gray 800
          elevated: '#374151',    // Gray 700
          border: '#4b5563',      // Gray 600
        },
        content: {
          primary: '#f9fafb',     // Gray 50
          secondary: '#e5e7eb',   // Gray 200
          muted: '#9ca3af',       // Gray 400
        },
        state: {
          success: '#22c55e',     // Green 500
          warning: '#eab308',     // Yellow 500
          error: '#ef4444',       // Red 500
        },
        action: {
          primary: '#f97316',            
          'primary-hover': '#ea580c',    
          secondary: '#3b82f6',          
          'secondary-hover': '#2563eb',  
          danger: '#ef4444',             
          'danger-hover': '#dc2626',     
        },
        // Game Status Colors - Priority-based palette (warm to cool)
        status: {
          playing: '#f97316',                    // Priority 1 - Orange (primary)
          'plan-to-play-soon': '#f59e0b',        // Priority 2 - Amber  
          'plan-to-play': '#eab308',             // Priority 3 - Yellow
          'played-and-should-come-back': '#84cc16', // Priority 4 - Lime
          'play-when-in-the-mood': '#3b82f6',    // Priority 5 - Blue (secondary)
          'maybe-in-the-future': '#8b5cf6',      // Priority 6 - Violet
          'recommended-by-someone': '#06b6d4',   // Priority 7 - Cyan
          'not-anytime-soon': '#64748b',         // Priority 8 - Slate
          finished: '#22c55e',                   // Success - Green (both finished states)
          'played-alot-but-didnt-finish': '#22c55e', // Success - Green (same as finished)
          'played-a-bit': '#6b7280',             // Priority 9 - Gray
          'played-and-wont-come-back': '#ef4444', // Priority 9 - Red (negative)
        },
      },
      boxShadow: {
        'glow-primary': '0 0 20px rgba(249, 115, 22, 0.4)',
        'glow-secondary': '0 0 20px rgba(59, 130, 246, 0.4)',
        'glow-error': '0 0 20px rgba(239, 68, 68, 0.4)',
      },
      spacing: { '18': '4.5rem' },
      zIndex: { 'modal': '9999', 'tooltip': '99999' }
    },
  },
  plugins: [],
};