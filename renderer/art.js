// Procedural artwork for games that have no scraped media (and for the demo shelf).
const Art = (() => {
  const cache = new Map();
  const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
  const rng = seed => () => ((seed = Math.imul(seed ^ (seed >>> 15), 2246822507) + 0x9e3779b9 >>> 0) / 4294967296);
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };

  function palette(title) {
    const r = rng(hash(title));
    const h1 = Math.floor(r() * 360), h2 = (h1 + 40 + Math.floor(r() * 140)) % 360;
    return { r, h1, h2, a: `hsl(${h1} 70% 18%)`, b: `hsl(${h2} 80% 45%)`, c: `hsl(${(h1 + 180) % 360} 90% 65%)` };
  }

  function wrapText(ctx, text, maxW) {
    const words = text.split(' '), lines = []; let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    }
    lines.push(line);
    return lines;
  }

  function scenery(ctx, w, h, p) {
    const { r } = p;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, p.a); g.addColorStop(0.65, p.b); g.addColorStop(1, '#05060a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // stars
    for (let i = 0; i < 90; i++) { ctx.fillStyle = `rgba(255,255,255,${r() * 0.8})`; ctx.fillRect(r() * w, r() * h * 0.6, 1.5 + r() * 2, 1.5 + r() * 2); }
    // sun / planet
    const sx = w * (0.25 + r() * 0.5), sy = h * (0.3 + r() * 0.2), sr = w * (0.15 + r() * 0.2);
    const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
    sg.addColorStop(0, p.c); sg.addColorStop(0.6, `hsl(${p.h2} 90% 60% / .6)`); sg.addColorStop(1, 'transparent');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, 7); ctx.fill();
    // mountain layers
    for (let layer = 0; layer < 3; layer++) {
      const base = h * (0.62 + layer * 0.1);
      ctx.fillStyle = `hsl(${p.h1} 50% ${8 + layer * 4}% / ${0.75 + layer * 0.1})`;
      ctx.beginPath(); ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += w / 10) ctx.lineTo(x, base - r() * h * 0.18);
      ctx.lineTo(w, h); ctx.fill();
    }
    // light streaks
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = `hsl(${p.h2} 100% 70% / ${0.08 + r() * 0.15})`; ctx.lineWidth = 2 + r() * 8;
      ctx.beginPath(); const y = r() * h; ctx.moveTo(-20, y); ctx.lineTo(w + 20, y - h * 0.3 + r() * h * 0.6); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function title(ctx, text, x, y, maxW, size, align = 'center') {
    ctx.textAlign = align; ctx.textBaseline = 'top';
    ctx.font = `900 ${size}px "Segoe UI", system-ui, sans-serif`;
    const lines = wrapText(ctx, text.toUpperCase(), maxW);
    lines.forEach((l, i) => {
      ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = size * 0.4;
      ctx.fillStyle = '#fff'; ctx.fillText(l, x, y + i * size * 1.02);
    });
    ctx.shadowBlur = 0;
    return lines.length * size * 1.02;
  }

  function band(ctx, w, h, sys) {
    ctx.fillStyle = sys.color || '#333'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(0, h - 3, w, 3);
    ctx.font = `700 ${h * 0.5}px "Segoe UI", sans-serif`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillStyle = lum(sys.color) > 0.6 ? '#111' : '#fff';
    ctx.fillText(sys.name.toUpperCase(), h * 0.4, h / 2);
  }
  const lum = hex => { const n = parseInt((hex || '#333').slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

  function memo(key, fn) { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); }

  function front(game, sys, W, H) {
    return memo('f' + JSON.stringify([game.id, game.title, sys.id]), () => {
      const [c, ctx] = canvas(W * 2, H * 2); const w = c.width, h = c.height; const p = palette(game.title);
      scenery(ctx, w, h, p);
      const bh = h * 0.07; band(ctx, w, bh, sys);
      title(ctx, game.title, w / 2, h * 0.14, w * 0.86, w * 0.12);
      ctx.font = `600 ${w * 0.035}px "Segoe UI"`; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.textAlign = 'right';
      ctx.fillText((game.info.publisher || game.info.developer || 'PYROCADE').toUpperCase(), w * 0.95, h * 0.94);
      return c.toDataURL('image/jpeg', 0.9);
    });
  }

  // Back covers are drawn in the background: most games have none scanned, the back is rarely the
  // side in view, and encoding one on the spot made every system switch wait for a row of them.
  // back() returns the cover when it is ready (else null) and backLater() resolves with it.
  // The most recently requested covers are drawn first, so fast browsing never queues behind old ones.
  const backs = new Map(), backQueue = [];
  let backTimer = 0;
  const backKey = (game, sys, W, H) => 'b' + JSON.stringify([game.id, game.title, sys.id, W, H]);
  function back(game, sys, W, H) { return backs.get(backKey(game, sys, W, H))?.url || null; }
  // now: draw it at once (the case viewer, where the back is what people come to see).
  function backLater(game, sys, W, H, now = false) {
    const key = backKey(game, sys, W, H);
    let entry = backs.get(key);
    if (!entry) {
      entry = {};
      entry.promise = new Promise(resolve => { entry.resolve = resolve; });
      backs.set(key, entry);
      // One cover per task, encoded at once: toBlob waits for idle time, which this animated
      // window rarely has, so every cover would appear only after the whole row was drawn.
      entry.draw = () => {
        if (entry.url) return;
        entry.url = drawBack(game, sys, W, H).toDataURL('image/jpeg', 0.88);
        entry.resolve(entry.url);
      };
      backQueue.push(entry.draw);
      scheduleBack();
    }
    if (now) entry.draw();
    return entry.promise;
  }
  // One cover per frame, drawn just after the frame is painted, so browsing stays smooth.
  const scheduleBack = () => { if (!backTimer) backTimer = requestAnimationFrame(() => setTimeout(drawNextBack, 0)); };
  function drawNextBack() {
    backTimer = 0;
    backQueue.pop()?.();
    if (backQueue.length) scheduleBack();
  }

  function drawBack(game, sys, W, H) {
    {
      const [c, ctx] = canvas(W * 2, H * 2); const w = c.width, h = c.height; const p = palette(game.title);
      ctx.fillStyle = '#0d0f16'; ctx.fillRect(0, 0, w, h);
      const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, p.a); g.addColorStop(1, '#05060a');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      band(ctx, w, h * 0.07, sys);
      const hh = title(ctx, game.title, w * 0.07, h * 0.1, w * 0.86, w * 0.06, 'left');
      ctx.font = `400 ${w * 0.032}px "Segoe UI"`; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.textAlign = 'left';
      wrapText(ctx, game.info.description || 'An adventure awaits.', w * 0.86).slice(0, 7)
        .forEach((l, i) => ctx.fillText(l, w * 0.07, h * 0.12 + hh + i * w * 0.045));
      // fake screenshots
      for (let i = 0; i < 3; i++) {
        const x = w * 0.07 + i * w * 0.295, y = h * 0.6, sw = w * 0.27, sh = sw * 0.75;
        const [sc, sctx] = canvas(sw, sh); const pp = palette(game.title + i); scenery(sctx, sw, sh, pp);
        ctx.drawImage(sc, x, y); ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.strokeRect(x, y, sw, sh);
      }
      ctx.fillStyle = '#fff'; ctx.fillRect(w * 0.07, h * 0.88, w * 0.3, h * 0.06);
      ctx.fillStyle = '#000'; for (let i = 0; i < 40; i++) ctx.fillRect(w * 0.08 + i * w * 0.007, h * 0.89, (i % 3) + 1, h * 0.04);
      return c;
    }
  }

  function disc(game, sys, size) {
    return memo('d' + JSON.stringify([game.id, game.title, sys.id]), () => {
      const [c, ctx] = canvas(size * 2, size * 2); const s = c.width, R = s / 2; const p = palette(game.title);
      ctx.save(); ctx.beginPath(); ctx.arc(R, R, R, 0, 7); ctx.moveTo(R + R * 0.16, R); ctx.arc(R, R, R * 0.16, 0, 7); ctx.clip('evenodd');
      // label art
      scenery(ctx, s, s, p);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, 0, s, s);
      title(ctx, game.title, R, R * 0.42, s * 0.6, s * 0.075);
      ctx.font = `700 ${s * 0.04}px "Segoe UI"`; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
      ctx.fillText(sys.name.toUpperCase(), R, R * 1.55);
      ctx.restore();
      // hub
      ctx.beginPath(); ctx.arc(R, R, R * 0.3, 0, 7); ctx.moveTo(R + R * 0.16, R); ctx.arc(R, R, R * 0.16, 0, 7);
      ctx.fillStyle = 'rgba(220,225,235,.55)'; ctx.fill('evenodd');
      return c.toDataURL('image/png');
    });
  }

  function cart(game, sys, W, H) {
    return memo('c' + JSON.stringify([game.id, game.title, sys.id]) + ':' + W + ':' + H, () => {
      const [c, ctx] = canvas(W * 2, H * 2); const w = c.width, h = c.height; const p = palette(game.title);
      scenery(ctx, w, h, p);
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, h * 0.62, w, h * 0.38);
      title(ctx, game.title, w / 2, h * 0.66, w * 0.9, w * 0.1);
      return c.toDataURL('image/jpeg', 0.9);
    });
  }

  function manual(game, sys, frontUrl, W, H) {
    return memo('m' + JSON.stringify([game.id, game.title, sys.id]), () => new Promise(res => {
      const [c, ctx] = canvas(W * 2, H * 2); const w = c.width, h = c.height;
      const img = new Image();
      img.onload = () => {
        ctx.fillStyle = '#f1efe9'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, w * 0.06, h * 0.05, w * 0.88, h * 0.7);
        ctx.fillStyle = sys.color; ctx.fillRect(0, h * 0.8, w, h * 0.12);
        ctx.font = `800 ${w * 0.055}px "Segoe UI"`; ctx.fillStyle = lum(sys.color) > 0.6 ? '#111' : '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('INSTRUCTION BOOKLET', w / 2, h * 0.86);
        res(c.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = () => res(frontUrl);
      img.src = frontUrl;
    }));
  }

  // Average colour of an image URL, for ambient lighting.
  function tint(url,crop) {
    return memo('t' + url + JSON.stringify(crop||null), () => new Promise(res => {
      const img = new Image();
      img.onload = () => { const [c, ctx] = canvas(8, 8);
        if(crop)ctx.drawImage(img,img.naturalWidth*crop.x,img.naturalHeight*crop.y,img.naturalWidth*crop.w,img.naturalHeight*crop.h,0,0,8,8);
        else ctx.drawImage(img, 0, 0, 8, 8);
        const d = ctx.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; }
        res(`rgb(${r / 64 | 0},${g / 64 | 0},${b / 64 | 0})`); };
      img.onerror = () => res('#223');
      img.src = url;
    }));
  }

  return { front, back, backLater, disc, cart, manual, tint };
})();
