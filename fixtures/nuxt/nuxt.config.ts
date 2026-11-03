import tailwindcss from '@tailwindcss/vite';

export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: false },
  telemetry: false,
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
});
