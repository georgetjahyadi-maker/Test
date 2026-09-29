import React, { useMemo } from 'react';
import { makeCanvas, ctx2d, hashStr, prng } from '../render/pixel';
import { PixelCanvas } from './components';

const SKIN = ['#f5d0b5', '#e8b996', '#d49e7a', '#b77b58', '#8d5a3b', '#6b4029', '#4a2b1c', '#f0c8a8', '#c68f6a', '#9e6844'];
const HAIR = ['#1b1512', '#2e211a', '#4a3223', '#6b4a2f', '#a3763e', '#d8b46a', '#9aa0a8', '#e8e8e8', '#3a1f1a', '#1f2430'];
const SUIT = ['#23324a', '#2d2d38', '#3a2a2a', '#1f3a33', '#3a3522', '#2a2a44'];
const cache = new Map<string, HTMLCanvasElement>();

export function avatarCanvas(id: string): HTMLCanvasElement {
  const c0 = cache.get(id);
  if (c0) return c0;
  const r = prng(hashStr(id));
  const c = makeCanvas(16, 16);
  const g = ctx2d(c);
  const skin = SKIN[Math.floor(r() * SKIN.length)];
  const hair = HAIR[Math.floor(r() * HAIR.length)];
  const suit = SUIT[Math.floor(r() * SUIT.length)];
  const px = (x: number, y: number, w: number, h: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x, y, w, h);
  };
  px(0, 0, 16, 16, '#0d1622');
  // shoulders
  px(2, 13, 12, 3, suit);
  px(6, 13, 4, 1, '#d9dee6');
  // neck & head
  px(6, 11, 4, 2, skin);
  const wide = r() > 0.5 ? 1 : 0;
  px(4 - wide, 4, 8 + wide * 2, 8, skin);
  px(5 - wide, 3, 6 + wide * 2, 1, skin);
  // hair styles
  const style = Math.floor(r() * 5);
  if (style === 0) {
    px(4 - wide, 2, 8 + wide * 2, 3, hair);
  } else if (style === 1) {
    px(3 - wide, 2, 10 + wide * 2, 3, hair);
    px(3 - wide, 5, 2, 6, hair);
    px(11 + wide, 5, 2, 6, hair);
  } else if (style === 2) {
    px(5, 2, 6, 2, hair);
  } else if (style === 3) {
    px(3 - wide, 1, 10 + wide * 2, 4, hair);
    px(3 - wide, 5, 1, 3, hair);
    px(12 + wide, 5, 1, 3, hair);
  } else {
    px(4 - wide, 3, 8 + wide * 2, 1, hair);
  }
  // eyes & mouth
  px(6, 7, 1, 1, '#1b1b22');
  px(9, 7, 1, 1, '#1b1b22');
  px(7, 10, 2, 1, '#7a3e32');
  if (r() > 0.75) {
    px(5, 7, 3, 1, '#9aa7b8');
    px(8, 7, 3, 1, '#9aa7b8');
  }
  cache.set(id, c);
  return c;
}

export function Avatar({ id, size = 48 }: { id: string; size?: number }) {
  const c = useMemo(() => avatarCanvas(id), [id]);
  return <PixelCanvas source={c} scale={Math.max(1, Math.round(size / 16))} style={{ border: '1px solid var(--border-strong)' }} />;
}
