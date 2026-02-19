/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
    "./app/**/*.{js,jsx}",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        heading: ['Clash Display', 'sans-serif'],
        body: ['Manrope', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        // T'aksi Cyber-Noir Luxury Theme
        background: {
          DEFAULT: "#020202",
          secondary: "#09090b",
          tertiary: "#121214",
          glass: "rgba(2, 2, 2, 0.7)",
        },
        foreground: {
          DEFAULT: "#ffffff",
          muted: "#a1a1aa",
          dim: "#52525b",
        },
        primary: {
          DEFAULT: "#00d4ff",
          glow: "rgba(0, 212, 255, 0.4)",
          dim: "#0090b0",
        },
        secondary: {
          DEFAULT: "#00ff88",
          glow: "rgba(0, 255, 136, 0.4)",
          dim: "#00b05e",
        },
        accent: {
          purple: "#7c3aed",
          error: "#ff3333",
          warning: "#fbbf24",
        },
        border: "#27272a",
        input: "#27272a",
        ring: "#00d4ff",
        destructive: {
          DEFAULT: "#ff3333",
          foreground: "#ffffff",
        },
        muted: {
          DEFAULT: "#27272a",
          foreground: "#a1a1aa",
        },
        popover: {
          DEFAULT: "#09090b",
          foreground: "#ffffff",
        },
        card: {
          DEFAULT: "#09090b",
          foreground: "#ffffff",
        },
      },
      borderRadius: {
        lg: "1rem",
        md: "0.75rem",
        sm: "0.5rem",
      },
      boxShadow: {
        'neon-cyan': '0 0 20px rgba(0, 212, 255, 0.15)',
        'neon-green': '0 0 20px rgba(0, 255, 136, 0.15)',
        'card': '0 10px 40px -10px rgba(0,0,0,0.5)',
        'glow': '0 0 15px rgba(0, 212, 255, 0.3)',
      },
      keyframes: {
        "accordion-down": {
          from: { height: 0 },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: 0 },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 15px rgba(0, 212, 255, 0.2)" },
          "50%": { boxShadow: "0 0 30px rgba(0, 212, 255, 0.5)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
