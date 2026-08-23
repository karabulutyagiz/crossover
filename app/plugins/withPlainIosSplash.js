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
    <dependencies>
        <deployment identifier="iOS"/>
        <plugIn identifier="com.apple.InterfaceBuilder.IBCocoaTouchPlugin" version="24053.1"/>
        <capability name="Named colors" minToolsVersion="9.0"/>
        <capability name="Safe area layout guides" minToolsVersion="9.0"/>
        <capability name="System colors in document resources" minToolsVersion="11.0"/>
        <capability name="documents saved in the Xcode 8 format" minToolsVersion="8.0"/>
    </dependencies>
    <scenes>
        <scene sceneID="EXPO-SCENE-1">
            <objects>
                <viewController storyboardIdentifier="SplashScreenViewController" id="EXPO-VIEWCONTROLLER-1" sceneMemberID="viewController">
                    <view key="view" userInteractionEnabled="NO" contentMode="scaleToFill" insetsLayoutMarginsFromSafeArea="NO" id="EXPO-ContainerView" userLabel="ContainerView">
                        <rect key="frame" x="0.0" y="0.0" width="393" height="852"/>
                        <autoresizingMask key="autoresizingMask" flexibleMaxX="YES" flexibleMaxY="YES"/>
                        <subviews/>
                        <viewLayoutGuide key="safeArea" id="Rmq-lb-GrQ"/>
                        <constraints/>
                        <color key="backgroundColor" red="${SPLASH_COLOR.red}" green="${SPLASH_COLOR.green}" blue="${SPLASH_COLOR.blue}" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>
                    </view>
                </viewController>
                <placeholder placeholderIdentifier="IBFirstResponder" id="EXPO-PLACEHOLDER-1" userLabel="First Responder" sceneMemberID="firstResponder"/>
            </objects>
            <point key="canvasLocation" x="0.0" y="0.0"/>
        </scene>
    </scenes>
    <resources>
        <namedColor name="SplashScreenBackground">
            <color alpha="1" blue="${SPLASH_COLOR.blue}" green="${SPLASH_COLOR.green}" red="${SPLASH_COLOR.red}" customColorSpace="sRGB" colorSpace="custom"/>
        </namedColor>
    </resources>
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
      await fs.promises.writeFile(storyboardPath, storyboardXml(), 'utf8');
      return modConfig;
    },
  ]);
};
