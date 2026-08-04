import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'club.pawls.app',
  appName: 'Pawls',
  webDir: 'dist/client',
  server: {
    // Production: load the deployed site in a webview.
    // UPDATE THIS to the live Vercel URL after running `bun run go-live`.
    url: 'https://pawls.club',
    cleartext: false,
  },
  ios: {
    contentInset: 'automatic',
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
