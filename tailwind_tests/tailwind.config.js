// tailwind.config.js - Cyberpunk Theme
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#00d4ff',     // Bright electric blue
          light: '#33ddff',       
          dark: '#0099cc',        
        },
        secondary: {
          DEFAULT: '#ff0080',     // Bright hot pink
          light: '#ff33a0',       
          dark: '#cc0066',        
        },
        surface: {
          bg: '#0a1728',          // Dark blue background
          card: '#1a2332',        // Blue-tinted card background
          elevated: '#2a3441',    // Lighter blue for elevated elements
          border: '#0099cc',      // Electric blue borders
        },
        content: {
          primary: '#ffffff',     // White text
          secondary: '#00d4ff',   // Electric blue text (for labels)
          muted: '#66b3d9',       // Muted blue text
        },
        state: {
          success: '#00ff88',     // Neon green
          warning: '#ffaa00',     // Neon orange
          error: '#ff0055',       // Neon red
        },
        action: {
          primary: '#00d4ff',            
          'primary-hover': '#0099cc',    
          secondary: '#ff0080',          
          'secondary-hover': '#cc0066',  
          danger: '#ff0055',             
          'danger-hover': '#cc0044',     
        },
      },
      boxShadow: {
        'glow-primary': '0 0 20px rgba(0, 212, 255, 0.4)',
        'glow-secondary': '0 0 20px rgba(255, 0, 128, 0.4)',
        'glow-error': '0 0 20px rgba(255, 0, 85, 0.4)',
      },
      spacing: { '18': '4.5rem' },
      zIndex: { 'modal': '9999', 'tooltip': '99999' }
    },
  },
  plugins: [],
};