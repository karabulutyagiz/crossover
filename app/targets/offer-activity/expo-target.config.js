/** @type {import('@bacons/apple-targets').Config} */
// Günlük Fırsat Live Activity — kilit ekranı + Dynamic Island geri sayımı.
// Widget extension prebuild'de bu klasörden üretilir (CNG; ios/ gitignored).
module.exports = {
  type: 'widget',
  name: 'CofOfferActivity',
  bundleIdentifier: 'com.crossover.football.OfferActivity',
  deploymentTarget: '16.2',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
};
