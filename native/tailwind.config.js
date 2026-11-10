/**
 * Reztra POS design tokens (same as the tablet / mobile design boards and the desktop app).
 * @type {import('tailwindcss').Config}
 */
module.exports = {
  content: ['./App.{js,jsx,ts,tsx}', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#5B3FD1', tint: '#EFEBFF', soft: '#D9D0FF', dark: '#3F2A9E' },
        ink: { DEFAULT: '#141A2A', 2: '#5A6478', 3: '#8B93A6' },
        rail: '#151B2E',
        app: '#EEF0F5',
        line: '#E3E7EE',
        chip: '#F1F3F7',
        ok: { DEFAULT: '#12A15A', bg: '#DFF5E8' },
        warn: { DEFAULT: '#B76E00', bg: '#FFF2D9', bar: '#F59E0B' },
        danger: { DEFAULT: '#D93545', bg: '#FDE8EA' },
        info: { DEFAULT: '#2563EB', bg: '#E3EDFF' },
      },
      borderRadius: { card: '16px', btn: '13px' },
    },
  },
  plugins: [],
};
