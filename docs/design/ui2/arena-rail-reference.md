# Arena rail reference correction

Visually inspected in the browser: https://www.rakda3.net/img/2022/10/cr-trophy-road-arena-old.jpg
Source article: https://www.rakda3.net/clash-royale-end-of-trophy-ranking/
This is a historical 2022 screenshot, not evidence of the latest game's exact UI.

Observed: a narrow straight progression strip against the left edge, dark enclosing track, restrained brighter left edge, blue reached region, trophy labels beside milestone ticks. It is not a rounded test tube with an elliptical fluid surface.

Replaced the rejected segmented glass tube with one full-road vector rail. It spans header/footer padding as well as arena rows, so it no longer starts and stops at each arena. Existing trophy interpolation, arena art, no-intermediate-reward rule, full-screen backdrop and bottom Done retained.

Verified the empty/reached portions and zero-trophy arena in the iOS 26.3 iPhone 16 Pro simulator. TypeScript and arena checks passed. No server, OTA or push changes.
