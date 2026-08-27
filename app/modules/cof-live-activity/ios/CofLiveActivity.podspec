Pod::Spec.new do |s|
  s.name           = 'CofLiveActivity'
  s.version        = '1.0.0'
  s.summary        = 'Crossover Live Activity bridge (ActivityKit)'
  s.description    = 'Starts/ends the daily-offer Live Activity from React Native.'
  s.author         = 'Crossover'
  s.homepage       = 'https://crossoverfootball.com'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.license        = { :type => 'MIT' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = "**/*.{h,m,swift}"
end
