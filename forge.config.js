const { VitePlugin } = require('@electron-forge/plugin-vite');

module.exports = {
  packagerConfig: {
    asar: true,
    extraResource: [
      './backend/capture.py',
      './backend/transcribe.py',
      './backend/summarize.py',
      './backend/.env',
    ],
  },
  makers: [
    { name: '@electron-forge/maker-zip' },
    { name: '@electron-forge/maker-deb', config: {} },
    { name: '@electron-forge/maker-rpm', config: {} },
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: 'src/main.js', config: 'vite.main.config.mjs' },
        { entry: 'src/preload.js', config: 'vite.preload.config.mjs' },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mjs',
        },
      ],
    }),
  ],
};
