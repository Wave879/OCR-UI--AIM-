/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                navy: {
                    50: '#e6eaf4',
                    100: '#c0ccde',
                    200: '#99aec8',
                    300: '#7390b2',
                    400: '#4d729c',
                    500: '#265486',
                    600: '#0e3a6b',
                    700: '#002060',
                    800: '#001a4f',
                    900: '#00143e',
                },
                orange: {
                    accent: '#FF8C00',
                    light: '#FFA333',
                    dark: '#E07C00',
                }
            },
            fontFamily: {
                sans: ['Inter', 'Segoe UI', 'sans-serif'],
                mono: ['Fira Code', 'Consolas', 'monospace'],
            },
            boxShadow: {
                'glow-navy': '0 0 20px rgba(0,32,96,0.3)',
                'glow-orange': '0 0 16px rgba(255,140,0,0.4)',
                'glow-field': '0 0 0 2px rgba(255,140,0,0.6), 0 0 12px rgba(255,140,0,0.3)',
            },
            backdropBlur: {
                xs: '2px',
            }
        },
    },
    plugins: [],
}
