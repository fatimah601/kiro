// Single source of truth for timing, shared by picture and sound.
import { BEAT } from './engine.js';

export const CREDIT = {
  tokens: '2,400,000',   // estimated total session tokens (see README)
  yuan: '90',           // estimated cost in CNY
};

// Typewriter lines for the opening. Each char lands on a 16th-note grid.
export const INTRO_LINES = [
  { text: '本片由 Kiro 自行制作', start: 0.5, color: '#f4f6ff' },
  { text: `总计 Token ≈ ${CREDIT.tokens}`, start: 2.75, color: '#3df5ff' },
  { text: `约 ${CREDIT.yuan} 元`, start: 5.5, color: '#ffc23d' },
];
export const STEP = BEAT / 4; // 0.125s per character

export function typingEvents() {
  const ev = [];
  for (const L of INTRO_LINES) {
    let i = 0;
    for (const ch of L.text) {
      ev.push({ t: L.start + i * STEP, ch, space: ch === ' ' });
      i++;
    }
  }
  return ev;
}

// Section map (seconds). Every boundary is on a bar line (2s @120bpm).
export const SECTIONS = [
  { id: 'intro', start: 0, end: 8 },
  { id: 'title', start: 8, end: 12 },
  { id: 'tokenize', start: 12, end: 20 },
  { id: 'embed', start: 20, end: 28 },
  { id: 'attention', start: 28, end: 36 },
  { id: 'layers', start: 36, end: 44 },
  { id: 'predict', start: 44, end: 52 },
  { id: 'learn', start: 52, end: 60 },
  { id: 'recap', start: 60, end: 68 },
  { id: 'end', start: 68, end: 72 },
];

// Times where drums stop for a build (picture uses these to calm down)
export const BREAKS = [[6, 8], [42, 44], [66.5, 68]];
export const isBreak = t => BREAKS.some(([a, b]) => t >= a && t < b);
