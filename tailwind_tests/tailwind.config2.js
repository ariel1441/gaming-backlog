// tailwind.config.js - Forest Theme
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#22c55e',     // Bright green
          light: '#4ade80',       
          dark: '#16a34a',        
        },
        secondary: {
          DEFAULT: '#f97316',     // Warm orange
          light: '#fb923c',       
          dark: '#ea580c',        
        },
        surface: {
          bg: '#0d1b0f',          // Dark forest green background
          card: '#1a2e1a',        // Forest green-tinted cards
          elevated: '#2d4a2d',    // Lighter forest green
          border: '#22c55e',      // Bright green borders
        },
        content: {
          primary: '#ffffff',     // White text
          secondary: '#22c55e',   // Bright green text (for labels)
          muted: '#86efac',       // Light green text
        },
        state: {
          success: '#38a169',     // Forest green
          warning: '#ed8936',     // Warm orange
          error: '#e53e3e',       // Red
        },
        action: {
          primary: '#22c55e',            
          'primary-hover': '#16a34a',    
          secondary: '#f97316',          
          'secondary-hover': '#ea580c',  
          danger: '#e53e3e',             
          'danger-hover': '#c53030',     
        },
      },
      boxShadow: {
        'glow-primary': '0 0 20px rgba(34, 197, 94, 0.4)',
        'glow-secondary': '0 0 20px rgba(249, 115, 22, 0.4)',
        'glow-error': '0 0 20px rgba(229, 62, 62, 0.3)',
      },
      spacing: { '18': '4.5rem' },
      zIndex: { 'modal': '9999', 'tooltip': '99999' }
    },
  },
  plugins: [],
};