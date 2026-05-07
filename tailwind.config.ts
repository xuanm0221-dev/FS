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
          DEFAULT: '#1e3a5f',
          light: '#2d527f',
          dark: '#152841',
        },
        header: {
          bg: '#1e3a5f',
          text: '#ffffff',
        },
        accent: {
          yellow: '#f2c94c',
        },
        highlight: {
          sky: '#f0f9ff',
          yellow: '#fefce8',
          gray: '#f9fafb',
          mint: '#ecfdf5',
          orange: '#ffedd5',
          pink: '#fdf2f8',
        },
      },
    },
  },
  plugins: [],
}
export default config

