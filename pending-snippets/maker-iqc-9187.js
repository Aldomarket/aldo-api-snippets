const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');
const EmojiDbLib = require('emoji-db');
const axios = require('axios');
const moment = require('moment-timezone');

const emojiDb = new EmojiDbLib({ useDefaultDb: true });

const EMOJI_URLS = {
    apple:     'https://raw.githubusercontent.com/SaurusAraAra/mentahan/refs/heads/main/lainnya/emoji-apple-image.json',
    blob:      'https://raw.githubusercontent.com/SaurusAraAra/mentahan/refs/heads/main/lainnya/emoji-blob-image.json',
    google:    'https://raw.githubusercontent.com/SaurusAraAra/mentahan/refs/heads/main/lainnya/emoji-google-image.json',
    joypixels: 'https://raw.githubusercontent.com/SaurusAraAra/mentahan/refs/heads/main/lainnya/emoji-joypixels-image.json',
    twitter:   'https://raw.githubusercontent.com/SaurusAraAra/mentahan/refs/heads/main/lainnya/emoji-twitter-image.json',
};
const BG_URL   = 'https://raw.githubusercontent.com/SaurusAraAra/mentahan/main/images/background-iqc.png';
const FONT_URL = 'https://raw.githubusercontent.com/SaurusAraAra/mentahan/main/font/SFPRODISPLAYREGULAR.otf';

let fontRegistered = false;

module.exports = function(app) {
  const handleIqcMaker = async (req, res) => {
    const text = req.query.text || req.body?.text || '';
    const imageUrl = req.query.image || req.query.picture || req.query.media || req.body?.image || req.body?.picture || req.body?.media;

    if (!text && !imageUrl) {
      return res.status(400).json({ status: false, error: 'Parameter "text" atau "image" wajib diisi' });
    }

    try {
      const time = req.query.time || req.body?.time || moment().tz("Asia/Makassar").format("HH:mm");
      const bateraiVal = req.query.baterai || req.body?.baterai || '80';
      const operatorVal = req.query.operator || req.body?.operator || 'true';
      const showOperator = operatorVal !== 'false' && operatorVal !== false;
      const showWifi = req.query.wifi !== 'false' && req.body?.wifi !== false;
      const brand = req.query.brand || req.body?.brand || 'apple';

      const [emojiPrimaryRes, emojiAppleRes, bgRes, fontRes] = await Promise.all([
          axios.get(EMOJI_URLS[brand] || EMOJI_URLS.apple),
          brand !== 'apple' ? axios.get(EMOJI_URLS.apple) : null,
          axios.get(BG_URL, { responseType: 'arraybuffer' }),
          axios.get(FONT_URL, { responseType: 'arraybuffer' }),
      ]);

      let attachmentImg = null;
      if (imageUrl) {
        try {
          const imgRes = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 10000 });
          attachmentImg = await loadImage(Buffer.from(imgRes.data));
        } catch (e) {
          console.error("Failed to load IQC image attachment:", e.message);
        }
      }

      const emojiPrimary = emojiPrimaryRes.data;
      const emojiApple = emojiAppleRes ? emojiAppleRes.data : null;
      const bgBuf = Buffer.from(bgRes.data);
      const fontBuf = Buffer.from(fontRes.data);

      if (!fontRegistered) {
          GlobalFonts.register(fontBuf, 'SFPRODISPLAYREGULAR');
          fontRegistered = true;
      }

      const emojis = emojiDb.searchFromText({ input: text, fixCodePoints: true });
      const emojiCache = new Map();

      await Promise.all(emojis.map(async (emoji) => {
          if (emojiCache.has(emoji.found)) return;
          try {
              const b64 = emojiPrimary[emoji.found] || (emojiApple && emojiApple[emoji.found]);
              if (b64) {
                  const img = await loadImage(Buffer.from(b64, 'base64'));
                  emojiCache.set(emoji.found, img);
              }
          } catch (_) {}
      }));

      // STRICT FIXED Phone Screen Dimensions (W=680, H=1100 ALWAYS)
      const W = 680, H = 1100;
      const FONT_SIZE = 24, MAX_W = 540, MIN_W = 100, PAD = 40, LH = 32;

      const canvas = createCanvas(W, H);
      const ctx    = canvas.getContext('2d');
      ctx.font = `${FONT_SIZE}px SFPRODISPLAYREGULAR`;

      function getSegments(txt, ems) {
          const segs = [], sorted = [...ems].sort((a,b) => a.offset - b.offset);
          let cur = 0;
          for (const e of sorted) {
              if (cur < e.offset) for (const ch of txt.substring(cur, e.offset)) segs.push({ type:'text', value:ch });
              segs.push({ type:'emoji', value:e.found, code:e.found });
              cur = e.offset + e.length;
          }
          if (cur < txt.length) for (const ch of txt.substring(cur)) segs.push({ type:'text', value:ch });
          return segs;
      }

      const segs = getSegments(text, emojis);
      const mSeg = s => s.type === 'emoji' ? FONT_SIZE * 1.22 : ctx.measureText(s.value).width;

      let lines = [], curLine = [], curW = 0, curWord = [], curWW = 0;
      for (const seg of segs) {
          const sw = mSeg(seg);
          if (seg.type === 'text' && (seg.value === ' ' || seg.value === '\n')) {
              if (curW + curWW > MAX_W - PAD) {
                  if (curLine.length) lines.push(curLine);
                  curLine = [...curWord]; curW = curWW;
              } else {
                  curLine.push(...curWord); curW += curWW;
              }
              curWord = []; curWW = 0;
              if (seg.value === ' ' && curW + sw <= MAX_W - PAD) { curLine.push(seg); curW += sw; }
              if (seg.value === '\n') { lines.push(curLine); curLine = []; curW = 0; }
          } else { curWord.push(seg); curWW += sw; }
      }
      if (curWord.length) {
          if (curW + curWW > MAX_W - PAD) { if (curLine.length) lines.push(curLine); lines.push(curWord); }
          else { curLine.push(...curWord); if (curLine.length) lines.push(curLine); }
      } else if (curLine.length) lines.push(curLine);

      let maxLW = 0;
      for (const line of lines) { let lw = 0; for (const s of line) lw += mSeg(s); maxLW = Math.max(maxLW, lw); }

      // Full Original Aspect Ratio for Attached Image (NO CROPPING!)
      let attW = 0, attH = 0;
      if (attachmentImg) {
        attW = 430;
        const ratio = attachmentImg.height / attachmentImg.width;
        // Keep 100% full original height without cropping the user's image!
        attH = Math.round(attW * ratio);
      }

      const textW = text ? maxLW + PAD + 58 : 0;
      const bW2   = Math.max(MIN_W, Math.min(MAX_W, Math.max(textW, attW ? attW + 28 : 0)));

      let textH   = text ? lines.length * LH + 22 : 0;
      const bH    = Math.max(60, (text ? textH : 0) + (attachmentImg ? attH + 18 : 0) + 14);
      const bX    = 22;

      // FIXED Top position for bubble (NEVER touches status bar)
      const bY = 95;
      // Context menu is pushed down and gets cut off at the bottom of the screen if image is long
      const menuY = bY + bH + 25;

      const bgImg = await loadImage(bgBuf);
      const sc = 1.05;
      const [sw, sh] = [W * sc, H * sc];
      const [ox, oy] = [(W - sw) / 2, (H - sh) / 2];

      ctx.save();
      ctx.rect(0, 0, W, H);
      ctx.clip();
      ctx.drawImage(bgImg, ox, oy, sw, sh);
      ctx.filter = 'blur(6px)';
      ctx.drawImage(bgImg, ox, oy, sw, sh);
      ctx.filter = 'none';
      ctx.restore();

      ctx.fillStyle = 'rgba(13,13,13,0.7)';
      ctx.fillRect(0, 0, W, H);

      // --- Draw Authentic iPhone Status Bar ---
      const sY = 36;

      // 1. Draw iPhone Dynamic Island (Top Center Notch Pill)
      const diW = 126, diH = 34, diX = (W - diW) / 2, diY = 14, diR = 17;
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.moveTo(diX + diR, diY);
      ctx.lineTo(diX + diW - diR, diY);
      ctx.quadraticCurveTo(diX + diW, diY, diX + diW, diY + diR);
      ctx.lineTo(diX + diW, diY + diH - diR);
      ctx.quadraticCurveTo(diX + diW, diY + diH, diX + diW - diR, diY + diH);
      ctx.lineTo(diX + diR, diY + diH);
      ctx.quadraticCurveTo(diX, diY + diH, diX, diY + diH - diR);
      ctx.lineTo(diX, diY + diR);
      ctx.quadraticCurveTo(diX, diY, diX + diR, diY);
      ctx.closePath();
      ctx.fill();

      // Camera lens reflection inside Dynamic Island
      ctx.fillStyle = '#0d0e16';
      ctx.beginPath();
      ctx.arc(diX + 26, diY + diH / 2, 5.5, 0, Math.PI * 2);
      ctx.fill();

      // 2. Draw Time (Top Left)
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 20px SFPRODISPLAYREGULAR';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(time, 46, sY);

      let curX = W - 32;
      ctx.textAlign = 'right';

      // 3. Draw Authentic iPhone Battery (Top Right)
      const drawBattery = (x, y, pct) => {
          const lv = Math.min(100, Math.max(0, parseInt(pct)));
          const bW = 27, bH = 13, bR = 4;
          
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.moveTo(x - bW + bR, y - bH/2);
          ctx.lineTo(x - bR, y - bH/2);
          ctx.quadraticCurveTo(x, y - bH/2, x, y - bH/2 + bR);
          ctx.lineTo(x, y + bH/2 - bR);
          ctx.quadraticCurveTo(x, y + bH/2, x - bR, y + bH/2);
          ctx.lineTo(x - bW + bR, y + bH/2);
          ctx.quadraticCurveTo(x - bW, y + bH/2, x - bW, y + bH/2 - bR);
          ctx.lineTo(x - bW, y - bH/2 + bR);
          ctx.quadraticCurveTo(x - bW, y - bH/2, x - bW + bR, y - bH/2);
          ctx.closePath();
          ctx.stroke();

          const tW = 2.2, tH = 5.5, tR = 1;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(x + 1.8, y - tH/2 + tR);
          ctx.quadraticCurveTo(x + 1.8, y - tH/2, x + 1.8 + tR, y - tH/2);
          ctx.lineTo(x + 1.8 + tW - tR, y - tH/2);
          ctx.quadraticCurveTo(x + 1.8 + tW, y - tH/2, x + 1.8 + tW, y - tH/2 + tR);
          ctx.lineTo(x + 1.8 + tW, y + tH/2 - tR);
          ctx.quadraticCurveTo(x + 1.8 + tW, y + tH/2, x + 1.8 + tW - tR, y + tH/2);
          ctx.lineTo(x + 1.8 + tR, y + tH/2);
          ctx.quadraticCurveTo(x + 1.8, y + tH/2, x + 1.8, y + tH/2 - tR);
          ctx.closePath();
          ctx.fill();

          const margin = 2.5;
          const maxFillW = bW - margin * 2;
          const fillW = Math.max(2, (maxFillW * lv) / 100);
          const fillH = bH - margin * 2;
          const fillR = 2;

          ctx.fillStyle = lv <= 20 ? '#ff3b30' : '#34c759';
          ctx.beginPath();
          ctx.moveTo(x - bW + margin + fillR, y - fillH/2);
          ctx.lineTo(x - bW + margin + fillW - fillR, y - fillH/2);
          ctx.quadraticCurveTo(x - bW + margin + fillW, y - fillH/2, x - bW + margin + fillW, y - fillH/2 + fillR);
          ctx.lineTo(x - bW + margin + fillW, y + fillH/2 - fillR);
          ctx.quadraticCurveTo(x - bW + margin + fillW, y + fillH/2, x - bW + margin + fillW - fillR, y + fillH/2);
          ctx.lineTo(x - bW + margin + fillR, y + fillH/2);
          ctx.quadraticCurveTo(x - bW + margin, y + fillH/2, x - bW + margin, y + fillH/2 - fillR);
          ctx.lineTo(x - bW + margin, y - fillH/2 + fillR);
          ctx.quadraticCurveTo(x - bW + margin, y - fillH/2, x - bW + margin + fillR, y - fillH/2);
          ctx.closePath();
          ctx.fill();
      };
      drawBattery(curX, sY, bateraiVal);
      curX -= 36;

      // 4. Draw Authentic iPhone Wifi Icon
      if (showWifi) {
          ctx.save();
          ctx.translate(curX - 26, sY - 14);
          ctx.scale(1.15, 1.15);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(1.5,9); ctx.bezierCurveTo(1.5,9,5.5,4.5,12,4.5); ctx.bezierCurveTo(18.5,4.5,22.5,9,22.5,9);
          ctx.lineTo(19.5,11.5); ctx.bezierCurveTo(19.5,11.5,16,8.2,12,8.2); ctx.bezierCurveTo(8,8.2,4.5,11.5,4.5,11.5);
          ctx.closePath(); ctx.fill();
          ctx.beginPath();
          ctx.moveTo(5.5,13); ctx.bezierCurveTo(5.5,13,8.5,10.5,12,10.5); ctx.bezierCurveTo(18.5,10.5,18.5,13,18.5,13);
          ctx.lineTo(16,15); ctx.bezierCurveTo(16,15,13.5,13.5,12,13.5); ctx.bezierCurveTo(10.5,13.5,8,15,8,15);
          ctx.closePath(); ctx.fill();
          ctx.beginPath();
          ctx.moveTo(9,16.5); ctx.quadraticCurveTo(10,16,12,16); ctx.quadraticCurveTo(14,16,15,16.5);
          ctx.lineTo(12.3,19.7); ctx.quadraticCurveTo(12,20,12,20); ctx.quadraticCurveTo(12,20,11.7,19.7);
          ctx.closePath(); ctx.fill();
          ctx.restore();
          curX -= 32;
      }

      // 5. Draw Cellular Signal Bars
      if (showOperator) {
          ctx.fillStyle = '#ffffff';
          const bars = [6, 9, 13, 17], bW = 3.5, bS = 5.2, r = 1.2;
          const sx = curX - 24, sy = sY - 9;
          for (let i = 0; i < 4; i++) {
              const bH = bars[i], bx = sx + i * bS, by = sy + (17 - bH);
              ctx.beginPath();
              ctx.moveTo(bx, sy + 17); ctx.lineTo(bx, by + r); ctx.quadraticCurveTo(bx, by, bx + r, by);
              ctx.lineTo(bx + bW - r, by); ctx.quadraticCurveTo(bx + bW, by, bx + bW, by + r);
              ctx.lineTo(bx + bW, sy + 17); ctx.closePath(); ctx.fill();
          }
          curX -= 32;
      }

      // 6. Draw Operator Name Text
      const hasOperatorName = showOperator && typeof operatorVal === 'string' && operatorVal !== 'true' && operatorVal !== 'false';
      if (hasOperatorName) {
          ctx.fillStyle = '#ffffff';
          ctx.font = '600 15px SFPRODISPLAYREGULAR';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText(operatorVal, curX - 6, sY);
      }

      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      const bRadius = 26;

      // Draw Message bubble background
      ctx.fillStyle = '#3a3a3a';
      ctx.beginPath();
      ctx.moveTo(bX + bRadius, bY); ctx.lineTo(bX + bW2 - bRadius, bY);
      ctx.quadraticCurveTo(bX + bW2, bY, bX + bW2, bY + bRadius);
      ctx.lineTo(bX + bW2, bY + bH - bRadius);
      ctx.quadraticCurveTo(bX + bW2, bY + bH, bX + bW2 - bRadius, bY + bH);
      ctx.lineTo(bX + bRadius, bY + bH);
      ctx.quadraticCurveTo(bX, bY + bH, bX, bY + bH - bRadius);
      ctx.lineTo(bX, bY + bRadius);
      ctx.quadraticCurveTo(bX, bY, bX + bRadius, bY);
      ctx.closePath(); ctx.fill();

      let currentDrawY = bY + 14;

      // 1. Draw Attached Image inside Bubble (Full uncropped original image)
      if (attachmentImg) {
        const imgX = bX + 14;
        const imgY = currentDrawY;
        const imgR = 18;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(imgX + imgR, imgY);
        ctx.lineTo(imgX + attW - imgR, imgY);
        ctx.quadraticCurveTo(imgX + attW, imgY, imgX + attW, imgY + imgR);
        ctx.lineTo(imgX + attW, imgY + attH - imgR);
        ctx.quadraticCurveTo(imgX + attW, imgY + attH, imgX + attW - imgR, imgY + attH);
        ctx.lineTo(imgX + imgR, imgY + attH);
        ctx.quadraticCurveTo(imgX, imgY + attH, imgX, imgY + attH - imgR);
        ctx.lineTo(imgX, imgY + imgR);
        ctx.quadraticCurveTo(imgX, imgY, imgX + imgR, imgY);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(attachmentImg, imgX, imgY, attW, attH);
        ctx.restore();

        currentDrawY += attH + 12;
      }

      // 2. Draw Message text inside Bubble if present (Below Image Attachment)
      if (text) {
        ctx.fillStyle = '#ffffff';
        ctx.font = `${FONT_SIZE}px SFPRODISPLAYREGULAR`;
        let ty = currentDrawY + 20;
        for (const line of lines) {
            let tx = bX + 24;
            for (const seg of line) {
                if (seg.type === 'emoji') {
                    const img = emojiCache.get(seg.code);
                    if (img) { ctx.drawImage(img, tx, ty - FONT_SIZE + FONT_SIZE * 0.15, FONT_SIZE * 1.22, FONT_SIZE * 1.22); }
                    tx += FONT_SIZE * 1.22;
                } else {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillText(seg.value, tx, ty);
                    tx += ctx.measureText(seg.value).width;
                }
            }
            ty += LH;
        }
      }

      // Draw Message Time (Bottom Right)
      ctx.fillStyle = '#999999'; ctx.font = '18px SFPRODISPLAYREGULAR';
      ctx.textAlign = 'right';
      ctx.fillText(time, bX + bW2 - 14, bY + bH - 8);
      ctx.textAlign = 'left';

      // Draw Context Menu Background (Pushed down and cut off at bottom of 1100px screen if image is long)
      if (menuY < H) {
        const mX = 20, mW = 490, mH = 560, mR = 15;
        ctx.fillStyle = '#2a2a2a';
        ctx.beginPath();
        ctx.moveTo(mX + mR, menuY); ctx.lineTo(mX + mW - mR, menuY);
        ctx.quadraticCurveTo(mX + mW, menuY, mX + mW, menuY + mR);
        ctx.lineTo(mX + mW, menuY + mH - mR);
        ctx.quadraticCurveTo(mX + mW, menuY + mH, mX + mW - mR, menuY + mH);
        ctx.lineTo(mX + mR, menuY + mH);
        ctx.quadraticCurveTo(mX, menuY + mH, mX, menuY + mH - mR);
        ctx.lineTo(mX, menuY + mR);
        ctx.quadraticCurveTo(mX, menuY, mX + mR, menuY);
        ctx.closePath(); ctx.fill();

        // Vector Icon Drawers
        const drawStar = (x, y) => {
            ctx.strokeStyle='#ffffff'; ctx.lineWidth=2.5; ctx.lineJoin='miter';
            ctx.beginPath();
            for (let i=0;i<5;i++) {
                const o=(i*2*Math.PI)/5-Math.PI/2, inn=((i*2+1)*Math.PI)/5-Math.PI/2;
                const ox=x+Math.cos(o)*16, oy=y+Math.sin(o)*16, ix=x+Math.cos(inn)*7, iy=y+Math.sin(inn)*7;
                i===0?ctx.moveTo(ox,oy):ctx.lineTo(ox,oy); ctx.lineTo(ix,iy);
            }
            ctx.closePath(); ctx.stroke();
        };

        const drawReply = (x, y) => {
            ctx.strokeStyle='#ffffff'; ctx.lineWidth=2.8; ctx.lineCap='round'; ctx.lineJoin='round';
            const ox=x-3;
            ctx.beginPath();
            ctx.moveTo(ox,y-6); ctx.lineTo(ox,y-13); ctx.lineTo(ox-13,y); ctx.lineTo(ox,y+13); ctx.lineTo(ox,y+6);
            ctx.bezierCurveTo(ox+9,y+6,ox+16,y+9,ox+20,y+16);
            ctx.bezierCurveTo(ox+18,y+7,ox+14,y-2,ox,y-6);
            ctx.stroke();
        };

        const drawForward = (x, y) => {
            ctx.strokeStyle='#ffffff'; ctx.lineWidth=2.8; ctx.lineCap='round'; ctx.lineJoin='round';
            const ox=x+3;
            ctx.beginPath();
            ctx.moveTo(ox,y-6); ctx.lineTo(ox,y-13); ctx.lineTo(ox+13,y); ctx.lineTo(ox,y+13); ctx.lineTo(ox,y+6);
            ctx.bezierCurveTo(ox-9,y+6,ox-16,y+9,ox-20,y+16);
            ctx.bezierCurveTo(ox-18,y+7,ox-14,y-2,ox,y-6);
            ctx.stroke();
        };

        const drawCopy = (x, y) => {
            ctx.save(); ctx.strokeStyle='#ffffff'; ctx.lineWidth=10; ctx.lineCap='round'; ctx.lineJoin='round';
            const sc=0.23, cx2=-127, cy2=-105;
            ctx.translate(x,y); ctx.scale(sc,sc);
            ctx.beginPath();
            ctx.moveTo(cx2+164,cy2+156); ctx.bezierCurveTo(cx2+164,cy2+164,cx2+158,cy2+170,cx2+150,cy2+170);
            ctx.lineTo(cx2+74,cy2+170); ctx.bezierCurveTo(cx2+66,cy2+170,cx2+60,cy2+164,cx2+60,cy2+156);
            ctx.lineTo(cx2+60,cy2+80); ctx.bezierCurveTo(cx2+60,cy2+72,cx2+66,cy2+66,cx2+74,cy2+66);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx2+90,cy2+54); ctx.bezierCurveTo(cx2+90,cy2+46,cx2+96,cy2+40,cx2+104,cy2+40);
            ctx.lineTo(cx2+180,cy2+40); ctx.bezierCurveTo(cx2+188,cy2+40,cx2+194,cy2+46,cx2+194,cy2+54);
            ctx.lineTo(cx2+194,cy2+130); ctx.bezierCurveTo(cx2+194,cy2+138,cx2+188,cy2+144,cx2+180,cy2+144);
            ctx.lineTo(cx2+104,cy2+144); ctx.bezierCurveTo(cx2+96,cy2+144,cx2+90,cy2+138,cx2+90,cy2+130);
            ctx.closePath(); ctx.stroke();
            ctx.restore();
        };

        const drawComment = (x, y) => {
            ctx.strokeStyle='#ffffff'; ctx.lineWidth=2.5; ctx.lineCap='round'; ctx.lineJoin='round';
            const w=30,h=22,r=4;
            ctx.beginPath();
            ctx.moveTo(x-w/2+r,y-h/2); ctx.lineTo(x+w/2-r,y-h/2);
            ctx.quadraticCurveTo(x+w/2,y-h/2,x+w/2,y-h/2+r); ctx.lineTo(x+w/2,y+h/2-r);
            ctx.quadraticCurveTo(x+w/2,y+h/2,x+w/2-r,y+h/2); ctx.lineTo(x-w/2+8,y+h/2);
            ctx.lineTo(x-w/2+3,y+h/2+6); ctx.lineTo(x-w/2+4,y+h/2); ctx.lineTo(x-w/2+r,y+h/2);
            ctx.quadraticCurveTo(x-w/2,y+h/2,x-w/2,y+h/2-r); ctx.lineTo(x-w/2,y-h/2+r);
            ctx.quadraticCurveTo(x-w/2,y-h/2,x-w/2+r,y-h/2);
            ctx.closePath(); ctx.stroke();
            ctx.fillStyle='#ffffff';
            [-6,0,6].forEach(d => { ctx.beginPath(); ctx.arc(x+d,y,2,0,Math.PI*2); ctx.fill(); });
        };

        const drawReport = (x, y) => {
            ctx.strokeStyle='#ffffff'; ctx.lineWidth=3.5; ctx.lineCap='round'; ctx.lineJoin='round';
            ctx.beginPath(); ctx.moveTo(x,y-15); ctx.lineTo(x-15,y+12); ctx.lineTo(x+15,y+12);
            ctx.closePath(); ctx.stroke();
            ctx.fillStyle='#ffffff'; ctx.fillRect(x-1,y-5,2,11);
            ctx.beginPath(); ctx.arc(x,y+8,1.5,0,Math.PI*2); ctx.fill();
        };

        const drawTrash = (x, y) => {
            ctx.strokeStyle='#ff3b30'; ctx.lineWidth=3.5; ctx.lineCap='round'; ctx.lineJoin='round';
            ctx.beginPath(); ctx.moveTo(x-15,y-13); ctx.lineTo(x+15,y-13); ctx.stroke();
            ctx.strokeRect(x-8,y-18,16,5);
            ctx.beginPath(); ctx.moveTo(x-12,y-11); ctx.lineTo(x-9,y+13); ctx.lineTo(x+9,y+13); ctx.lineTo(x+12,y-11);
            ctx.closePath(); ctx.stroke();
            ctx.lineWidth=2;
            ctx.beginPath();
            ctx.moveTo(x,y-7); ctx.lineTo(x,y+11);
            ctx.moveTo(x-7,y-5); ctx.lineTo(x-5,y+11);
            ctx.moveTo(x+7,y-5); ctx.lineTo(x+5,y+11);
            ctx.stroke();
        };

        const items = [
            { text:'Beri Bintang', icon:drawStar },
            { text:'Balas',        icon:drawReply },
            { text:'Teruskan',     icon:drawForward },
            { text:'Salin',        icon:drawCopy },
            { text:'Ucapkan',      icon:drawComment },
            { text:'Laporkan',     icon:drawReport },
            { text:'Hapus',        icon:drawTrash, color:'#ff3b30' },
        ];

        // Draw Context Menu Items
        items.forEach((item, i) => {
            const iy = menuY + i * 80;
            if (iy < H) {
              ctx.fillStyle = item.color || '#ffffff';
              ctx.font = '28px SFPRODISPLAYREGULAR';
              ctx.fillText(item.text, mX + 30, iy + 50);
              item.icon(mX + mW - 40, iy + 40);
              if (i < items.length - 1) {
                  ctx.strokeStyle='#3a3a3a'; ctx.lineWidth=1;
                  ctx.beginPath(); ctx.moveTo(mX+25,iy+80); ctx.lineTo(mX+mW-25,iy+80); ctx.stroke();
              }
            }
        });
      }
      
      const finalBuffer = canvas.toBuffer('image/png');

      const wantJson = req.query.json === 'true' || req.body?.json === true;
      if (wantJson) {
        return res.status(200).json({
          status: true,
          result: `data:image/png;base64,${finalBuffer.toString('base64')}`
        });
      } else {
        res.set('Content-Type', 'image/png');
        return res.send(finalBuffer);
      }

    } catch (error) {
      console.error('[iqc error]', error);
      return res.status(500).json({ status: false, error: error.message });
    }
  };

  app.get('/maker/iqc', handleIqcMaker);
  app.post('/maker/iqc', handleIqcMaker);
};
