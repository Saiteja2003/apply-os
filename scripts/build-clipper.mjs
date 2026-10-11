import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

// CRC32 table for PNG chunk checksums
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[i] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createPngChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);

  const crcData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const c = crc32(crcData);
  chunk.writeUInt32BE(c, 8 + len);
  return chunk;
}

function generatePngIcon(size) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.writeUInt8(8, 8); // 8 bits per channel
  ihdr.writeUInt8(6, 9); // RGBA
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const ihdrChunk = createPngChunk("IHDR", ihdr);

  const rawData = Buffer.alloc(size * (1 + size * 4));
  let offset = 0;
  const radius = Math.max(2, Math.floor(size * 0.22));

  for (let y = 0; y < size; y++) {
    rawData.writeUInt8(0, offset++);

    for (let x = 0; x < size; x++) {
      let inCorner = false;
      const cornerDists = [
        [x - radius, y - radius],
        [x - (size - 1 - radius), y - radius],
        [x - radius, y - (size - 1 - radius)],
        [x - (size - 1 - radius), y - (size - 1 - radius)],
      ];

      if (x < radius && y < radius) {
        const [dx, dy] = cornerDists[0];
        inCorner = dx * dx + dy * dy > radius * radius;
      } else if (x >= size - radius && y < radius) {
        const [dx, dy] = cornerDists[1];
        inCorner = dx * dx + dy * dy > radius * radius;
      } else if (x < radius && y >= size - radius) {
        const [dx, dy] = cornerDists[2];
        inCorner = dx * dx + dy * dy > radius * radius;
      } else if (x >= size - radius && y >= size - radius) {
        const [dx, dy] = cornerDists[3];
        inCorner = dx * dx + dy * dy > radius * radius;
      }

      if (inCorner) {
        rawData.writeUInt8(0, offset++);
        rawData.writeUInt8(0, offset++);
        rawData.writeUInt8(0, offset++);
        rawData.writeUInt8(0, offset++);
        continue;
      }

      const gx = (x / Math.max(1, size - 1)) * 64;
      const gy = (y / Math.max(1, size - 1)) * 64;

      // Honing Geometry on 64-unit grid
      // Master left stem
      const isMasterStem = gx >= 12 && gx <= 24 && gy >= 12 && gy <= 52;
      // Variant right stem (beveled 1:2 cut from y=18 at x=40 down to y=12 at x=52)
      const variantCutTop = 18 - (gx - 40) * 0.5;
      const isVariantStem = gx >= 40 && gx <= 52 && gy >= variantCutTop && gy <= 52;
      // Floating delta crossbar (beveled 1:2, stops short of stems)
      const deltaTop = 30.5 - (gx - 27) * 0.5;
      const isDelta = gx >= 27 && gx <= 37 && gy >= deltaTop && gy <= deltaTop + 8;

      if (isDelta) {
        // Honing Edge 400 (#818CF8)
        rawData.writeUInt8(129, offset++);
        rawData.writeUInt8(140, offset++);
        rawData.writeUInt8(248, offset++);
        rawData.writeUInt8(255, offset++);
      } else if (isMasterStem || isVariantStem) {
        // Honing Steel 50 (#F4F4F5)
        rawData.writeUInt8(244, offset++);
        rawData.writeUInt8(244, offset++);
        rawData.writeUInt8(245, offset++);
        rawData.writeUInt8(255, offset++);
      } else {
        // Honing Graphite 900 tile (#111114)
        rawData.writeUInt8(17, offset++);
        rawData.writeUInt8(17, offset++);
        rawData.writeUInt8(20, offset++);
        rawData.writeUInt8(255, offset++);
      }
    }
  }

  const compressed = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = createPngChunk("IDAT", compressed);
  const iendChunk = createPngChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

async function build() {
  console.log("🚀 Building Honing Clipper (Manifest V3 - IIFE)...");

  const extDir = path.join(ROOT, "extension");
  const distDir = path.join(extDir, "dist");
  const packagesDistDir = path.join(ROOT, "packages", "clipper", "dist");

  // Ensure directories exist
  for (const d of [
    distDir,
    path.join(distDir, "icons"),
    packagesDistDir,
    path.join(packagesDistDir, "icons"),
    path.join(extDir, "icons"),
  ]) {
    fs.mkdirSync(d, { recursive: true });
  }

  // Clean any nested popup dir from prior builds
  const strayPopupDir = path.join(distDir, "popup");
  if (fs.existsSync(strayPopupDir)) {
    fs.rmSync(strayPopupDir, { recursive: true, force: true });
  }

  // 1. Generate Icons (16, 48, 128)
  console.log("🎨 Generating crisp icons (16px, 48px, 128px)...");
  for (const size of [16, 48, 128]) {
    const png = generatePngIcon(size);
    fs.writeFileSync(path.join(extDir, "icons", `icon-${size}.png`), png);
    fs.writeFileSync(path.join(distDir, "icons", `icon-${size}.png`), png);
    fs.writeFileSync(path.join(packagesDistDir, "icons", `icon-${size}.png`), png);
  }

  // 2. Build bundles with esbuild in browser IIFE format (zero exports)
  console.log("📦 Bundling TypeScript modules with esbuild (format: iife, platform: browser)...");
  await esbuild.build({
    entryPoints: [
      { in: path.join(extDir, "src", "popup", "popup.ts"), out: "popup" },
      { in: path.join(extDir, "src", "extract.ts"), out: "extract" },
      { in: path.join(extDir, "src", "autofill", "filler.ts"), out: "autofill" },
    ],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["chrome120"],
    outdir: distDir,
  });

  // Ensure extract.js returns the extracted job when evaluated via chrome.scripting.executeScript
  let extractJs = fs.readFileSync(path.join(distDir, "extract.js"), "utf8");
  const lastIifeEnd = extractJs.lastIndexOf("})();");
  if (lastIifeEnd !== -1) {
    extractJs =
      extractJs.slice(0, lastIifeEnd) +
      "  return typeof extractJob === 'function' ? extractJob() : null;\n})();\n";
    fs.writeFileSync(path.join(distDir, "extract.js"), extractJs, "utf8");
  }

  // Ensure autofill.js returns the autofill result when evaluated via chrome.scripting.executeScript
  let autofillJs = fs.readFileSync(path.join(distDir, "autofill.js"), "utf8");
  const lastAutofillEnd = autofillJs.lastIndexOf("})();");
  if (lastAutofillEnd !== -1) {
    autofillJs =
      autofillJs.slice(0, lastAutofillEnd) +
      "  return (window && window.__applyos_last_autofill) || null;\n})();\n";
    fs.writeFileSync(path.join(distDir, "autofill.js"), autofillJs, "utf8");
  }

  // Mirror bundled scripts to packages/clipper
  fs.copyFileSync(path.join(distDir, "extract.js"), path.join(packagesDistDir, "extract.js"));
  fs.copyFileSync(path.join(distDir, "extract.js"), path.join(ROOT, "packages", "clipper", "extract.js"));

  fs.copyFileSync(path.join(distDir, "autofill.js"), path.join(packagesDistDir, "autofill.js"));
  fs.copyFileSync(path.join(distDir, "autofill.js"), path.join(ROOT, "packages", "clipper", "autofill.js"));

  fs.copyFileSync(path.join(distDir, "popup.js"), path.join(packagesDistDir, "popup.js"));
  fs.copyFileSync(path.join(distDir, "popup.js"), path.join(ROOT, "packages", "clipper", "popup.js"));

  // 3. Copy Static Assets (popup.html, popup.css, manifest.json)
  console.log("📄 Copying static assets...");
  const popupHtml = fs.readFileSync(path.join(extDir, "src", "popup", "popup.html"), "utf8");
  const popupCss = fs.readFileSync(path.join(extDir, "src", "popup", "popup.css"), "utf8");
  const manifestJson = fs.readFileSync(path.join(extDir, "manifest.json"), "utf8");

  fs.writeFileSync(path.join(distDir, "popup.html"), popupHtml, "utf8");
  fs.writeFileSync(path.join(distDir, "popup.css"), popupCss, "utf8");
  fs.writeFileSync(path.join(distDir, "manifest.json"), manifestJson, "utf8");

  fs.writeFileSync(path.join(packagesDistDir, "popup.html"), popupHtml, "utf8");
  fs.writeFileSync(path.join(packagesDistDir, "popup.css"), popupCss, "utf8");
  fs.writeFileSync(path.join(packagesDistDir, "manifest.json"), manifestJson, "utf8");

  fs.writeFileSync(path.join(ROOT, "packages", "clipper", "popup.html"), popupHtml, "utf8");
  fs.writeFileSync(path.join(ROOT, "packages", "clipper", "popup.css"), popupCss, "utf8");
  fs.writeFileSync(path.join(ROOT, "packages", "clipper", "manifest.json"), manifestJson, "utf8");

  // 4. Strict Audits & Assertions
  console.log("🔍 Validating Manifest V3 and zero-exports invariants...");
  const parsedManifest = JSON.parse(manifestJson);
  if (parsedManifest.manifest_version !== 3) {
    throw new Error("Manifest must be version 3");
  }

  const popupJsContent = fs.readFileSync(path.join(distDir, "popup.js"), "utf8");
  const extractJsContent = fs.readFileSync(path.join(distDir, "extract.js"), "utf8");
  const autofillJsContent = fs.readFileSync(path.join(distDir, "autofill.js"), "utf8");

  if (/\bexports\b/.test(popupJsContent)) {
    throw new Error("popup.js contains reference to 'exports'!");
  }
  if (/\bmodule\.exports\b/.test(popupJsContent)) {
    throw new Error("popup.js contains reference to 'module.exports'!");
  }
  if (/\bexports\b/.test(extractJsContent)) {
    throw new Error("extract.js contains reference to 'exports'!");
  }
  if (/\bmodule\.exports\b/.test(extractJsContent)) {
    throw new Error("extract.js contains reference to 'module.exports'!");
  }
  if (/\bexports\b/.test(autofillJsContent)) {
    throw new Error("autofill.js contains reference to 'exports'!");
  }
  if (/\bmodule\.exports\b/.test(autofillJsContent)) {
    throw new Error("autofill.js contains reference to 'module.exports'!");
  }

  const scriptMatch = popupHtml.match(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/i);
  if (scriptMatch) {
    throw new Error("Inline scripts detected in popup.html; forbidden in Manifest V3!");
  }

  const distStats = {
    manifest: fs.statSync(path.join(distDir, "manifest.json")).size,
    popupHtml: fs.statSync(path.join(distDir, "popup.html")).size,
    popupJs: popupJsContent.length,
    extractJs: extractJsContent.length,
    autofillJs: autofillJsContent.length,
    icon128: fs.statSync(path.join(distDir, "icons", "icon-128.png")).size,
  };

  console.log("✅ Build complete! Bundle stats:");
  console.log(`   - manifest.json: ${distStats.manifest} B`);
  console.log(`   - popup.html:    ${distStats.popupHtml} B`);
  console.log(`   - popup.js:      ${distStats.popupJs} B (0 exports references)`);
  console.log(`   - extract.js:    ${distStats.extractJs} B (0 exports references)`);
  console.log(`   - autofill.js:   ${distStats.autofillJs} B (0 exports references)`);
  console.log(`   - icons/icon-128:${distStats.icon128} B`);
  console.log(`📍 Extension bundle is ready at: ${distDir}`);
}

build().catch((err) => {
  console.error("❌ Build failed:", err);
  process.exit(1);
});
