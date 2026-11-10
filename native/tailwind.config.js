/**
 * Reztra POS design tokens (same as the tablet / mobile design boards and the desktop app).
 * Every colour is a CSS variable, set by src/ui/theme.js for the light or dark theme.
 * @type {import('tailwindcss').Config}
 */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: v('brand'), tint: v('brand-tint'), soft: v('brand-soft'), dark: v('brand-dark') },
        ink: { DEFAULT: v('ink'), 2: v('ink-2'), 3: v('ink-3') },
        rail: v('rail'),
        app: v('app'),
        card: v('card'),         // panels, sheets, cards (was bg-white)
        soft: v('soft'),         // footers, quiet areas
        line: v('line'),
        chip: v('chip'),
        inverse: v('inverse'),   // dark surfaces with white text (toast, active pill, "View order" bar)
        ok: { DEFAULT: v('ok'), bg: v('ok-bg') },
        warn: { DEFAULT: v('warn'), bg: v('warn-bg'), bar: v('warn-bar') },
        danger: { DEFAULT: v('danger'), bg: v('danger-bg') },
        info: { DEFAULT: v('info'), bg: v('info-bg') },
      },
      borderRadius: { card: '16px', btn: '13px' },
    },
  },
  plugins: [],
};