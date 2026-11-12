/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,html}'
  ],
  theme: {
    extend: {
      colors: {
        paper: '#F6F3EC',
        paper2: '#FBF9F4',
        ink: '#1B2922',
        line: '#E4DED1',
        'line-soft': '#EEE9DF',
        pine: {
          50: '#F0F5F2', 100: '#DDE9E3', 200: '#BED4C9', 300: '#93B6A6',
          400: '#639481', 500: '#3F7562', 600: '#2C5E4D', 700: '#214B3E',
          800: '#183D32', 900: '#123229', 950: '#0A241D'
        },
        gold: {
          50: '#FBF6EC', 100: '#F4E9D2', 200: '#E9D3A6', 300: '#DCB978',
          400: '#CDA25C', 500: '#B98A46', 600: '#9A6E34', 700: '#7A5428'
        },
        clay: {
          50: '#FAF0ED', 100: '#F3DCD5', 200: '#EBC9BE', 300: '#DCA590',
          500: '#B46650', 600: '#98503C', 700: '#7A4031'
        }
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Text', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'system-ui', 'sans-serif'],
        display: ['Noto Serif SC', 'Songti SC', 'STSong', 'SimSun', 'serif']
      },
      boxShadow: {
        soft: '0 1px 2px rgba(27, 41, 34, 0.03), 0 16px 44px -28px rgba(27, 41, 34, 0.22)',
        lift: '0 2px 4px rgba(27, 41, 34, 0.04), 0 24px 60px -30px rgba(27, 41, 34, 0.30)'
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem'
      }
    }
  },
  plugins: []
};
