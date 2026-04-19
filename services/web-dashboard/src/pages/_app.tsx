import type { AppProps } from 'next/app';
import '../pages/globals.css';
import { Toaster } from 'react-hot-toast';

/**
 * _app.tsx wraps every page in a Next.js pages router application.
 * It is the ideal place for shared layout, global providers, and CSS imports
 * because it renders once around all page components.
 * Use a specific page file when the logic or layout should only apply to that page.
 */
export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1e293b',
            color: '#ffffff',
          },
        }}
      />
    </>
  );
}
