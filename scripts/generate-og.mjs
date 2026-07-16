import sharp from "sharp";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { writeFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, "..", "public", "og-image.png");

const width = 1200;
const height = 630;

const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f1b2d"/>
      <stop offset="100%" stop-color="#1a2d4a"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#f4e4bc"/>
      <stop offset="50%" stop-color="#c9a961"/>
      <stop offset="100%" stop-color="#8c6e0e"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <circle cx="1000" cy="100" r="300" fill="rgba(201,169,97,0.04)"/>
  <circle cx="1100" cy="500" r="200" fill="rgba(201,169,97,0.03)"/>
  <rect x="80" y="80" width="60" height="60" rx="8" fill="#c9a961"/>
  <text x="110" y="120" font-family="serif" font-size="36" fill="#0f1b2d" text-anchor="middle" font-weight="bold">G</text>
  <text x="80" y="220" font-family="sans-serif" font-size="52" fill="#fdfbf7" font-weight="700">Global Wealth</text>
  <text x="80" y="290" font-family="sans-serif" font-size="52" fill="#fdfbf7" font-weight="300">Portfolio</text>
  <text x="80" y="360" font-family="sans-serif" font-size="24" fill="#8a94a6">Track, analyse, and grow your wealth</text>
  <rect x="80" y="400" width="80" height="4" rx="2" fill="#c9a961"/>
  <text x="80" y="560" font-family="sans-serif" font-size="16" fill="#5a6476">globalwealthfolio.com</text>
</svg>`;

sharp(Buffer.from(svg))
  .png()
  .toFile(outPath)
  .then(() => console.log("Created og-image.png"))
  .catch((e) => console.error(e));
