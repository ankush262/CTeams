/**
 * PostCSS processes CSS with plugins before it is served.
 * Tailwind CSS generates utility classes, and Autoprefixer adds
 * vendor prefixes so CSS works across different browsers.
 */
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
