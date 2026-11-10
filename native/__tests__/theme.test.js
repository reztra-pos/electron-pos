// Light / dark theme: the Tailwind colours are CSS variables that ThemeProvider switches.
// The real compiled Tailwind CSS (TW_CSS) is registered so className is resolved like on the device.
import React from 'react';
import fs from 'fs';
import { View, Text } from 'react-native';
import { render, act, screen } from '@testing-library/react-native';
import { registerCSS, setupAllComponents } from 'react-native-css-interop/dist/test';
import { ThemeProvider, useTheme, COLORS } from '../src/ui/theme';

const css = process.env.TW_CSS ? fs.readFileSync(process.env.TW_CSS, 'utf8') : null;
const flat = (s) => Object.assign({}, ...[].concat(s).flat(9).filter(Boolean));
let api;
function Probe() {
  api = useTheme();
  return <View testID="card" className="bg-card border border-line"><Text testID="txt" className="text-ink">x</Text></View>;
}

(css ? test : test.skip)('light and dark resolve to the right colours, and switch at run time', async () => {
  setupAllComponents();
  registerCSS(css);
  render(<ThemeProvider initialMode="light"><Probe /></ThemeProvider>);
  const bg = () => flat(screen.getByTestId('card').props.style).backgroundColor;
  const fg = () => flat(screen.getByTestId('txt').props.style).color;
  console.log('light', bg(), fg(), COLORS.ink);
  expect(String(bg()).replace(/\s/g, '')).toMatch(/255,255,255|#fff/i);
  await act(async () => api.setMode('dark'));
  console.log('dark', bg(), fg(), COLORS.ink);
  expect(String(bg()).replace(/\s/g, '')).toMatch(/26,32,43/);
  expect(String(fg()).replace(/\s/g, '')).toMatch(/232,236,243/);
  expect(COLORS.ink).toBe('#E8ECF3');
});