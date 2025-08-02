// tailwind.config.js - Ocean Theme
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#3b82f6',     // Bright blue
          light: '#60a5fa',       
          dark: '#2563eb',        
        },
        secondary: {
          DEFAULT: '#14b8a6',     // Bright teal
          light: '#2dd4bf',       
          dark: '#0d9488',        
        },
        surface: {
          bg: '#0c1420',          // Dark ocean blue background
          card: '#1e293b',        // Ocean blue-tinted cards
          elevated: '#334155',    // Lighter ocean blue
          border: '#3b82f6',      // Blue borders
        },
        content: {
          primary: '#ffffff',     // White text
          secondary: '#3b82f6',   // Blue text (for labels)
          muted: '#93c5fd',       // Light blue text
        },
        state: {
          success: '#059669',     // Emerald-600
          warning: '#d97706',     // Amber-600
          error: '#dc2626',       // Red-600
        },
        action: {
          primary: '#3b82f6',            
          'primary-hover': '#2563eb',    
          secondary: '#14b8a6',          
          'secondary-hover': '#0d9488',  
          danger: '#dc2626',             
          'danger-hover': '#b91c1c',     
        },
      },
      boxShadow: {
        'glow-primary': '0 0 20px rgba(59, 130, 246, 0.4)',
        'glow-secondary': '0 0 20px rgba(20, 184, 166, 0.4)',
        'glow-error': '0 0 20px rgba(220, 38, 38, 0.3)',
      },
      spacing: { '18': '4.5rem' },
      zIndex: { 'modal': '9999', 'tooltip': '99999' }
    },
  },
  plugins: [],
};