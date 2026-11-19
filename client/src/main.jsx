import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

const preloadReloadKey = 'perpuskita-vite-preload-reload-at';
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const now = Date.now();
  const previousReload = Number(sessionStorage.getItem(preloadReloadKey) || 0);
  if (now - previousReload > 30000) {
    sessionStorage.setItem(preloadReloadKey, String(now));
    window.location.reload();
    return;
  }
  console.error('Pemulihan otomatis chunk gagal; muat ulang halaman setelah beberapa saat.', event.payload);
});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
