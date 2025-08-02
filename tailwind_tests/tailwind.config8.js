// tailwind.config.js - Electric Violet Theme
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#8b5cf6',     // Bright violet
          light: '#a78bfa',       
          dark: '#7c3aed',        
        },
        secondary: {
          DEFAULT: '#84cc16',     // Bright lime
          light: '#a3e635',       
          dark: '#65a30d',        
        },
        surface: {
          bg: '#1a0f2e',          // Dark violet background
          card: '#2d1b4e',        // Violet-tinted cards
          elevated: '#3d2a5e',    // Lighter violet
          border: '#8b5cf6',      // Violet borders
        },
        content: {
          primary: '#ffffff',     // White text
          secondary: '#8b5cf6',   // Violet text (for labels)
          muted: '#c4b5fd',       // Light violet text
        },
        state: {
          success: '#22c55e',     // Green-500
          warning: '#f59e0b',     // Amber-500
          error: '#ef4444',       // Red-500
        },
        action: {
          primary: '#8b5cf6',            
          'primary-hover': '#7c3aed',    
          secondary: '#84cc16',          
          'secondary-hover': '#65a30d',  
          danger: '#ef4444',             
          'danger-hover': '#dc2626',     
        },
      },
      boxShadow: {
        'glow-primary': '0 0 20px rgba(139, 92, 246, 0.4)',
        'glow-secondary': '0 0 20px rgba(132, 204, 22, 0.4)',
        'glow-error': '0 0 20px rgba(239, 68, 68, 0.3)',
      },
      spacing: { '18': '4.5rem' },
      zIndex: { 'modal': '9999', 'tooltip': '99999' }
    },
  },
  plugins: [],
};