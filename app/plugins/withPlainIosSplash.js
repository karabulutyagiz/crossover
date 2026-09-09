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
                        <subviews>
                            <view contentMode="scaleToFill" translatesAutoresizingMaskIntoConstraints="NO" id="MIAV-Lockup">
                                <rect key="frame" x="66.5" y="354" width="260" height="144"/>
                                <subviews>
                                    <label opaque="NO" userInteractionEnabled="NO" contentMode="left" text="MIAV" textAlignment="center" translatesAutoresizingMaskIntoConstraints="NO" id="MIAV-Name">
                                        <rect key="frame" x="0" y="8.5" width="260" height="80"/>
                                        <fontDescription key="fontDescription" type="system" weight="black" pointSize="68"/>
                                        <color key="textColor" white="1" alpha="1" colorSpace="custom" customColorSpace="genericGamma22GrayColorSpace"/>
                                    </label>
                                    <view contentMode="scaleToFill" translatesAutoresizingMaskIntoConstraints="NO" id="MIAV-Rule">
                                        <rect key="frame" x="110" y="97.5" width="40" height="3"/>
                                        <color key="backgroundColor" red="0.9607843137" green="0.768627451" blue="0.3176470588" alpha="1" colorSpace="custom" customColorSpace="sRGB"/>
                                        <constraints>
                                            <constraint firstAttribute="width" constant="40" id="MIAV-RuleWidth"/>
                                            <constraint firstAttribute="height" constant="3" id="MIAV-RuleHeight"/>
                                        </constraints>
                                    </view>
                                    <label opaque="NO" userInteractionEnabled="NO" contentMode="left" text="S T U D I O S" textAlignment="center" translatesAutoresizingMaskIntoConstraints="NO" id="MIAV-Studios">
                                        <rect key="frame" x="0" y="115.5" width="260" height="20"/>
                                        <fontDescription key="fontDescription" type="system" weight="bold" pointSize="16"/>
                                        <color key="textColor" white="1" alpha="1" colorSpace="custom" customColorSpace="genericGamma22GrayColorSpace"/>
                                    </label>
                                </subviews>
                                <constraints>
                                    <constraint firstAttribute="width" constant="260" id="MIAV-Width"/>
                                    <constraint firstAttribute="height" constant="144" id="MIAV-Height"/>
                                    <constraint firstItem="MIAV-Name" firstAttribute="top" secondItem="MIAV-Lockup" secondAttribute="top" constant="8.5" id="MIAV-NameTop"/>
                                    <constraint firstItem="MIAV-Name" firstAttribute="centerX" secondItem="MIAV-Lockup" secondAttribute="centerX" id="MIAV-NameX"/>
                                    <constraint firstItem="MIAV-Name" firstAttribute="width" secondItem="MIAV-Lockup" secondAttribute="width" id="MIAV-NameWidth"/>
                                    <constraint firstItem="MIAV-Name" firstAttribute="height" constant="80" id="MIAV-NameHeight"/>
                                    <constraint firstItem="MIAV-Rule" firstAttribute="top" secondItem="MIAV-Name" secondAttribute="bottom" constant="9" id="MIAV-RuleTop"/>
                                    <constraint firstItem="MIAV-Rule" firstAttribute="centerX" secondItem="MIAV-Lockup" secondAttribute="centerX" id="MIAV-RuleX"/>
                                    <constraint firstItem="MIAV-Studios" firstAttribute="top" secondItem="MIAV-Rule" secondAttribute="bottom" constant="15" id="MIAV-StudiosTop"/>
                                    <constraint firstItem="MIAV-Studios" firstAttribute="centerX" secondItem="MIAV-Lockup" secondAttribute="centerX" id="MIAV-StudiosX"/>
                                    <constraint firstItem="MIAV-Studios" firstAttribute="width" secondItem="MIAV-Lockup" secondAttribute="width" id="MIAV-StudiosWidth"/>
                                    <constraint firstItem="MIAV-Studios" firstAttribute="height" constant="20" id="MIAV-StudiosHeight"/>
                                </constraints>
                            </view>
                        </subviews>
                        <viewLayoutGuide key="safeArea" id="Rmq-lb-GrQ"/>
                        <constraints>
                            <constraint firstItem="MIAV-Lockup" firstAttribute="centerX" secondItem="EXPO-ContainerView" secondAttribute="centerX" id="MIAV-CenterX"/>
                            <constraint firstItem="MIAV-Lockup" firstAttribute="centerY" secondItem="EXPO-ContainerView" secondAttribute="centerY" id="MIAV-CenterY"/>
                        </constraints>
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
