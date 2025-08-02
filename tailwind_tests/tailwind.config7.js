// tailwind.config.js - Blood Moon Theme
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#dc2626',     // Bright red
          light: '#ef4444',       
          dark: '#b91c1c',        
        },
        secondary: {
          DEFAULT: '#ea580c',     // Orange-red
          light: '#f97316',       
          dark: '#c2410c',        
        },
        surface: {
          bg: '#1a0808',          // Dark red background
          card: '#2d1111',        // Red-tinted cards
          elevated: '#3d1a1a',    // Lighter red
          border: '#dc2626',      // Red borders
        },
        content: {
          primary: '#ffffff',     // White text
          secondary: '#dc2626',   // Red text (for labels)
          muted: '#fca5a5',       // Light red text
        },
        state: {
          success: '#22c55e',     // Green-500
          warning: '#f59e0b',     // Amber-500
          error: '#dc2626',       // Red-600
        },
        action: {
          primary: '#dc2626',            
          'primary-hover': '#b91c1c',    
          secondary: '#ea580c',          
          'secondary-hover': '#c2410c',  
          danger: '#dc2626',             
          'danger-hover': '#991b1b',     
        },
      },
      boxShadow: {
        'glow-primary': '0 0 20px rgba(220, 38, 38, 0.5)',
        'glow-secondary': '0 0 20px rgba(234, 88, 12, 0.4)',
        'glow-error': '0 0 20px rgba(220, 38, 38, 0.5)',
      },
      spacing: { '18': '4.5rem' },
      zIndex: { 'modal': '9999', 'tooltip': '99999' }
    },
  },
  plugins: [],
};