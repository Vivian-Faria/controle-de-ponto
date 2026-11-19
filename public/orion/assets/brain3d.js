/* ============ James · cérebro 3D (malha poligonal em rede neural, verde, girando 360°) ============ */
(function(){
function rng(seed){ return function(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ---- modelo: cérebro (hemisférios), cerebelo e tronco encefálico. Frente = -x, fundo = +x, topo = +y ---- */
function build(n, seed){
  const r = rng(seed), P = [], E = [];
  const G = Math.PI * (3 - Math.sqrt(5));
  for(let i = 0; i < n; i++){                                     // pontos de Fibonacci na esfera -> superfície do cérebro
    const y = 1 - 2 * (i + .5) / n, rad = Math.sqrt(1 - y * y), th = i * G;
    let x = Math.cos(th) * rad, z = Math.sin(th) * rad;
    let X = x * 1.0, Y = y * .70, Z = z * .60;
    if(Y < -.12) Y = -.12 + (Y + .12) * .45;                     // base mais achatada
    if(Y < -.05 && X < .15 && X > -.55) Y -= .10 * (1 - Math.abs(X + .2) * 2.4);   // lobo temporal pendendo
    if(Y > .2) Z *= 1 - Math.min(.16, (Y - .2) * .22) * Math.exp(-Math.abs(z) * 3) * 0 ;
    const bump = 1 + (r() - .5) * .16;                           // giros irregulares
    X *= bump; Y *= bump; Z *= bump;
    if(Math.abs(Z) < .05 && Y > .1) Y -= .035;                   // fissura longitudinal
    P.push({ x: X, y: Y, z: Z, k: 0, ph: r() * 6.28, sp: .5 + r() * 1.4, sz: .8 + r() * 1.5 });
  }
  const cer = P.length;                                           // cerebelo (malha em grade, como na referência)
  const cx = .58, cy = -.56, rx = .30, ry = .21, rz = .30, LAT = 5, LON = 10, grid = [];
  for(let a = 0; a <= LAT; a++){ grid[a] = []; for(let b = 0; b < LON; b++){
    const ph = Math.PI * (.12 + .76 * a / LAT) , th = b / LON * Math.PI * 2;
    P.push({ x: cx + rx * Math.cos(th) * Math.sin(ph), y: cy - ry * Math.cos(ph) * .9 + ry * .1, z: rz * Math.sin(th) * Math.sin(ph), k: 1, ph: r() * 6.28, sp: .6 + r(), sz: .7 });
    grid[a][b] = P.length - 1; } }
  for(let a = 0; a <= LAT; a++) for(let b = 0; b < LON; b++){ E.push([grid[a][b], grid[a][(b + 1) % LON], 1]); if(a < LAT) E.push([grid[a][b], grid[a + 1][b], 1]); }
  const st = P.length, S = 4, ring = [];                          // tronco encefálico (tubo inclinado)
  for(let s = 0; s <= 2; s++){ ring[s] = []; for(let b = 0; b < S; b++){ const th = b / S * Math.PI * 2, t = s / 2;
    P.push({ x: .30 + .20 * t + .055 * Math.cos(th), y: -.42 - .62 * t, z: .055 * Math.sin(th), k: 2, ph: r() * 6.28, sp: .8, sz: .6 }); ring[s][b] = P.length - 1; } }
  for(let s = 0; s <= 2; s++) for(let b = 0; b < S; b++){ E.push([ring[s][b], ring[s][(b + 1) % S], 2]); if(s < 2) E.push([ring[s][b], ring[s + 1][b], 2]); }
  /* arestas do cérebro: cada ponto liga aos vizinhos mais próximos (triangulação aproximada) */
  const seen = {};
  for(let i = 0; i < cer; i++){
    const d = []; for(let j = 0; j < cer; j++){ if(j === i) continue; d.push([j, (P[i].x - P[j].x) ** 2 + (P[i].y - P[j].y) ** 2 + (P[i].z - P[j].z) ** 2]); }
    d.sort((a, b) => a[1] - b[1]); d.slice(0, 5).forEach(o => { const a = Math.min(i, o[0]), b = Math.max(i, o[0]), key = a + '_' + b; if(!seen[key]){ seen[key] = 1; E.push([a, b, 0]); } });
  }
  return { P, E, cer };
}

function mount(canvas, opt){
  opt = opt || {};
  const small = !!opt.small, M = build(small ? 46 : 150, 11), P = M.P, E = M.E;
  const ctx = canvas.getContext('2d'), dpr = Math.min(window.devicePixelRatio || 1, 2);
  const css = getComputedStyle(document.documentElement);
  const G = (css.getPropertyValue('--lime') || '#b8f400').trim() || '#b8f400';
  let W = 0, H = 0, ang = opt.start || 0.6, last = 0, talk = false, tilt = .22;
  const pulses = []; for(let i = 0; i < (small ? 2 : 9); i++) pulses.push({ e: (Math.random() * E.length) | 0, t: Math.random(), v: .35 + Math.random() * .5 });
  function size(){ const b = canvas.getBoundingClientRect(); W = Math.max(40, b.width); H = Math.max(40, b.height); canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  size(); window.addEventListener('resize', size);
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function frame(ts){
    requestAnimationFrame(frame);
    if(!canvas.offsetParent) return;                               // escondido (outra tela): não gasta CPU
    const dt = Math.min(.05, (ts - last) / 1000 || .016); last = ts;
    if(!W) size();
    ang += dt * (reduce ? .04 : (talk ? .75 : .42));              // 360° contínuo
    const ca = Math.cos(ang), sa = Math.sin(ang), ct = Math.cos(tilt), st = Math.sin(tilt);
    const sc = Math.min(W / 2.25, H / 2.0) * (small ? 1.05 : 1), ox = W / 2, oy = H * (small ? .44 : .46);
    ctx.clearRect(0, 0, W, H);
    const pr = P.map(p => {                                         // gira em Y, inclina em X, perspectiva leve
      const x = p.x * ca - p.z * sa, z = p.x * sa + p.z * ca, y = p.y * ct - z * st, zz = p.y * st + z * ct, f = 1 / (1 - zz * .16);
      return { sx: ox + x * sc * f, sy: oy - y * sc * f, d: (zz + 1.2) / 2.4, f };
    });
    ctx.lineCap = 'round';
    for(const e of E){                                              // arestas (mais fracas ao fundo)
      const a = pr[e[0]], b = pr[e[1]], d = (a.d + b.d) / 2, k = e[2];
      ctx.globalAlpha = (k === 0 ? .14 : .2) + d * (k === 0 ? .5 : .45);
      ctx.strokeStyle = G; ctx.lineWidth = (small ? .6 : .8) * (.6 + d * .6);
      ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.shadowColor = G; ctx.shadowBlur = small ? 4 : 9;
    const t = ts / 1000;
    for(let i = 0; i < P.length; i++){                              // nós: piscam de leve, de forma discreta
      const p = P[i]; if(p.k === 2) continue;
      const q = pr[i], tw = .5 + .5 * Math.sin(t * p.sp * (talk ? 2.6 : 1.3) + p.ph), on = tw > .86 ? 1 : tw * .55;
      const base = p.k === 1 ? .5 : 1, rad = (p.sz * (small ? .75 : 1.05)) * q.f * (.7 + q.d * .6) * (1 + on * (p.k === 0 ? .9 : .2));
      ctx.globalAlpha = Math.min(1, (.22 + q.d * .55 + on * .5) * base);
      ctx.fillStyle = on > .9 ? '#eaffb0' : G;
      ctx.beginPath(); ctx.arc(q.sx, q.sy, rad, 0, 6.283); ctx.fill();
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    for(const s of pulses){                                         // impulsos viajando pelas conexões (rede ativa)
      s.t += dt * s.v * (talk ? 2 : 1); if(s.t >= 1){ s.t = 0; s.e = (Math.random() * E.length) | 0; }
      const e = E[s.e], a = pr[e[0]], b = pr[e[1]], x = a.sx + (b.sx - a.sx) * s.t, y = a.sy + (b.sy - a.sy) * s.t;
      ctx.globalAlpha = (.35 + (a.d + b.d) * .3) * Math.sin(Math.PI * s.t); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, small ? 1 : 1.5, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  requestAnimationFrame(frame);
  return { talk: v => { talk = !!v; } };
}
window.Brain3D = { mount };
})();
