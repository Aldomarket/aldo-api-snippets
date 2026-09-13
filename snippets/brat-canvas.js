const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// Register font Arial Narrow if available
const fontPath = path.join(process.cwd(), 'database/assets/ARIALN.ttf');
if (fs.existsSync(fontPath) && GlobalFonts) {
  try {
    GlobalFonts.registerFromPath(fontPath, 'ArialNarrow');
  } catch (e) {}
}

/**
 * Generate Brat style text image buffer
 * @param {string} text - Text to render
 * @param {string} theme - 'white', 'black', or 'green'
 * @returns {Promise<Buffer>} PNG Image Buffer
 */
async function renderBrat(text, theme = 'white') {
  const themes = {
    white: { bg: '#ffffff', text: '#000000' },
    black: { bg: '#000000', text: '#ffffff' },
    green: { bg: '#8ace00', text: '#000000' }
  };
  const selectedTheme = themes[theme.toLowerCase()] || themes.white;
  const size = 512;
  const padding = 40;

  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = selectedTheme.bg;
  ctx.fillRect(0, 0, size, size);

  if (!text || !text.trim()) return canvas.toBuffer('image/png');

  ctx.fillStyle = selectedTheme.text;
  ctx.font = '70px ArialNarrow, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(text.trim(), padding, padding);

  return canvas.toBuffer('image/png');
}

module.exports = renderBrat;
