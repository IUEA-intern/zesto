const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withClearTextTraffic(config) {
  return withAndroidManifest(config, async (config) => {
    const application = config.modResults.manifest.application[0];

    application.$['android:usesCleartextTraffic'] = 'true';

    return config;
  });
};