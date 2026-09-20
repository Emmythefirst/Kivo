const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Mobile Wallet Adapter's packages use package.json "exports" subpaths
// (e.g. @solana-mobile/mobile-wallet-adapter-protocol/encoding). Metro
// needs this explicitly enabled, and the "react-native" condition needs
// to come first or it resolves the wrong build of dependencies like this
// one that ship separate native/browser/node entrypoints.
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = ['react-native', 'require', 'default'];

module.exports = config;
