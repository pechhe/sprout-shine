import adapter from '@sveltejs/adapter-auto';
import { relative, sep } from 'node:path';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  compilerOptions: {
    experimental: {
      async: true
    },
    runes: ({ filename }) => {
      const relativePath = relative(import.meta.dirname, filename);
      const pathSegments = relativePath.toLowerCase().split(sep);
      const isExternalLibrary = pathSegments.includes('node_modules');
      return isExternalLibrary ? undefined : true;
    }
  },
  kit: {
    adapter: adapter(),
    alias: {
      $convex: './convex'
    },
    experimental: {
      remoteFunctions: true
    }
  }
};

export default config;
