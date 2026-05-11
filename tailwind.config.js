/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
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
        sans: ["var(--ti-font-sans)"],
        mono: ["var(--ti-font-mono)"],
        cond: ["var(--ti-font-cond)"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        ti: {
          bg: "var(--ti-bg)",
          surface: "var(--ti-surface)",
          "surface-2": "var(--ti-surface-2)",
          sunken: "var(--ti-sunken)",
          border: "var(--ti-border)",
          "border-soft": "var(--ti-border-soft)",
          divider: "var(--ti-divider)",
          ink: "var(--ti-ink)",
          "ink-2": "var(--ti-ink-2)",
          muted: "var(--ti-muted)",
          faint: "var(--ti-faint)",
          accent: "var(--ti-accent)",
          "accent-soft": "var(--ti-accent-soft)",
          "accent-ink": "var(--ti-accent-ink)",
          "on-accent": "var(--ti-on-accent)",
          success: "var(--ti-success)",
          "success-soft": "var(--ti-success-soft)",
          warning: "var(--ti-warning)",
          "warning-soft": "var(--ti-warning-soft)",
          danger: "var(--ti-danger)",
          "danger-soft": "var(--ti-danger-soft)",
          info: "var(--ti-info)",
          "info-soft": "var(--ti-info-soft)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "var(--ti-radius-xl)",
        pill: "var(--ti-radius-pill)",
      },
      boxShadow: {
        "ti-sm": "var(--ti-shadow-sm)",
        "ti-md": "var(--ti-shadow-md)",
        "ti-lg": "var(--ti-shadow-lg)",
      },
      minHeight: {
        "ti-row": "var(--ti-row)",
        "ti-ctrl": "var(--ti-ctrl)",
      },
      height: {
        "ti-row": "var(--ti-row)",
        "ti-ctrl": "var(--ti-ctrl)",
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
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
}