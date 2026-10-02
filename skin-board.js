"use strict";
/* =========================================================
 * 视觉升级 阶段 W2：复古印刷盘面 + 彩色反光铆钉 SKIN
 * 职责：① 盘面复古印刷质感（同心弧、放射条纹、印刷色块、纸纹颗粒、暗角）
 *       ② 镀铬内框与导轨（多层描边做出金属管高光）
 *       ③ 铆钉：16 级烘焙呼吸亮度 + 青/品红边缘彩色反光环（按行奇偶交错）
 *       ④ 袋口柔和灯带（光晕 + 亮芯双层）
 *       ⑤ 钢珠：金属球体 + 顶部环境反射弧 + 底部霓虹反光
 * 几何全部复用 BOARD 的钉阵/袋口/导轨/内区数据，坐标零硬编码。
 * 性能：全部贴图离屏预渲染，运行时每帧仅 drawImage，零分配。
 * 学习演示用途，仅虚拟弹珠与虚拟积分，无任何兑换功能。
 * ========================================================= */

const SKIN = {
  /* ---------- W2.1 参数 ---------- */
  C: {
    TILE: 48, LEVELS: 16, PEG_DRAW: 24, PEG_SPEED: 1.6, GOLDEN: 2.39996, BALL: 56,
    PRINT_A: 1.0,      // 印刷装饰总强度（0 关闭 / 1 默认 / 1.6 更浓）
    GRAIN: 900          // 纸纹颗粒数量（一次性绘制）
  },

  t: 0,
  rivetC: null, rivetM: null, ball: null, shadow: null,
  led: null, ledP2: null, bloom: null, print: null,
  enabled: false, _origBoard: null, _origBalls: null, _boardFn: null, _ballsFn: null,

  off(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  },

  /* ---------- W2.2 预烘焙：16 级呼吸铆钉（含彩色边缘反光） ---------- */
  buildRivets(rgb) {
    const C = this.C, T = C.TILE, L = C.LEVELS, TAU = Math.PI * 2;
    const c = this.off(T * L, T), g = c.getContext("2d");
    for (let l = 0; l < L; l++) {
      const a = 0.20 + 0.80 * (l / (L - 1));
      const cx = l * T + T / 2, cy = T / 2;

      // 外发光（彩色）
      const rg = g.createRadialGradient(cx, cy, 2, cx, cy, T * 0.48);
      rg.addColorStop(0.00, "rgba(" + rgb + "," + (0.46 * a).toFixed(3) + ")");
      rg.addColorStop(0.45, "rgba(" + rgb + "," + (0.17 * a).toFixed(3) + ")");
      rg.addColorStop(1.00, "rgba(" + rgb + ",0)");
      g.fillStyle = rg;
      g.beginPath(); g.arc(cx, cy, T * 0.48, 0, TAU); g.fill();

      // 彩色边缘反光环（金属边缘映出霓虹，这是"真机台"的关键细节）
      g.strokeStyle = "rgba(" + rgb + "," + (0.80 * a).toFixed(3) + ")";
      g.lineWidth = 1.6;
      g.beginPath(); g.arc(cx, cy, 7.7, 0, TAU); g.stroke();

      // 金属钉帽：光源左上
      const r2 = g.createRadialGradient(cx - 2.6, cy - 3.0, 0.6, cx, cy, 7.2);
      r2.addColorStop(0.00, "#ffffff");
      r2.addColorStop(0.32, "#dde6f4");
      r2.addColorStop(0.72, "#8d9aae");
      r2.addColorStop(1.00, "#454f63");
      g.fillStyle = r2;
      g.beginPath(); g.arc(cx, cy, 7, 0, TAU); g.fill();

      // 高光点 + 底部暗边
      g.fillStyle = "rgba(255,255,255,0.9)";
      g.beginPath(); g.arc(cx - 2.4, cy - 2.8, 1.7, 0, TAU); g.fill();
      g.strokeStyle = "rgba(16,22,36,0.5)"; g.lineWidth = 1.2;
      g.beginPath(); g.arc(cx, cy, 6.4, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
    }
    return c;
  },

  /* ---------- W2.3 预渲染：钢珠（金属 + 顶部环境反射 + 底部霓虹反光） ---------- */
  buildBall() {
    const S = this.C.BALL, TAU = Math.PI * 2, R = S / 2 - 2;
    const c = this.off(S, S), g = c.getContext("2d");

    const rg = g.createRadialGradient(S * 0.34, S * 0.28, 1, S * 0.5, S * 0.5, R);
    rg.addColorStop(0.00, "#ffffff");
    rg.addColorStop(0.24, "#eef3fb");
    rg.addColorStop(0.54, "#b4c0d3");
    rg.addColorStop(0.82, "#7c8799");
    rg.addColorStop(1.00, "#39435a");
    g.beginPath(); g.arc(S / 2, S / 2, R, 0, TAU);
    g.fillStyle = rg; g.fill();

    g.save();
    g.beginPath(); g.arc(S / 2, S / 2, R, 0, TAU); g.clip();

    // 顶部环境反射：机台上方的灯管/屏幕在球顶映成一道弧
    g.strokeStyle = "rgba(255,255,255,0.55)"; g.lineWidth = 3.2;
    g.beginPath(); g.arc(S / 2, S / 2, R * 0.80, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
    g.strokeStyle = "rgba(210,240,255,0.35)"; g.lineWidth = 1.4;
    g.beginPath(); g.arc(S / 2, S / 2, R * 0.62, Math.PI * 1.20, Math.PI * 1.80); g.stroke();

    // 底部霓虹反光（青紫）
    const rg2 = g.createRadialGradient(S * 0.60, S * 0.84, 1, S * 0.60, S * 0.84, R * 0.9);
    rg2.addColorStop(0.00, "rgba(120,220,255,0.55)");
    rg2.addColorStop(0.60, "rgba(150,90,255,0.20)");
    rg2.addColorStop(1.00, "rgba(120,220,255,0)");
    g.fillStyle = rg2; g.fillRect(0, 0, S, S);
    g.restore();

    // 镜面高光点
    g.fillStyle = "rgba(255,255,255,0.95)";
    g.beginPath(); g.arc(S * 0.36, S * 0.30, R * 0.17, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,0.5)";
    g.beginPath(); g.arc(S * 0.68, S * 0.72, R * 0.09, 0, TAU); g.fill();

    g.strokeStyle = "rgba(18,24,38,0.5)"; g.lineWidth = 2;
    g.beginPath(); g.arc(S / 2, S / 2, R - 1, 0, TAU); g.stroke();
    this.ball = c;
  },

  /* ---------- W2.4 预渲染：投影 ---------- */
  buildShadow() {
    const S = 48, c = this.off(S, S), g = c.getContext("2d");
    const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    rg.addColorStop(0.00, "rgba(0,0,0,0.55)");
    rg.addColorStop(0.60, "rgba(0,0,0,0.22)");
    rg.addColorStop(1.00, "rgba(0,0,0,0)");
    g.fillStyle = rg; g.fillRect(0, 0, S, S);
    this.shadow = c;
  },

  /* ---------- W2.5 预渲染：袋口灯带（冷白青 / P2 暖金）+ 爆光 ---------- */
  buildLed() {
    const W = 64, H = 20;
    const mk = (core, mid) => {
      const c = this.off(W, H), g = c.getContext("2d");
      const lg = g.createLinearGradient(0, 0, W, 0);
      lg.addColorStop(0.00, "rgba(" + mid + ",0)");
      lg.addColorStop(0.18, "rgba(" + mid + ",0.5)");
      lg.addColorStop(0.50, "rgba(" + core + ",0.9)");
      lg.addColorStop(0.82, "rgba(" + mid + ",0.5)");
      lg.addColorStop(1.00, "rgba(" + mid + ",0)");
      g.fillStyle = lg; g.fillRect(0, H * 0.25, W, H * 0.5);
      const vg = g.createLinearGradient(0, 0, 0, H);
      vg.addColorStop(0.00, "rgba(" + mid + ",0)");
      vg.addColorStop(0.50, "rgba(" + core + ",0.8)");
      vg.addColorStop(1.00, "rgba(" + mid + ",0)");
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
      return c;
    };
    this.led = mk("210,240,255", "90,170,255");
    this.ledP2 = mk("255,246,210", "255,170,90");

    const S = 128, c = this.off(S, S), g = c.getContext("2d");
    const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    rg.addColorStop(0.00, "rgba(255,250,225,0.95)");
    rg.addColorStop(0.30, "rgba(255,200,120,0.55)");
    rg.addColorStop(0.70, "rgba(255,140,80,0.18)");
    rg.addColorStop(1.00, "rgba(255,120,60,0)");
    g.fillStyle = rg; g.fillRect(0, 0, S, S);
    this.bloom = c;
  },

  /* ---------- W2.6 预渲染：复古印刷盘面 ---------- */
  buildPrint() {
    const I = BOARD.inner;
    const W = I.x1 - I.x0, H = I.y1 - I.y0, TAU = Math.PI * 2;
    const A = this.C.PRINT_A;
    const c = this.off(W, H), g = c.getContext("2d");

    // 底板：带 13% 透明度，让背景霓虹仍能从盘面透出来
    const base = g.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0.00, "rgba(18,30,52,0.90)");
    base.addColorStop(0.55, "rgba(13,22,38,0.88)");
    base.addColorStop(1.00, "rgba(10,16,30,0.90)");
    g.fillStyle = base; g.fillRect(0, 0, W, H);

    const ccx = W / 2, ccy = H * 0.17;   // 印刷同心弧的圆心（盘面上部中轴）

    // ① 同心弧
    g.strokeStyle = "rgba(232,224,200," + (0.085 * A).toFixed(3) + ")";
    g.lineWidth = 1;
    for (let r = 108; r <= W * 0.92; r += 32) {
      g.beginPath(); g.arc(ccx, ccy, r, 0.14 * Math.PI, 0.86 * Math.PI); g.stroke();
    }

    // ② 放射条纹
    const rays = 14;
    for (let i = 0; i < rays; i++) {
      const ang = Math.PI * (0.17 + 0.66 * i / (rays - 1));
      g.strokeStyle = "rgba(232,224,200," + (0.045 * A).toFixed(3) + ")";
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(ccx, ccy);
      g.lineTo(ccx + Math.cos(ang) * W * 1.2, ccy + Math.sin(ang) * W * 1.2);
      g.stroke();
    }

    // ③ 中央双圈（老机台中央装饰件的轮廓，不填充以保球路清晰）
    g.strokeStyle = "rgba(214,178,92," + (0.20 * A).toFixed(3) + ")";
    g.lineWidth = 2.5;
    g.beginPath(); g.arc(W / 2, H * 0.35, 126, 0, TAU); g.stroke();
    g.strokeStyle = "rgba(214,178,92," + (0.11 * A).toFixed(3) + ")";
    g.lineWidth = 1;
    g.beginPath(); g.arc(W / 2, H * 0.35, 110, 0, TAU); g.stroke();

    // ④ 印刷色块（四角，模仿机台的彩色印刷面板）
    const blocks = [
      [6, 6, 96, 62, "200,60,70"], [W - 108, 6, 102, 54, "40,150,120"],
      [10, H - 96, 78, 84, "45,110,190"], [W - 96, H - 74, 86, 62, "210,130,40"]
    ];
    for (const [x, y, w, h, col] of blocks) {
      g.fillStyle = "rgba(" + col + "," + (0.16 * A).toFixed(3) + ")";
      g.fillRect(x, y, w, h);
      g.strokeStyle = "rgba(" + col + "," + (0.34 * A).toFixed(3) + ")";
      g.lineWidth = 1.5; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }

    // ⑤ 纸纹颗粒：确定性正弦哈希，保证每次加载图案完全一致（无随机数）
    for (let i = 0; i < this.C.GRAIN; i++) {
      const n1 = Math.sin(i * 12.9898) * 43758.5453;
      const n2 = Math.sin(i * 78.2330) * 12345.6789;
      const fx = n1 - Math.floor(n1), fy = n2 - Math.floor(n2);
      g.fillStyle = "rgba(226,232,240," + (0.05 * A).toFixed(3) + ")";
      g.fillRect(fx * W, fy * H, 1, 1);
    }

    // ⑥ 暗角，增加纵深
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.72);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.38)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);

    this.print = c;
  },

  /* ---------- W2.7 盘面绘制 ---------- */
  board(ctx) {
    const F = BOARD.C.FRAME, I = BOARD.inner;
    // 机台金属内框（外深内亮的斜面）
    const lg = ctx.createLinearGradient(F.x, F.y, F.x + F.w, F.y + F.h);
    lg.addColorStop(0.00, "#cfd8e4");
    lg.addColorStop(0.35, "#5d6b80");
    lg.addColorStop(0.70, "#2b3547");
    lg.addColorStop(1.00, "#151c28");
    ctx.fillStyle = lg;
    ctx.fillRect(F.x, F.y, F.w, F.h);

    // 印刷盘面
    ctx.drawImage(this.print, I.x0, I.y0);

    // 内圈倒角：亮边 + 内阴影
    ctx.strokeStyle = "rgba(20,28,44,0.85)"; ctx.lineWidth = 3;
    ctx.strokeRect(I.x0 + 1.5, I.y0 + 1.5, I.x1 - I.x0 - 3, I.y1 - I.y0 - 3);
    ctx.strokeStyle = "rgba(190,215,245,0.30)"; ctx.lineWidth = 1;
    ctx.strokeRect(I.x0 + 3.5, I.y0 + 3.5, I.x1 - I.x0 - 7, I.y1 - I.y0 - 7);

    this.pockets(ctx);
    this.rails(ctx);
    this.pegs(ctx);
  },

  /* ---------- W2.8 袋口：暗腔 + 双层柔光灯带 + P2 爆光 ---------- */
  pockets(ctx) {
    const B = BOARD;
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (const pk of B.pockets) {
      const isP2 = (pk.id === 2);
      const w = pk.x1 - pk.x0;

      ctx.fillStyle = "rgba(5,8,16,0.88)";
      ctx.fillRect(pk.x0 + 3, pk.y0 + 2, w - 6, pk.y1 - pk.y0 - 2);

      const pulse = 0.5 + 0.5 * Math.sin(this.t * (isP2 ? 2.4 : 1.2) + pk.id * 1.1);
      const spr = isP2 ? this.ledP2 : this.led;

      // 外层光晕：宽而淡，做出"柔光溢出"
      ctx.globalAlpha = (isP2 ? 0.30 : 0.16) + 0.16 * pulse;
      ctx.drawImage(spr, pk.x0 - 2, pk.y0 - 7, w + 4, isP2 ? 34 : 26);
      // 内层亮芯：窄而亮
      ctx.globalAlpha = (isP2 ? 0.72 : 0.34) + 0.28 * pulse;
      ctx.drawImage(spr, pk.x0 + 3, pk.y0 - 3, w - 6, isP2 ? 18 : 12);
      ctx.globalAlpha = 1;

      // 隔板
      ctx.strokeStyle = "rgba(140,170,215,0.5)"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(pk.x0, pk.y0); ctx.lineTo(pk.x0, pk.y1); ctx.stroke();

      ctx.font = "11px monospace";
      ctx.fillStyle = isP2 ? "rgba(255,225,160,0.95)" : "rgba(150,190,255,0.75)";
      ctx.fillText("P" + pk.id, (pk.x0 + pk.x1) / 2, pk.y0 + 10);
    }
    const last = B.pockets[B.pockets.length - 1];
    ctx.strokeStyle = "rgba(140,170,215,0.5)"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(last.x1, last.y0); ctx.lineTo(last.x1, last.y1); ctx.stroke();

    // P2 命中爆光（只读 PLAY 状态，不碰计分）
    if (PLAY.lastHit && PLAY.lastHit.pocket === 2 && PLAY.hitTtl > 0) {
      const k = PLAY.hitTtl / PLAY.C.HIT_TTL;
      const s = 150 + 190 * (1 - k);
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = k * 0.85;
      ctx.drawImage(this.bloom, 240 - s / 2, B.C.POCKET_Y - s / 2, s, s);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  },

  /* ---------- W2.9 导轨：镀铬多层描边 ---------- */
  rails(ctx) {
    ctx.lineCap = "round";
    for (const r of BOARD.rails) {
      if (r.kind === "divider") continue;
      ctx.beginPath();
      if (r.type === "line") { ctx.moveTo(r.x1, r.y1); ctx.lineTo(r.x2, r.y2); }
      else { ctx.arc(r.cx, r.cy, r.rad, r.a0, r.a1); }
      ctx.strokeStyle = "rgba(2,5,12,0.8)"; ctx.lineWidth = 10; ctx.stroke();
      ctx.strokeStyle = "#7f93ad"; ctx.lineWidth = 7; ctx.stroke();
      ctx.strokeStyle = "#dbe6f5"; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 1; ctx.stroke();
    }
  },

  /* ---------- W2.10 铆钉：按行奇偶交错青/品红反光，每钉 1 次绘制 ---------- */
  pegs(ctx) {
    const p = BOARD.pegs, T = this.C.TILE, L = this.C.LEVELS, D = this.C.PEG_DRAW;
    const DY = BOARD.C.DX * Math.sqrt(3) / 2, Y0 = BOARD.C.Y0;
    for (let i = 0; i < p.length; i++) {
      const row = Math.round((p[i].y - Y0) / DY);
      const strip = (row % 2 === 0) ? this.rivetC : this.rivetM;   // 青 / 品红交错
      const ph = (i * this.C.GOLDEN) % (Math.PI * 2);
      const k = 0.5 + 0.5 * Math.sin(this.t * this.C.PEG_SPEED + ph);
      let lv = (k * (L - 1) + 0.5) | 0;
      if (lv >= L) lv = L - 1;
      ctx.drawImage(strip, lv * T, 0, T, T, p[i].x - D / 2, p[i].y - D / 2, D, D);
    }
  },

  /* ---------- W2.11 钢珠：投影 → 金属球 ---------- */
  balls(ctx) {
    const r = BALLS.C.R;
    for (const b of BALLS.list) {
      ctx.globalAlpha = 0.42;
      ctx.drawImage(this.shadow, b.x - r - 3, b.y - r + 2, (r + 3) * 2, (r + 3) * 2);
      ctx.globalAlpha = 1;
      ctx.drawImage(this.ball, b.x - r, b.y - r, r * 2, r * 2);
    }
  },

  /* ---------- W2.12 初始化 + 方法覆写 ---------- */
  init() {
    this.rivetC = this.buildRivets("150,215,255");   // 青
    this.rivetM = this.buildRivets("255,140,225");   // 品红
    this.buildBall();
    this.buildShadow();
    this.buildLed();
    this.buildPrint();
    this._origBoard = BOARD.draw;
    this._origBalls = BALLS.draw;
    this._boardFn = (ctx) => this.board(ctx);
    this._ballsFn = (ctx) => this.balls(ctx);
    this.enabled = true;
    BOARD.draw = this._boardFn;
    BALLS.draw = this._ballsFn;
  },

  /* ---------- W2.13 总开关：换回原始绘制 ---------- */
  setEnabled(b) {
    b = !!b;
    if (b === this.enabled) return;
    this.enabled = b;
    BOARD.draw = b ? this._boardFn : this._origBoard;
    BALLS.draw = b ? this._ballsFn : this._origBalls;
  }
};

/* ---------- W2.14 自注册：总开关关闭时保持原始皮肤 ---------- */
if (typeof UPGRADE === "undefined" || UPGRADE.board) {
  SKIN.init();
  GAME.updaters.push((dt) => { SKIN.t += dt; });
}
