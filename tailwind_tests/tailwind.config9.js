// tailwind.config.js - Midnight Gold Theme
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#fbbf24',     // Bright gold
          light: '#fcd34d',       
          dark: '#f59e0b',        
        },
        secondary: {
          DEFAULT: '#1e40af',     // Deep blue
          light: '#3b82f6',       
          dark: '#1e3a8a',        
        },
        surface: {
          bg: '#0f1419',          // Dark blue-black background
          card: '#1e2a3a',        // Dark navy cards
          elevated: '#2a3441',    // Lighter navy
          border: '#fbbf24',      // Gold borders
        },
        content: {
          primary: '#fef3c7',     // Light gold text
          secondary: '#fbbf24',   // Gold text (for labels)
          muted: '#fde68a',       // Muted gold text
        },
        state: {
          success: '#059669',     // Emerald-600
          warning: '#d97706',     // Amber-600
          error: '#dc2626',       // Red-600
        },
        action: {
          primary: '#fbbf24',            
          'primary-hover': '#f59e0b',    
          secondary: '#1e40af',          
          'secondary-hover': '#1e3a8a',  
          danger: '#dc2626',             
          'danger-hover': '#b91c1c',     
        },
      },
      boxShadow: {
        'glow-primary': '0 0 20px rgba(251, 191, 36, 0.4)',
        'glow-secondary': '0 0 20px rgba(30, 64, 175, 0.3)',
        'glow-error': '0 0 20px rgba(220, 38, 38, 0.3)',
      },
      spacing: { '18': '4.5rem' },
      zIndex: { 'modal': '9999', 'tooltip': '99999' }
    },
  },
  plugins: [],
};