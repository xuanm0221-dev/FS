import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#2a5298',
          light: '#5b7fab',
          dark: '#2d4a6f',
        },
        accent: {
          yellow: '#f2c94c',
        },
        highlight: {
          sky: '#e0f2fe',
          yellow: '#fffbeb',
          gray: '#f5f5f5',
        },
      },
    },
  },
  plugins: [],
}
export default config

