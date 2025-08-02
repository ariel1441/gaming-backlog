// tailwind.config.js - Retro Theme
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#eab308',     // Bright yellow
          light: '#facc15',       
          dark: '#ca8a04',        
        },
        secondary: {
          DEFAULT: '#d946ef',     // Bright magenta
          light: '#e879f9',       
          dark: '#c026d3',        
        },
        surface: {
          bg: '#1a1625',          // Dark purple background
          card: '#2a2435',        // Purple-tinted cards
          elevated: '#3f3f46',    // Lighter purple
          border: '#eab308',      // Yellow borders
        },
        content: {
          primary: '#ffffff',     // White text
          secondary: '#eab308',   // Yellow text (for labels)
          muted: '#fde047',       // Light yellow text
        },
        state: {
          success: '#22c55e',     // Green-500
          warning: '#f59e0b',     // Amber-500
          error: '#ef4444',       // Red-500
        },
        action: {
          primary: '#eab308',            
          'primary-hover': '#ca8a04',    
          secondary: '#d946ef',          
          'secondary-hover': '#c026d3',  
          danger: '#ef4444',             
          'danger-hover': '#dc2626',     
        },
      },
      boxShadow: {
        'glow-primary': '0 0 20px rgba(234, 179, 8, 0.4)',
        'glow-secondary': '0 0 20px rgba(217, 70, 239, 0.4)',
        'glow-error': '0 0 20px rgba(239, 68, 68, 0.3)',
      },
      spacing: { '18': '4.5rem' },
      zIndex: { 'modal': '9999', 'tooltip': '99999' }
    },
  },
  plugins: [],
};