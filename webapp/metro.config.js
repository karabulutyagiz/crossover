const path = require('node:path');
const { getDefaultConfig } = require('../app/node_modules/expo/metro-config');

const projectRoot = __dirname;
const appRoot = path.resolve(__dirname, '../app');

const config = getDefaultConfig(projectRoot);
const shimMap = {
  'react-native-google-mobile-ads': path.resolve(projectRoot, 'shims/react-native-google-mobile-ads.js'),
  'react-native-iap': path.resolve(projectRoot, 'shims/react-native-iap.js'),
};

config.watchFolders = [appRoot];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (shimMap[moduleName]) {
    return {
      type: 'sourceFile',
      filePath: shimMap[moduleName],
    };
  }
  return context.resolveRequest(context, moduleName, platform);
};
config.resolver.nodeModulesPaths = [
  path.resolve(appRoot, 'node_modules'),
  path.resolve(projectRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
