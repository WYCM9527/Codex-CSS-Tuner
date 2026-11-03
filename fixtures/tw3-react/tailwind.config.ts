import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: '#3b5bdb',
        ink: '#1c1c1e',
        paper: '#f8f6f1',
      },
      borderRadius: {
        card: '14px',
      },
      spacing: {
        gutter: '18px',
      },
    },
  },
} satisfies Config;
