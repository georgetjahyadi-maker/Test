import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './ui/App';
import { setAccessible } from './render/palette';

try {
  if (localStorage.getItem('helios.accessible') === '1') setAccessible(true);
} catch {
  /* storage unavailable */
}

createRoot(document.getElementById('root')!).render(<App />);
