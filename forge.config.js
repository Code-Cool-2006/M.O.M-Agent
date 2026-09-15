const { VitePlugin } = require('@electron-forge/plugin-vite');

module.exports = {
  packagerConfig: {
    asar: true,
    icon: './assets/icon',
    extraResource: [
      './assets',
    ],
  },
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        setupIcon: './assets/icon.ico',
      },
    },
    { name: '@electron-forge/maker-zip', platforms: ['win32', 'darwin'] },
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
