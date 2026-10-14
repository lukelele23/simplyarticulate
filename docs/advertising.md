# Advertising spaces

GuestAdSpace reserves a responsive advertisement area beneath Home, Practice setup, Progress and the completed speech review. Signed-in users receive no ad markup or reserved space. Authentication must resolve before these pages mount. Preparation, recording, the daily challenge and debate clocks have no placements.

Desktop reserves a maximum 970-pixel wide, 90-pixel tall area. Mobile reserves up to 320 pixels by 100 pixels, constrained by the content width. Actual ad-unit dimensions must fit these containers. The label separates advertising from product controls. Do not place ads in the introductory dialog, over controls or inside feedback text.

This is layout preparation only. No Google ad request, script or ad-unit initialization occurs. The google-adsense-account meta tag remains for ownership verification.

To activate ads later, obtain approved display ad-unit IDs from AdSense, implement guest-only script and unit initialization after authentication resolves, and replace the visible Ad space placeholder with real ad markup. Reserve height before the request to avoid layout shifts. Handle unfilled units without misleading empty creative. Ensure signing in removes placements and stops ad delivery. Configure any required consent flow before ad requests. Review placement behavior on mobile and desktop before publishing.
