// tailwind.config.js - Sunset Theme
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#f97316',     // Bright orange
          light: '#fb923c',       
          dark: '#ea580c',        
        },
        secondary: {
          DEFAULT: '#ec4899',     // Bright pink
          light: '#f472b6',       
          dark: '#db2777',        
        },
        surface: {
          bg: '#1f0f0a',          // Dark warm background
          card: '#2d1a14',        // Warm orange-tinted cards
          elevated: '#3d2a24',    // Lighter warm tone
          border: '#f97316',      // Orange borders
        },
        content: {
          primary: '#ffffff',     // White text
          secondary: '#f97316',   // Orange text (for labels)
          muted: '#fdba74',       // Light orange text
        },
        state: {
          success: '#22c55e',     // Green (contrast)
          warning: '#fbbf24',     // Amber
          error: '#ef4444',       // Red
        },
        action: {
          primary: '#f97316',            
          'primary-hover': '#ea580c',    
          secondary: '#ec4899',          
          'secondary-hover': '#db2777',  
          danger: '#ef4444',             
          'danger-hover': '#dc2626',     
        },
      },
      boxShadow: {
        'glow-primary': '0 0 20px rgba(249, 115, 22, 0.4)',
        'glow-secondary': '0 0 20px rgba(236, 72, 153, 0.4)',
        'glow-error': '0 0 20px rgba(239, 68, 68, 0.3)',
      },
      spacing: { '18': '4.5rem' },
      zIndex: { 'modal': '9999', 'tooltip': '99999' }
    },
  },
  plugins: [],
};