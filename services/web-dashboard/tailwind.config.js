/**
 * Tailwind scans the listed files for class names to generate.
 * If a file path is missing, Tailwind will not see classes used there,
 * and those styles may be omitted from the final CSS.
 */
module.exports = {
  content: [
    './src/pages/**/*.{js,jsx,ts,tsx,mdx}',
    './src/components/**/*.{js,jsx,ts,tsx,mdx}',
    './src/app/**/*.{js,jsx,ts,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
