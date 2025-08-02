// tailwind.config.js - Minimal Theme
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#ffffff',     // White
          light: '#f8fafc',       
          dark: '#e2e8f0',        
        },
        secondary: {
          DEFAULT: '#64748b',     // Gray
          light: '#94a3b8',       
          dark: '#475569',        
        },
        surface: {
          bg: '#0f172a',          // Dark background
          card: '#1e293b',        // Dark gray cards
          elevated: '#334155',    // Lighter gray
          border: '#64748b',      // Gray borders
        },
        content: {
          primary: '#ffffff',     // White text
          secondary: '#64748b',   // Gray text (for labels)
          muted: '#94a3b8',       // Light gray text
        },
        state: {
          success: '#22c55e',     // Green-500
          warning: '#f59e0b',     // Amber-500
          error: '#ef4444',       // Red-500
        },
        action: {
          primary: '#ffffff',            
          'primary-hover': '#e2e8f0',    
          secondary: '#64748b',          
          'secondary-hover': '#475569',  
          danger: '#ef4444',             
          'danger-hover': '#dc2626',     
        },
      },
      boxShadow: {
        'glow-primary': '0 0 20px rgba(255, 255, 255, 0.2)',
        'glow-secondary': '0 0 20px rgba(100, 116, 139, 0.3)',
        'glow-error': '0 0 20px rgba(239, 68, 68, 0.3)',
      },
      spacing: { '18': '4.5rem' },
      zIndex: { 'modal': '9999', 'tooltip': '99999' }
    },
  },
  plugins: [],
};