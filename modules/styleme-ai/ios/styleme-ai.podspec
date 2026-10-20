Pod::Spec.new do |s|
  s.name           = 'styleme-ai'
  s.version        = '1.0.0'
  s.summary        = 'Local AI bridge hooks (rules fallback)'
  s.description    = 'Local AI bridge hooks (rules fallback)'
  s.license        = 'MIT'
  s.author         = 'StyleMe'
  s.homepage       = 'https://github.com/CODElST/style-me'
  s.platforms      = {
    :ios => '16.4',
    :tvos => '16.4'
  }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/CODElST/style-me' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
