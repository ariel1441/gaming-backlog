// tailwind.config.js - Synthwave Theme
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#ff007f',     // Hot magenta
          light: '#ff4da6',       
          dark: '#cc0066',        
        },
        secondary: {
          DEFAULT: '#00ffff',     // Bright cyan
          light: '#66ffff',       
          dark: '#00cccc',        
        },
        surface: {
          bg: '#0f0a1a',          // Dark purple background
          card: '#1f1535',        // Purple-tinted cards
          elevated: '#2f2045',    // Lighter purple
          border: '#ff007f',      // Magenta borders
        },
        content: {
          primary: '#ffffff',     // White text
          secondary: '#ff007f',   // Magenta text (for labels)
          muted: '#ff80bf',       // Light magenta text
        },
        state: {
          success: '#00ff88',     // Neon green
          warning: '#ffaa00',     // Neon orange
          error: '#ff0055',       // Neon red
        },
        action: {
          primary: '#ff007f',            
          'primary-hover': '#cc0066',    
          secondary: '#00ffff',          
          'secondary-hover': '#00cccc',  
          danger: '#ff0055',             
          'danger-hover': '#cc0044',     
        },
      },
      boxShadow: {
        'glow-primary': '0 0 20px rgba(255, 0, 127, 0.5)',
        'glow-secondary': '0 0 20px rgba(0, 255, 255, 0.5)',
        'glow-error': '0 0 20px rgba(255, 0, 85, 0.4)',
      },
      spacing: { '18': '4.5rem' },
      zIndex: { 'modal': '9999', 'tooltip': '99999' }
    },
  },
  plugins: [],
};