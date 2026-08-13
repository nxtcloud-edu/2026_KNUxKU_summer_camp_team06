import animate from 'tailwindcss-animate';

/**
 * KEEP:ON uses a hand-written CSS design system in src/index.css.
 * Tailwind is therefore added in "additive" mode:
 *  - preflight is disabled so Tailwind never resets the existing pages
 *  - shadcn theme tokens are namespaced as --sd-* to avoid colliding with
 *    the existing :root tokens (--background, --border, --primary, ...)
 *  - the scoped reset lives in src/styles/shadcn.css under .tw-root
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--sd-border))',
        input: 'hsl(var(--sd-input))',
        ring: 'hsl(var(--sd-ring))',
        background: 'hsl(var(--sd-background))',
        foreground: 'hsl(var(--sd-foreground))',
        primary: {
          DEFAULT: 'hsl(var(--sd-primary))',
          foreground: 'hsl(var(--sd-primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--sd-secondary))',
          foreground: 'hsl(var(--sd-secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--sd-destructive))',
          foreground: 'hsl(var(--sd-destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--sd-muted))',
          foreground: 'hsl(var(--sd-muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--sd-accent))',
          foreground: 'hsl(var(--sd-accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--sd-popover))',
          foreground: 'hsl(var(--sd-popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--sd-card))',
          foreground: 'hsl(var(--sd-card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--sd-radius)',
        md: 'calc(var(--sd-radius) - 4px)',
        sm: 'calc(var(--sd-radius) - 7px)',
      },
    },
  },
  plugins: [animate],
};
