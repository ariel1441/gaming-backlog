// tailwind.config.js - Arctic Theme
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0ea5e9',     // Bright sky blue
          light: '#38bdf8',       
          dark: '#0284c7',        
        },
        secondary: {
          DEFAULT: '#71717a',     // Silver gray
          light: '#a1a1aa',       
          dark: '#52525b',        
        },
        surface: {
          bg: '#0c1821',          // Dark blue background
          card: '#1e293b',        // Blue-tinted cards
          elevated: '#334155',    // Lighter blue
          border: '#0ea5e9',      // Sky blue borders
        },
        content: {
          primary: '#f0f9ff',     // Very light blue text
          secondary: '#0ea5e9',   // Sky blue text (for labels)
          muted: '#7dd3fc',       // Light blue text
        },
        state: {
          success: '#10b981',     // Emerald-500
          warning: '#f59e0b',     // Amber-500
          error: '#ef4444',       // Red-500
        },
        action: {
          primary: '#0ea5e9',            
          'primary-hover': '#0284c7',    
          secondary: '#71717a',          
          'secondary-hover': '#52525b',  
          danger: '#ef4444',             
          'danger-hover': '#dc2626',     
        },
      },
      boxShadow: {
        'glow-primary': '0 0 20px rgba(14, 165, 233, 0.4)',
        'glow-secondary': '0 0 20px rgba(113, 113, 122, 0.2)',
        'glow-error': '0 0 20px rgba(239, 68, 68, 0.3)',
      },
      spacing: { '18': '4.5rem' },
      zIndex: { 'modal': '9999', 'tooltip': '99999' }
    },
  },
  plugins: [],
};