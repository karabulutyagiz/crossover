import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const widget = readFileSync(new URL('../targets/offer-activity/index.swift', import.meta.url), 'utf8');
const bridge = readFileSync(new URL('../modules/cof-live-activity/ios/CofLiveActivityModule.swift', import.meta.url), 'utf8');
const attributes = source => source.match(/struct CofOfferAttributes: ActivityAttributes \{[\s\S]*?var offerId: String\s*\}/)[0].replace(/\s+/g, ' ');
assert.equal(attributes(widget), attributes(bridge), 'native bridge and widget must preserve identical ActivityKit payloads');
for (const surface of ['OfferLockScreen', 'compactLeading:', 'compactTrailing:', 'minimal:', 'DynamicIslandExpandedRegion(.bottom)']) {
  assert(widget.includes(surface), `${surface} is provided`);
}
assert(widget.includes('Text("COF")') && widget.includes('CofCrest'), 'COF branding replaces generic emoji');
assert(!widget.includes('💎'), 'no platform-dependent emoji hero');
assert(widget.includes('Text(timerInterval:'), 'countdown is system-driven without per-second app work');
assert(widget.includes('context.isStale'), 'expired offer has explicit presentation');
assert(widget.includes('state.packPitch.isEmpty'), 'social pack pitch is conditional, never shown to pack owners');
assert(bridge.includes('MAX_WINDOW'), 'island countdown is capped, not tied to the full offer window');
assert(widget.includes('lineLimit(2)'), 'long offer names may wrap');
assert(widget.includes('Locale.preferredLanguages'), 'language uses preferred language, not region');
// Ada dar kalmali (kullanici karari 2026-09-11: "tum yukari centigi kapliyor").
assert(widget.includes('CofCrest(size: 16)'), 'compact leading is the small crest, not a wide badge');
assert(/compactTrailing: \{\s*OfferClock\([^)]*\)\.frame\(width: (3[0-9]|4[0-5])\)/.test(widget),
  'compact trailing is a narrow clock with no extra icon');
assert(widget.includes('ExpandedOfferCard(state: context.state'), 'expanded island includes the blue offer card, not unfilled black space');
assert(widget.includes('CofCrest(size: 22)'), 'minimal presentation retains the football crest');
console.log('PASS: payload parity, four surfaces, branding, system timer, expiry and long-title guards');
