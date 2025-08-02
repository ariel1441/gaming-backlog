// tailwind.config.js - Mint Fresh Theme
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#06d6a0',     // Bright mint
          light: '#40e0d0',       
          dark: '#059669',        
        },
        secondary: {
          DEFAULT: '#ff6b6b',     // Bright coral
          light: '#ff8e8e',       
          dark: '#e55555',        
        },
        surface: {
          bg: '#0d1b1a',          // Dark mint background
          card: '#1b2f2d',        // Mint-tinted cards
          elevated: '#2d4a45',    // Lighter mint
          border: '#06d6a0',      // Mint borders
        },
        content: {
          primary: '#ffffff',     // White text
          secondary: '#06d6a0',   // Mint text (for labels)
          muted: '#6ee7b7',       // Light mint text
        },
        state: {
          success: '#38a169',     // Green-500
          warning: '#ed8936',     // Orange-500
          error: '#e53e3e',       // Red-500
        },
        action: {
          primary: '#06d6a0',            
          'primary-hover': '#059669',    
          secondary: '#ff6b6b',          
          'secondary-hover': '#e55555',  
          danger: '#e53e3e',             
          'danger-hover': '#c53030',     
        },
      },
      boxShadow: {
        'glow-primary': '0 0 20px rgba(6, 214, 160, 0.4)',
        'glow-secondary': '0 0 20px rgba(255, 107, 107, 0.4)',
        'glow-error': '0 0 20px rgba(229, 62, 62, 0.3)',
      },
      spacing: { '18': '4.5rem' },
      zIndex: { 'modal': '9999', 'tooltip': '99999' }
    },
  },
  plugins: [],
};