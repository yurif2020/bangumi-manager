/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          '"PingFang SC"',
          '"Microsoft YaHei"',
          '"Noto Sans SC"',
          'sans-serif',
        ],
      },
      colors: {
        ink: {
          50: '#f6f7f9',
          100: '#eceef2',
          200: '#d6dae2',
          300: '#b3bac7',
          400: '#8a93a5',
          500: '#6b7488',
          600: '#555d70',
          700: '#454c5c',
          800: '#2f3542',
          900: '#1e222b',
          950: '#14171d',
        },
        // 强调色走 CSS 变量，主题切换只改 :root 上的三个变量
        brand: {
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,20,28,.04), 0 8px 24px -12px rgba(16,20,28,.18)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .18s ease-out both',
      },
    },
  },
  plugins: [],
};
