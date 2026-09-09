const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const SPLASH_COLOR = {
  red: '0.043137254901960784',
  green: '0.094117647058823528',
  blue: '0.2196078431372549',
};

function storyboardXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<document type="com.apple.InterfaceBuilder3.CocoaTouch.Storyboard.XIB" version="3.0" toolsVersion="24093.7" targetRuntime="iOS.CocoaTouch" propertyAccessControl="none" useAutolayout="YES" launchScreen="YES" useTraitCollections="YES" useSafeAreas="YES" colorMatched="YES" initialViewController="EXPO-VIEWCONTROLLER-1">
  <device id="retina6_12" orientation="portrait" appearance="light"/>
  <dependencies><deployment identifier="iOS"/><plugIn identifier="com.apple.InterfaceBuilder.IBCocoaTouchPlugin" version="24053.1"/><capability name="documents saved in the Xcode 8 format" minToolsVersion="8.0"/></dependencies>
  <scenes><scene sceneID="EXPO-SCENE-1"><objects>
    <viewController storyboardIdentifier="SplashScreenViewController" id="EXPO-VIEWCONTROLLER-1" sceneMemberID="viewController">
      <view key="view" userInteractionEnabled="NO" contentMode="scaleToFill" id="EXPO-ContainerView">
        <rect key="frame" x="0" y="0" width="393" height="852"/>
        <autoresizingMask key="autoresizingMask" flexibleMaxX="YES" flexibleMaxY="YES"/>
        <subviews><imageView userInteractionEnabled="NO" contentMode="scaleAspectFit" image="MiavStudioLogo" translatesAutoresizingMaskIntoConstraints="NO" id="MIAV-Logo">
          <rect key="frame" x="36.5" y="370" width="320" height="112"/>
          <constraints><constraint firstAttribute="width" priority="750" constant="320" id="MIAV-Width"/><constraint firstAttribute="height" secondItem="MIAV-Logo" secondAttribute="width" multiplier="0.35" id="MIAV-Aspect"/></constraints>
        </imageView></subviews>
        <constraints>
          <constraint firstItem="MIAV-Logo" firstAttribute="centerX" secondItem="EXPO-ContainerView" secondAttribute="centerX" id="MIAV-CenterX"/>
          <constraint firstItem="MIAV-Logo" firstAttribute="centerY" secondItem="EXPO-ContainerView" secondAttribute="centerY" id="MIAV-CenterY"/>
          <constraint firstItem="MIAV-Logo" firstAttribute="width" relation="lessThanOrEqual" secondItem="EXPO-ContainerView" secondAttribute="width" constant="-64" id="MIAV-MaxWidth"/>
        </constraints>
        <color key="backgroundColor" red="${SPLASH_COLOR.red}" green="${SPLASH_COLOR.green}" blue="${SPLASH_COLOR.blue}" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>
      </view>
    </viewController>
    <placeholder placeholderIdentifier="IBFirstResponder" id="EXPO-PLACEHOLDER-1" userLabel="First Responder" sceneMemberID="firstResponder"/>
  </objects></scene></scenes>
  <resources><image name="MiavStudioLogo" width="2120" height="742"/></resources>
</document>
`;
}

module.exports = function withPlainIosSplash(config) {
  return withDangerousMod(config, [
    'ios',
    async (modConfig) => {
      const storyboardPath = path.join(
        modConfig.modRequest.platformProjectRoot,
        modConfig.modRequest.projectName,
        'SplashScreen.storyboard',
      );
      const imageset = path.join(modConfig.modRequest.platformProjectRoot, modConfig.modRequest.projectName, 'Images.xcassets', 'MiavStudioLogo.imageset');
      await fs.promises.mkdir(imageset, { recursive: true });
      await fs.promises.copyFile(path.join(modConfig.modRequest.projectRoot, 'assets/opening/miav-studio-logo.png'), path.join(imageset, 'miav-studio-logo.png'));
      await fs.promises.writeFile(path.join(imageset, 'Contents.json'), JSON.stringify({
        images: [{ filename: 'miav-studio-logo.png', idiom: 'universal' }],
        info: { author: 'xcode', version: 1 },
      }, null, 2));
      await fs.promises.writeFile(storyboardPath, storyboardXml(), 'utf8');
      return modConfig;
    },
  ]);
};
