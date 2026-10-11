import fs from 'node:fs';
import path from 'node:path';

const wordmarkPath = 'M80 0.0V-710.0H210V-370.6L150.4 -413.8H568.2L508.6 -370.6V-710.0H638.6V0.0H508.6V-343.4L568.2 -300.6H150.4L210 -343.4V0.0Z M1008.8 12.0Q929.8 12.0 870.6 -22.4Q811.4 -56.8 778.8 -119.7Q746.2 -182.6 746.2 -267Q746.2 -352 778.8 -414.4Q811.4 -476.8 870.6 -511.4Q929.8 -546 1008.8 -546Q1087.8 -546 1146.7 -511.4Q1205.6 -476.8 1238.2 -414.4Q1270.8 -352 1270.8 -267Q1270.8 -182.6 1238.2 -119.7Q1205.6 -56.8 1146.7 -22.4Q1087.8 12.0 1008.8 12.0ZM1008.8 -91.6Q1070.6 -91.6 1104.5 -137.9Q1138.4 -184.2 1138.4 -267Q1138.4 -349.4 1104.5 -395.9Q1070.6 -442.4 1008.8 -442.4Q947 -442.4 912.8 -395.9Q878.6 -349.4 878.6 -267Q878.6 -184.2 912.8 -137.9Q947 -91.6 1008.8 -91.6Z M1368.4 0.0V-534H1484.2L1489.2 -384.2L1473.6 -390.4Q1482 -446.2 1506.8 -480.3Q1531.6 -514.4 1567.9 -530.2Q1604.2 -546 1647.2 -546Q1706.2 -546 1746.5 -520.2Q1786.8 -494.4 1807.7 -448.9Q1828.6 -403.4 1828.6 -343.4V0.0H1700.6V-302.2Q1700.6 -347.2 1691.9 -378.3Q1683.2 -409.4 1662.8 -425.7Q1642.4 -442 1608 -442Q1556.6 -442 1526.5 -406.1Q1496.4 -370.2 1496.4 -302.2V0.0Z M1957.4 0.0V-534H2085.4V0.0Z M2214.4 0.0V-534H2330.2L2335.2 -384.2L2319.6 -390.4Q2328 -446.2 2352.8 -480.3Q2377.6 -514.4 2413.9 -530.2Q2450.2 -546 2493.2 -546Q2552.2 -546 2592.5 -520.2Q2632.8 -494.4 2653.7 -448.9Q2674.6 -403.4 2674.6 -343.4V0.0H2546.6V-302.2Q2546.6 -347.2 2537.9 -378.3Q2529.2 -409.4 2508.8 -425.7Q2488.4 -442 2454 -442Q2402.6 -442 2372.5 -406.1Q2342.4 -370.2 2342.4 -302.2V0.0Z M3030.8 162.0Q2960.6 162.0 2910.8 143.0Q2861 124.0 2830.4 89.6Q2799.8 55.2 2788 10.4L2920 1.2Q2929.6 31 2954.5 48.1Q2979.4 65.2 3030.8 65.2Q3090.4 65.2 3122.3 38.6Q3154.2 12 3154.2 -44.4V-111.6Q3135.2 -72.8 3093.2 -49.4Q3051.2 -26 2999.2 -26Q2933 -26 2881.5 -58.6Q2830 -91.2 2801.1 -149.6Q2772.2 -208 2772.2 -285.4Q2772.2 -362.2 2800.8 -420.7Q2829.4 -479.2 2880.3 -512.6Q2931.2 -546 2996.8 -546Q3054.8 -546 3096.7 -520Q3138.6 -494 3158.2 -450.8V-534H3283V-47.2Q3283 21.2 3251.6 67.9Q3220.2 114.6 3163.6 138.3Q3107 162.0 3030.8 162.0ZM3029.2 -126.4Q3086.4 -126.4 3120.4 -168.9Q3154.4 -211.4 3155 -286.2Q3155.6 -336 3140.3 -371.7Q3125 -407.4 3096.5 -426.7Q3068 -446 3029.2 -446Q2970 -446 2937.3 -402.7Q2904.6 -359.4 2904.6 -286.2Q2904.6 -212.6 2938.3 -169.5Q2972 -126.4 3029.2 -126.4Z';
const deltaWordmarkPath = 'M1957.4 -654.6L2085.4 -718.6V-609.8L1957.4 -545.8Z';
const markStems = 'M12 12H24V52H12ZM40 18L52 12V52H40Z';
const markDelta = 'M27 30.5L37 25.5V33.5L27 38.5Z';

const makeMark = (fill, delta) =>
`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none">
  <path d="${markStems}" fill="${fill}"/>
  <path d="${markDelta}" fill="${delta}"/>
</svg>`;

const makeLockup = (fill, delta) =>
`<svg xmlns="http://www.w3.org/2000/svg" width="281" height="82" viewBox="0 0 281 82" fill="none">
  <g transform="translate(4 4) scale(1)">
    <path d="${markStems}" fill="${fill}"/>
    <path d="${markDelta}" fill="${delta}"/>
  </g>
  <g transform="translate(75.493 56) scale(0.056338)">
    <path d="${wordmarkPath}" fill="${fill}"/>
    <path d="${deltaWordmarkPath}" fill="${delta}"/>
  </g>
</svg>`;

const makeWordmark = (fill, delta) =>
`<svg xmlns="http://www.w3.org/2000/svg" width="201" height="66" viewBox="0 0 201 66" fill="none">
  <g transform="translate(3.493 48) scale(0.056338)">
    <path d="${wordmarkPath}" fill="${fill}"/>
    <path d="${deltaWordmarkPath}" fill="${delta}"/>
  </g>
</svg>`;

const appIconSvg =
`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" fill="none">
<defs>
  <radialGradient id="g" cx="50%" cy="0%" r="90%">
    <stop offset="0" stop-color="#6366F1" stop-opacity=".28"/>
    <stop offset=".6" stop-color="#6366F1" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#FFFFFF" stop-opacity=".16"/>
    <stop offset="1" stop-color="#FFFFFF" stop-opacity=".04"/>
  </linearGradient>
</defs>
<rect width="512" height="512" rx="115.2" fill="#111114"/>
<rect width="512" height="512" rx="115.2" fill="url(#g)"/>
<rect x="1" y="1" width="510" height="510" rx="114.2" stroke="url(#rim)" stroke-width="2"/>
<g transform="translate(71.68 71.68) scale(5.76)">
  <path d="${markStems}" fill="#F4F4F5"/>
  <path d="${markDelta}" fill="#818CF8"/>
</g>
</svg>`;

const favicon16Svg =
`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
  <rect width="16" height="16" rx="3.5" fill="#111114"/>
  <path d="M3 3H6V13H3ZM10 4.5L13 3V13H10Z" fill="#F4F4F5"/>
  <path d="M6 7.8L10 5.8V8.4L6 10.4Z" fill="#818CF8"/>
</svg>`;

fs.mkdirSync('public/brand', { recursive: true });
fs.writeFileSync('public/brand/honing-mark-dark.svg', makeMark('#F4F4F5', '#818CF8'));
fs.writeFileSync('public/brand/honing-mark-light.svg', makeMark('#09090B', '#4F46E5'));
fs.writeFileSync('public/brand/honing-lockup-dark.svg', makeLockup('#F4F4F5', '#818CF8'));
fs.writeFileSync('public/brand/honing-lockup-light.svg', makeLockup('#09090B', '#4F46E5'));
fs.writeFileSync('public/brand/honing-wordmark-dark.svg', makeWordmark('#F4F4F5', '#818CF8'));
fs.writeFileSync('public/brand/honing-wordmark-light.svg', makeWordmark('#09090B', '#4F46E5'));
fs.writeFileSync('public/brand/honing-app-icon.svg', appIconSvg);
fs.writeFileSync('public/favicon-16.svg', favicon16Svg);
console.log('Brand SVG assets created successfully.');
