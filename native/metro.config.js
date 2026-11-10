const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withNativeWind } = require('nativewind/metro');

/** Metro + NativeWind (Tailwind): global.css holds the Tailwind layers. */
const config = mergeConfig(getDefaultConfig(__dirname), {});

module.exports = withNativeWind(config, { input: './global.css' });
