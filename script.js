// script.js
// Universo indo pra frente (Canvas 2D) + painel inicial (Começar)
// + FRASES CALMAS (placas holográficas) dentro do túnel, com fade suave (não vem na câmera)

(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d", { alpha: false });

  const startEl = document.getElementById("start");
  const btnStart = document.getElementById("btnStart");

  // ===== Utils
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, t) => {
    t = clamp((t - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const rand = (a, b) => a + Math.random() * (b - a);
  const now = () => performance.now();

  // ===== DPR + resize
  let W = 0, H = 0, CX = 0, CY = 0, DPR = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.floor(innerWidth * DPR);
    H = Math.floor(innerHeight * DPR);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = innerWidth + "px";
    canvas.style.height = innerHeight + "px";
    CX = W * 0.5;
    CY = H * 0.5;
  }
  addEventListener("resize", resize, { passive: true });
  resize();

  // ===== Start gate (não anima full até clicar)
  let started = false;
  function start() {
    if (started) return;
    started = true;
    startEl.classList.add("hide");
  }
  btnStart.addEventListener("click", start);
  addEventListener("keydown", (e) => {
    if (!started && (e.code === "Enter" || e.code === "Space")) start();
  });

  // ===== Controls
  const input = {
    mx: 0, my: 0,
    tx: 0, ty: 0,
    boost: false,
    accel: 0,
    cinematic: false,
  };

  addEventListener("mousemove", (e) => {
    const nx = (e.clientX / innerWidth) * 2 - 1;
    const ny = (e.clientY / innerHeight) * 2 - 1;
    input.tx = nx;
    input.ty = ny;
  }, { passive: true });

  addEventListener("wheel", (e) => {
    if (!started) return;
    const d = Math.sign(e.deltaY);
    targetSpeed *= (d > 0 ? 0.92 : 1.08);
    targetSpeed = clamp(targetSpeed, 0.25, 8.0);
  }, { passive: true });

  addEventListener("dblclick", () => {
    input.cinematic = !input.cinematic;
    document.body.classList.toggle("cinematic", input.cinematic);
  });

  addEventListener("keydown", (e) => {
    if (!started) return;
    if (e.code === "Space") { e.preventDefault(); toggleWarp(); }
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.boost = true;
    if (e.code === "KeyW" || e.code === "ArrowUp") input.accel = 1;
    if (e.code === "KeyS" || e.code === "ArrowDown") input.accel = -1;
  });
  addEventListener("keyup", (e) => {
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.boost = false;
    if ((e.code === "KeyW" || e.code === "ArrowUp") && input.accel === 1) input.accel = 0;
    if ((e.code === "KeyS" || e.code === "ArrowDown") && input.accel === -1) input.accel = 0;
  });

  // ===== World params
  let fov = 560;
  let tunnelR = 1.15;
  let zFar = 2400;
  let zNear = 8;

  let baseSpeed = 520;
  let speed = 1.0;
  let targetSpeed = 1.0;
  let warp = 0.0;
  let warpTarget = 0.0;
  let boost = 0.0;

  let lookX = 0, lookY = 0;
  let swayT = 0;

  // ===== Auto quality
  let quality = 1.0;
  let fpsSm = 60;
  let fpsDropTimer = 0;

  // ===== Projection
  function project(x, y, z) {
    if (z <= zNear) return null;

    const lx = lookX * 0.75;
    const ly = lookY * 0.75;

    const k = 0.06 + warp * 0.10;
    const rx = x + lx + x * (k * (1.0 - z / zFar));
    const ry = y + ly + y * (k * (1.0 - z / zFar));

    const invz = fov / z;
    const sx = rx * invz * (Math.min(W, H) * 0.55) + CX;
    const sy = ry * invz * (Math.min(W, H) * 0.55) + CY;

    const dx = (sx - CX);
    const dy = (sy - CY);

    const culled = (sx < -240 || sx > W + 240 || sy < -240 || sy > H + 240);
    return { x: sx, y: sy, invz, dx, dy, culled };
  }

  function toggleWarp() { warpTarget = warpTarget > 0 ? 0 : 1; }

  // ===== Nebulas (soft blobs)
  const nebula = [
    { x: 0.15, y: 0.35, r: 0.65, a: 0.18, s: 0.018, phase: rand(0, 6.28) },
    { x: 0.75, y: 0.50, r: 0.78, a: 0.14, s: 0.012, phase: rand(0, 6.28) },
    { x: 0.45, y: 0.15, r: 0.55, a: 0.10, s: 0.016, phase: rand(0, 6.28) },
  ];

  // ===== Pools
  class Star {
    constructor(layer=0) { this.layer = layer; this.reset(true); }
    reset(initial=false) {
      const spread = tunnelR * (this.layer === 0 ? 1.2 : this.layer === 1 ? 1.0 : 0.85);
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * spread;
      this.x = Math.cos(a) * r;
      this.y = Math.sin(a) * r;
      this.z = initial ? rand(zNear, zFar) : rand(zFar * 0.65, zFar);

      const b = this.layer === 0 ? rand(0.30, 0.70) : this.layer === 1 ? rand(0.55, 0.95) : rand(0.85, 1.25);
      this.base = b;
      this.tw = rand(0, Math.PI * 2);
      this.size = this.layer === 0 ? rand(0.6, 1.1) : this.layer === 1 ? rand(0.9, 1.6) : rand(1.2, 2.4);
      this.halo = this.layer === 2 && Math.random() < 0.65;
      this.tint = Math.random();
    }
  }

  class Dust {
    constructor() { this.reset(true); }
    reset(initial=false) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * tunnelR * 1.35;
      this.x = Math.cos(a) * r;
      this.y = Math.sin(a) * r;
      this.z = initial ? rand(zNear, zFar) : rand(zFar * 0.6, zFar);
      this.size = rand(0.8, 2.6);
      this.alpha = rand(0.05, 0.18);
      this.spark = Math.random() < 0.06;
    }
  }

  class Comet {
    constructor(){ this.active = false; this.t = 0; }
    spawn() {
      this.active = true;
      this.t = 0;
      const side = Math.random() < 0.5 ? -1 : 1;
      this.sx = side * rand(0.8, 1.3) * tunnelR;
      this.sy = rand(-0.8, 0.8) * tunnelR;
      this.sz = rand(zFar * 0.55, zFar * 0.85);
      this.vx = -side * rand(0.55, 1.1);
      this.vy = rand(-0.25, 0.25);
      this.vz = -rand(2.6, 4.2);
      this.len = rand(180, 340);
      this.b = rand(0.65, 1.0);
    }
    update(dt, adv) {
      if (!this.active) return;
      this.t += dt;
      this.sx += this.vx * dt * 0.8;
      this.sy += this.vy * dt * 0.8;
      this.sz -= adv * 0.75;
      this.sz += this.vz * dt * 180;
      if (this.sz < zNear || this.t > 1.2) this.active = false;
    }
    draw(projectFn) {
      if (!this.active) return;
      const p = projectFn(this.sx, this.sy, this.sz);
      if (!p) return;

      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.35 + this.b * 0.35;

      const ang = Math.atan2(p.dy, p.dx);
      const tail = this.len * (1.0 + warp * 0.8);

      ctx.translate(p.x, p.y);
      ctx.rotate(ang);

      const g = ctx.createLinearGradient(0, 0, -tail, 0);
      g.addColorStop(0, `rgba(210,235,255,${0.55*this.b})`);
      g.addColorStop(0.45, `rgba(140,190,255,${0.22*this.b})`);
      g.addColorStop(1, `rgba(90,120,255,0)`);
      ctx.strokeStyle = g;
      ctx.lineWidth = 2.2 * DPR;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-tail, 0);
      ctx.stroke();

      ctx.fillStyle = `rgba(220,245,255,${0.9*this.b})`;
      ctx.beginPath();
      ctx.arc(0, 0, 2.6 * DPR, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  let stars = [];
  let dusts = [];
  const comet = new Comet();

  function buildPools() {
    const px = (innerWidth * innerHeight);
    const base = clamp(px / 9000, 70, 220);

    const nStars = Math.floor(base * 12 * quality);
    const nDust  = Math.floor(base * 6 * quality);

    stars.length = 0;
    dusts.length = 0;

    const tiny = Math.floor(nStars * 0.68);
    const med  = Math.floor(nStars * 0.25);
    const bri  = nStars - tiny - med;

    for (let i=0; i<tiny; i++) stars.push(new Star(0));
    for (let i=0; i<med;  i++) stars.push(new Star(1));
    for (let i=0; i<bri;  i++) stars.push(new Star(2));
    for (let i=0; i<nDust; i++) dusts.push(new Dust());
  }
  buildPools();

  // ===== FRASES (calmas / bonitas)
  const QUOTES = [
    "Se o mundo pesar, descansa em mim.",
"Você é um lugar bonito onde a vida gosta de ficar.",
"Nem todas as respostas existem mas eu fico com você nas perguntas.",
"Seu coração não precisa ser forte o tempo todo.",
"Calma… a vida também sabe esperar por você.",
"Você não precisa iluminar tudo só não apague sua luz.",
"Tem coisas que só florescem no tempo certo… igual você.",
"Mesmo nos dias nublados, você ainda é céu.",
"Ser gentil com você também é uma forma de coragem.",
"Que a vida te abrace do jeito que você merece.",
"Seu sorriso ainda vai salvar muitos dos seus dias.",
"Não se cobre tanto até as estrelas levam tempo para nascer.",
"Se perder às vezes também faz parte de se encontrar.",
"Você não está sozinho nem quando o silêncio fica alto.",
"O que é seu sempre aprende o caminho de volta.",
"Fica… o mundo é melhor com você nele.",
"Seu coração merece a mesma paciência que você dá aos outros.",
"Você não precisa correr coisas bonitas não gostam de pressa.",
"Que hoje seja leve… e se não for, que você seja.",
"Existe uma versão do futuro sorrindo por você agora."

  ];

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  class Quote3D {
    constructor(text) { this.text = text; this.reset(true); }
    reset(initial=false) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * tunnelR * 0.26;
      this.x0 = Math.cos(a) * r;
      this.y0 = Math.sin(a) * r * 0.55;

      // fixa numa faixa “bonita” do túnel (não chega perto)
      this.z = initial ? rand(zFar * 0.52, zFar * 0.72) : rand(zFar * 0.55, zFar * 0.74);

      // drift suave
      this.vx = rand(-0.018, 0.018);
      this.vy = rand(-0.012, 0.012);

      this.t = 0;
      this.life = rand(6.2, 9.0);

      this.baseSize = rand(18, 26);
      this.weight = 650;
      this.seed = Math.random() * 999;
      this.tw = rand(0, Math.PI * 2);
    }
    update(dt) {
      this.t += dt;
      this.x0 += this.vx * dt;
      this.y0 += this.vy * dt;

      // shimmer mínimo
      this.tw += dt * 0.7;

      // em warp, empurra levemente pra longe (ainda mais calmo)
      const warpEase = smoothstep(0, 1, warp);
      this.z += (warpEase * 18) * dt;

      return this.t < this.life;
    }
    draw(spdFinal) {
      const p = project(this.x0, this.y0, this.z);
      if (!p || p.culled) return;

      // fade in/out cinematográfico
      const inT  = smoothstep(0.0, 1.2, this.t);
      const outT = 1.0 - smoothstep(this.life - 1.4, this.life, this.t);
      const alpha = clamp(inT * outT, 0, 1) * 0.78;
      if (alpha < 0.02) return;

      // escala controlada (sem zoom agressivo)
      const scale = clamp(p.invz * 1.22, 0.62, 1.02);
      const fontSize = (this.baseSize * DPR) * scale;

      const shimmer = 0.95 + Math.sin(this.tw + this.seed) * 0.05;

      const x = p.x;
      const y = p.y;

      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `${this.weight} ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;

      const padX = 18 * DPR * scale;
      const padY = 10 * DPR * scale;
      const w = ctx.measureText(this.text).width + padX * 2;
      const h = fontSize + padY * 2;
      const rr = 14 * DPR * scale;

      // fundo vidro bem leve
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = alpha * 0.28;
      roundRect(x - w/2, y - h/2, w, h, rr);
      ctx.fillStyle = `rgba(10,14,28,1)`;
      ctx.fill();

      // borda glow suave
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = alpha * 0.18 * shimmer;
      ctx.lineWidth = 2 * DPR * scale;
      ctx.strokeStyle = `rgba(120,190,255,1)`;
      ctx.stroke();

      // texto glow (bem sutil)
      ctx.globalAlpha = alpha * 0.20 * shimmer;
      ctx.fillStyle = `rgba(120,190,255,1)`;
      ctx.fillText(this.text, x, y + 0.5 * DPR);

      // texto principal
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = alpha * 0.92 * shimmer;
      ctx.fillStyle = `rgba(240,248,255,1)`;
      ctx.fillText(this.text, x, y);

      ctx.restore();
    }
  }

  let quotes = [];
  let quoteTimer = 0;
  let quoteIndex = 0;

  function initQuotes() {
    quotes.length = 0;
    quoteIndex = 0;
    quoteTimer = 1.0; // primeira aparece após 1s
  }

  function spawnQuote() {
    const text = QUOTES[quoteIndex % QUOTES.length];
    quoteIndex++;
    quotes.push(new Quote3D(text));
    if (quotes.length > 4) quotes.shift(); // mantém clean
  }

  function updateQuotes(dt, spdFinal) {
    const warpEase = smoothstep(0, 1, warp);
    const baseCadence = 3.9; // mais lento = mais cinema
    const speedBias = clamp((spdFinal - 1) / 6, 0, 1);
    const cadence = lerp(baseCadence, 2.7, speedBias) * (1.0 + warpEase * 0.15);

    quoteTimer -= dt;
    if (quoteTimer <= 0) {
      quoteTimer = cadence + rand(0.4, 1.1);
      spawnQuote();
    }

    for (let i = quotes.length - 1; i >= 0; i--) {
      if (!quotes[i].update(dt)) quotes.splice(i, 1);
    }
    for (let i = 0; i < quotes.length; i++) {
      quotes[i].draw(spdFinal);
    }
  }

  initQuotes();

  // ===== Extra: comet
  let cometCooldown = rand(1.8, 4.2);
  function maybeSpawnComet(dt, spdFinal) {
    if (comet.active) return;
    cometCooldown -= dt * (0.75 + spdFinal * 0.08);
    if (cometCooldown <= 0) {
      cometCooldown = rand(2.2, 5.0);
      if (Math.random() < 0.55) comet.spawn();
    }
  }

  // ===== Render parts
  function drawBackground(t, spdFinal) {
    const time = t * 0.00005;
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, `rgb(6,7,16)`);
    g.addColorStop(0.45, `rgb(4,7,18)`);
    g.addColorStop(1, `rgb(2,2,8)`);

    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < nebula.length; i++) {
      const n = nebula[i];
      const phase = n.phase + time * (0.8 + i * 0.3) + (spdFinal * 0.002);
      const ox = (Math.sin(phase) * n.s) + lookX * 0.02;
      const oy = (Math.cos(phase * 0.9) * n.s) + lookY * 0.02;

      const cx = (n.x + ox) * W;
      const cy = (n.y + oy) * H;
      const rr = n.r * Math.max(W, H);

      const rg = ctx.createRadialGradient(cx, cy, rr * 0.05, cx, cy, rr);
      rg.addColorStop(0.0, `rgba(140,120,255,${n.a * 0.8})`);
      rg.addColorStop(0.35, `rgba(90,160,255,${n.a * 0.55})`);
      rg.addColorStop(0.7, `rgba(60,90,220,${n.a * 0.25})`);
      rg.addColorStop(1.0, `rgba(0,0,0,0)`);

      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.globalAlpha = 0.18;
    const vg = ctx.createRadialGradient(CX, CY, Math.min(W, H) * 0.2, CX, CY, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  function drawDust(dt, adv) {
    const warpEase = smoothstep(0, 1, warp);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    for (let i = 0; i < dusts.length; i++) {
      const d = dusts[i];
      d.z -= adv * (0.68 + warpEase * 0.10);
      if (d.z <= zNear) d.reset(false);

      const p = project(d.x, d.y, d.z);
      if (!p || p.culled) continue;

      const fog = 1.0 - clamp(d.z / zFar, 0, 1);
      const alpha = d.alpha * (0.35 + fog * 0.9);
      const s = d.size * (p.invz * 1.8) * (1.0 + warpEase * 0.2);

      ctx.globalAlpha = alpha;

      const cool = 200 + Math.floor(35 * Math.sin((i * 0.17) + performance.now() * 0.002));
      ctx.fillStyle = d.spark
        ? `rgba(210,240,255,${alpha * 1.6})`
        : `rgba(120,${cool},255,${alpha})`;

      ctx.beginPath();
      ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
      ctx.fill();

      if (d.spark && warpEase > 0.2) {
        ctx.globalAlpha = alpha * 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, s * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function drawStars(dt, adv, spdFinal) {
    const warpEase = smoothstep(0, 1, warp);
    const time = performance.now() * 0.001;

    // normal pass
    ctx.save();
    ctx.globalCompositeOperation = "source-over";

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];

      const layerPar = s.layer === 0 ? 0.92 : s.layer === 1 ? 0.98 : 1.02;
      s.z -= adv * layerPar;

      if (s.z <= zNear) { s.reset(false); continue; }

      s.tw += dt * (0.8 + s.layer * 0.35);
      const tw = 0.85 + Math.sin(s.tw + time * 0.9) * 0.15;

      const p = project(s.x, s.y, s.z);
      if (!p || p.culled) continue;

      const zN = clamp(s.z / zFar, 0, 1);
      const fog = 1.0 - zN;
      const depthDim = lerp(0.55, 1.0, fog);

      const size = s.size * (p.invz * 3.2) * (1.0 + warpEase * 0.12);
      const b = s.base * tw * depthDim;

      const blu = 210 + Math.floor(25 * s.tint);
      const pur = 235 - Math.floor(35 * s.tint);
      ctx.fillStyle = `rgba(${pur},${blu},255,${clamp(0.10 + b * 0.65, 0, 0.95)})`;

      if (warpEase < 0.2) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.7 * DPR, size), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();

    // glow/warp pass
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    const streakBase = (spdFinal * 18) * (0.25 + warpEase);
    const streakMax = 520 * DPR;

    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const p = project(s.x, s.y, s.z);
      if (!p || p.culled) continue;

      const zN = clamp(s.z / zFar, 0, 1);
      const fog = 1.0 - zN;
      const tw = 0.9 + Math.sin(s.tw + time) * 0.10;

      const size = s.size * (p.invz * 3.2);
      const b = s.base * tw * lerp(0.55, 1.0, fog);
      const bright = (s.layer === 2) ? 1 : 0;

      if (warpEase > 0.12) {
        const dlen = clamp(streakBase * (1.0 + (1.0 - zN) * 2.2) * (0.55 + b), 10, streakMax);
        const ang = Math.atan2(p.dy, p.dx);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(ang);

        const g = ctx.createLinearGradient(0, 0, -dlen, 0);
        g.addColorStop(0.0, `rgba(230,245,255,${0.20 + b*0.35})`);
        g.addColorStop(0.4, `rgba(120,190,255,${0.10 + b*0.18})`);
        g.addColorStop(1.0, `rgba(80,120,255,0)`);
        ctx.strokeStyle = g;

        ctx.globalAlpha = 0.85;
        ctx.lineWidth = Math.max(1.0 * DPR, (0.9 + size) * 0.65);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-dlen, 0);
        ctx.stroke();

        ctx.globalAlpha = clamp(0.12 + b * 0.7, 0, 0.95);
        ctx.fillStyle = `rgba(230,250,255,${0.35 + b*0.35})`;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(0.8 * DPR, size * 0.85), 0, Math.PI * 2);
        ctx.fill();

        if (bright && s.halo) {
          ctx.globalAlpha = (0.10 + b * 0.20) * (0.6 + warpEase * 0.7);
          const rr = (10 + size * 6) * (0.7 + warpEase);
          const rg = ctx.createRadialGradient(0, 0, rr * 0.1, 0, 0, rr);
          rg.addColorStop(0, `rgba(200,220,255,${0.35 + b*0.25})`);
          rg.addColorStop(1, `rgba(80,120,255,0)`);
          ctx.fillStyle = rg;
          ctx.beginPath();
          ctx.arc(0, 0, rr, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      } else if (s.layer === 2 && s.halo) {
        ctx.globalAlpha = (0.06 + b * 0.12);
        const rr = (8 + size * 6);
        const rg = ctx.createRadialGradient(p.x, p.y, rr * 0.15, p.x, p.y, rr);
        rg.addColorStop(0, `rgba(210,235,255,${0.26 + b*0.15})`);
        rg.addColorStop(1, `rgba(80,120,255,0)`);
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function drawSpeedLines(t, spdFinal, warpEase) {
    const n = Math.floor(18 * quality);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.08 + warpEase * 0.10;

    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + t * 0.0002;
      const r = (0.10 + Math.random() * 0.48) * Math.min(W, H);
      const x = CX + Math.cos(a) * r + lookX * 40 * DPR;
      const y = CY + Math.sin(a) * r + lookY * 30 * DPR;

      const len = (40 + spdFinal * 20) * (0.2 + warpEase) * DPR;
      const ang = Math.atan2((y - CY), (x - CX));

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      const g = ctx.createLinearGradient(0, 0, -len, 0);
      g.addColorStop(0, `rgba(220,240,255,${0.22 + warpEase*0.25})`);
      g.addColorStop(1, `rgba(80,120,255,0)`);
      ctx.strokeStyle = g;
      ctx.lineWidth = 1 * DPR;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-len, 0);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  // ===== Main loop
  let last = now();
  function frame(t) {
    const dt = clamp((t - last) / 1000, 0, 0.04);
    last = t;

    const running = started ? 1 : 0;

    // auto quality só quando começou
    if (running) {
      const instFps = dt > 0 ? (1 / dt) : 60;
      fpsSm = lerp(fpsSm, instFps, 0.08);

      fpsDropTimer += dt;
      if (fpsDropTimer > 0.6) {
        fpsDropTimer = 0;
        if (fpsSm < 52 && quality > 0.65) {
          quality = clamp(quality * 0.92, 0.65, 1.15);
          buildPools();
        } else if (fpsSm > 58 && quality < 1.05) {
          quality = clamp(quality * 1.03, 0.65, 1.15);
          buildPools();
        }
      }
    }

    // look smoothing sempre
    input.mx = lerp(input.mx, input.tx, 0.06);
    input.my = lerp(input.my, input.ty, 0.06);

    swayT += dt * (0.55 + speed * 0.12);
    const swayX = Math.sin(swayT * 0.9) * 0.06 + Math.sin(swayT * 0.23) * 0.04;
    const swayY = Math.cos(swayT * 0.8) * 0.05 + Math.sin(swayT * 0.31) * 0.03;

    lookX = lerp(lookX, (input.mx * 0.55 + swayX) * (1.0 - warp * 0.25), 0.08);
    lookY = lerp(lookY, (input.my * 0.42 + swayY) * (1.0 - warp * 0.25), 0.08);

    // speed quando começou
    if (running) {
      if (input.accel !== 0) targetSpeed += input.accel * dt * 1.4;
      targetSpeed = clamp(targetSpeed, 0.25, 8.0);
      boost = lerp(boost, input.boost ? 1 : 0, 0.06);
    } else {
      targetSpeed = lerp(targetSpeed, 0.55, 0.03);
      boost = lerp(boost, 0, 0.06);
    }

    warp = lerp(warp, running ? warpTarget : 0, 0.045);
    const warpEase = smoothstep(0, 1, warp);

    speed = lerp(speed, targetSpeed, 0.045);

    const warpMult = 1.0 + warpEase * 2.2;
    const boostMult = 1.0 + boost * 0.65;

    const spdFinal = speed * warpMult * boostMult;
    const adv = baseSpeed * spdFinal * dt * (running ? 1 : 0.15);

    drawBackground(t, spdFinal);
    drawDust(dt, adv);
    drawStars(dt, adv, spdFinal);

    // FRASES (só depois de começar)
    if (running) updateQuotes(dt, spdFinal);

    if (warpEase > 0.05 && running) drawSpeedLines(t, spdFinal, warpEase);

    if (running) {
      maybeSpawnComet(dt, spdFinal);
      comet.update(dt, adv);
      comet.draw(project);
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
