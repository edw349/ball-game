"use strict";
/* =========================================================
 * 增量阶段 Y3：壳体厚度 / 机房氛围 / UI 内阴影 DEPTH-SHELL
 * 职责：① 机台外壳：木纹厚度 + 镀铬立体高光 + 四角螺丝 + 外沿厚度
 *       ② 背景：暗调霓虹机房氛围（顶部雾霭 / 地面辉光 / 四周暗角），
 *          并把原本较亮的霓虹与色块压暗，弱化扁平点阵感
 *       ③ HUD 数码管面板：重烘焙为带三向内阴影与玻璃反光的机台屏
 * 零侵入：不修改 skin-bg.js / hud.js 源码，只重烘焙其公开贴图属性
 *         （SKINBG.base、HUD.chrome）并追加一个氛围渲染层。
 * 物理、规则、存档、风险通道、奖励靶、评级、粒子特效全部不涉及。
 * 学习演示用途，仅虚拟弹珠与虚拟积分，无任何兑换功能。
 * ========================================================= */

const SHELL = {
  /* ---------- Y3.1 参数 ---------- */
  C: {
    SIDE: 24,          // 左右柜体宽度（与 skin-bg 一致）
    TOP: 84,
    BOT: 24,
    VIGNETTE: 0.42,    // 氛围层四角暗角强度
    HAZE: 0.14         // 顶部雾霭强度
  },

  enabled: false, _orig: null,

  off(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  },

  /* ---------- Y3.2 重烘焙柜体底图 ---------- */
  bakeBase() {
    const C = this.C, W = CFG.W, H = CFG.H;
    const c = this.off(W, H), g = c.getContext("2d");

    g.fillStyle = "#0d0a0d";
    g.fillRect(0, 0, W, H);

    // ① 左右柜体：木纹（含确定性纹理线）+ 镀铬边条（六段渐变做出金属厚度）
    for (const left of [true, false]) {
      const sx = left ? 0 : W - C.SIDE;
      const wood = g.createLinearGradient(sx, 0, sx + C.SIDE, 0);
      wood.addColorStop(0.00, "#3a2a18");
      wood.addColorStop(0.22, "#9c7f52");
      wood.addColorStop(0.46, "#c2a878");
      wood.addColorStop(0.68, "#7d6440");
      wood.addColorStop(1.00, "#2e2113");
      g.fillStyle = wood;
      g.fillRect(sx, 0, C.SIDE, H);

      // 木纹：正弦哈希定位，图案每次加载一致（无随机数）
      g.strokeStyle = "rgba(50,34,16,0.20)";
      g.lineWidth = 1;
      for (let i = 0; i < 70; i++) {
        const n = Math.sin(i * 12.9898) * 43758.5453;
        const f = n - Math.floor(n);
        const x0 = sx + 1 + f * (C.SIDE - 12);
        g.beginPath();
        for (let y = 0; y <= H; y += 24) {
          const wob = Math.sin((y + i * 37) * 0.013) * 1.6;
          if (y === 0) g.moveTo(x0 + wob, y); else g.lineTo(x0 + wob, y);
        }
        g.stroke();
      }

      // 镀铬边条：厚 11px，紧贴内缘（与 skin-bg 位置一致）
      const bx = left ? C.SIDE - 13 : W - C.SIDE + 2;
      const ch = g.createLinearGradient(bx, 0, bx + 11, 0);
      const stops = left
        ? ["#20262f", "#eef4fb", "#aab7c7", "#5d6b7d", "#2b3540", "#141a22"]
        : ["#141a22", "#2b3540", "#8b98a8", "#e2eaf4", "#7b8899", "#20262f"];
      stops.forEach((col, i) => ch.addColorStop(i / (stops.length - 1), col));
      g.fillStyle = ch;
      g.fillRect(bx, 0, 11, H);

      // 边条两端的缝隙暗线，做出"嵌进木头里"的厚度
      g.fillStyle = "rgba(0,0,0,0.55)";
      g.fillRect(left ? bx - 1 : bx + 11, 0, 1, H);
      g.fillStyle = "rgba(255,255,255,0.22)";
      g.fillRect(left ? bx + 11 : bx - 1, 0, 1, H);

      // 装饰铆钉（带高光与下投影）
      for (let y = 52; y < H - 34; y += 62) {
        const rx = left ? C.SIDE - 6.5 : W - C.SIDE + 6.5;
        g.fillStyle = "rgba(0,0,0,0.5)";
        g.beginPath(); g.arc(rx, y + 1.4, 2.4, 0, Math.PI * 2); g.fill();
        const rg = g.createRadialGradient(rx - 0.8, y - 0.9, 0.3, rx, y, 2.6);
        rg.addColorStop(0, "#ffffff"); rg.addColorStop(0.5, "#c3cedd"); rg.addColorStop(1, "#4c5666");
        g.fillStyle = rg;
        g.beginPath(); g.arc(rx, y, 2.4, 0, Math.PI * 2); g.fill();
      }
    }

    // ② 顶部面板：暗红漆面 + 上暗下亮的厚度
    const top = g.createLinearGradient(0, 0, 0, C.TOP);
    top.addColorStop(0.00, "#1d0810");
    top.addColorStop(0.35, "#4a1526");
    top.addColorStop(1.00, "#240c16");
    g.fillStyle = top;
    g.fillRect(0, 0, W, C.TOP);
    g.fillStyle = "rgba(0,0,0,0.55)";
    g.fillRect(0, C.TOP - 3, W, 3);

    // ③ 底部底座：上暗下亮 + 镀铬饰线
    const bot = g.createLinearGradient(0, H - C.BOT, 0, H);
    bot.addColorStop(0.00, "#05070c");
    bot.addColorStop(0.55, "#101822");
    bot.addColorStop(1.00, "#05070c");
    g.fillStyle = bot;
    g.fillRect(0, H - C.BOT, W, C.BOT);
    g.fillStyle = "rgba(170,195,220,0.28)";
    g.fillRect(0, H - C.BOT + 3, W, 1.5);

    // ④ 复古彩色装饰块（保留轮廓，压暗一档融入暗调氛围）
    const chips = [
      [4, 78, 16, 26, "#a8291f"], [4, 330, 16, 40, "#176b45"],
      [4, 520, 16, 30, "#215a94"], [4, 610, 16, 22, "#a85f1a"],
      [460, 78, 16, 22, "#a85f1a"], [460, 300, 16, 44, "#215a94"],
      [460, 500, 16, 30, "#a8291f"], [460, 600, 16, 30, "#176b45"]
    ];
    for (const [x, y, w, h, col] of chips) {
      g.fillStyle = col; g.fillRect(x, y, w, h);
      g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(x, y, w, 2);
      g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(x, y + h - 2, w, 2);
      g.strokeStyle = "rgba(0,0,0,0.5)"; g.lineWidth = 1;
      g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }

    // ⑤ 四角固定螺丝（机台外壳的厚度感来源之一）
    for (const [x, y] of [[12, 12], [W - 12, 12], [12, H - 12], [W - 12, H - 12]]) {
      g.fillStyle = "rgba(0,0,0,0.55)";
      g.beginPath(); g.arc(x, y + 1.6, 5, 0, Math.PI * 2); g.fill();
      const rg = g.createRadialGradient(x - 1.6, y - 1.8, 0.5, x, y, 5.4);
      rg.addColorStop(0, "#ffffff"); rg.addColorStop(0.45, "#b9c4d2");
      rg.addColorStop(0.82, "#6f7b8c"); rg.addColorStop(1, "#2b333f");
      g.fillStyle = rg;
      g.beginPath(); g.arc(x, y, 5.2, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x - 2.6, y - 2.6); g.lineTo(x + 2.6, y + 2.6); g.stroke();
    }

    // ⑥ 整体外沿厚度：一圈内阴影，让柜体像"凸出"于画面
    const edge = g.createLinearGradient(0, 0, W, H);
    edge.addColorStop(0.00, "rgba(255,255,255,0.10)");
    edge.addColorStop(0.06, "rgba(255,255,255,0)");
    edge.addColorStop(0.94, "rgba(0,0,0,0)");
    edge.addColorStop(1.00, "rgba(0,0,0,0.45)");
    g.fillStyle = edge; g.fillRect(0, 0, W, H);

    return c;
  },

  /* ---------- Y3.3 重烘焙 HUD 面板：三向内阴影 + 玻璃反光 ---------- */
  bakeChrome() {
    const c = this.off(CFG.W, 84), g = c.getContext("2d");
    const rr = (x, y, w, h, r) => {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    };
    for (const P of HUD.C.PANELS) {
      // 金属外框（上亮下暗，做出凸起的边框厚度）
      const lg = g.createLinearGradient(P.x, P.y, P.x + P.w, P.y + P.h);
      lg.addColorStop(0.00, "#3d5170");
      lg.addColorStop(0.35, "#22304c");
      lg.addColorStop(0.75, "#131c2e");
      lg.addColorStop(1.00, "#080d16");
      g.fillStyle = lg;
      rr(P.x, P.y, P.w, P.h, 7); g.fill();
      g.strokeStyle = "rgba(180,215,255,0.28)"; g.lineWidth = 1.4;
      rr(P.x + 0.7, P.y + 0.7, P.w - 1.4, P.h - 1.4, 7); g.stroke();

      // 内凹屏
      const ix = P.x + 5, iy = P.y + 5, iw = P.w - 10, ih = P.h - 10;
      g.fillStyle = "#03070e";
      rr(ix, iy, iw, ih, 4); g.fill();

      // 三向内阴影：顶 / 左 / 右（这是摆脱扁平色块的关键）
      g.save();
      rr(ix, iy, iw, ih, 4); g.clip();
      const t = g.createLinearGradient(0, iy, 0, iy + 13);
      t.addColorStop(0, "rgba(0,0,0,0.85)"); t.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = t; g.fillRect(ix, iy, iw, 13);
      const l = g.createLinearGradient(ix, 0, ix + 9, 0);
      l.addColorStop(0, "rgba(0,0,0,0.7)"); l.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = l; g.fillRect(ix, iy, 9, ih);
      const r = g.createLinearGradient(ix + iw, 0, ix + iw - 9, 0);
      r.addColorStop(0, "rgba(0,0,0,0.7)"); r.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = r; g.fillRect(ix + iw - 9, iy, 9, ih);
      // 底部内反光：屏幕底面把光弹回，强化凹陷
      const b = g.createLinearGradient(0, iy + ih - 9, 0, iy + ih);
      b.addColorStop(0, "rgba(0,0,0,0)"); b.addColorStop(1, "rgba(150,200,255,0.16)");
      g.fillStyle = b; g.fillRect(ix, iy + ih - 9, iw, 9);
      g.restore();

      // 玻璃反光斜带（很淡，只提亮不遮字）
      g.save();
      rr(ix, iy, iw, ih, 4); g.clip();
      const gl = g.createLinearGradient(ix, iy, ix + iw * 0.75, iy + ih);
      gl.addColorStop(0.00, "rgba(210,235,255,0.10)");
      gl.addColorStop(0.45, "rgba(210,235,255,0.03)");
      gl.addColorStop(1.00, "rgba(210,235,255,0)");
      g.fillStyle = gl; g.fillRect(ix, iy, iw, ih);
      g.restore();

      // 屏幕标签
      g.font = "11px monospace";
      g.textAlign = "left"; g.textBaseline = "top";
      g.fillStyle = "rgba(140,190,255,0.85)";
      g.fillText(P.label, ix + 6, iy + 4);
    }
    return c;
  },

  /* ---------- Y3.4 氛围层：顶部雾霭 / 地面辉光 / 四周暗角 ---------- */
  draw(ctx) {
    const C = this.C, W = CFG.W, H = CFG.H;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    // 顶部雾霭（冷色，压低上半部亮度）
    const hz = ctx.createLinearGradient(0, C.TOP, 0, C.TOP + 150);
    hz.addColorStop(0.00, "rgba(28,45,80," + C.HAZE + ")");
    hz.addColorStop(1.00, "rgba(28,45,80,0)");
    ctx.fillStyle = hz;
    ctx.fillRect(0, C.TOP, W, 150);

    // 地面辉光（机房地板反光，从底部往上衰减）
    const fl = ctx.createLinearGradient(0, H, 0, H - 220);
    fl.addColorStop(0.00, "rgba(40,70,110,0.20)");
    fl.addColorStop(1.00, "rgba(40,70,110,0)");
    ctx.fillStyle = fl;
    ctx.fillRect(0, H - 220, W, 220);

    // 四周暗角（把视线收进盘面，弱化扁平点阵的均匀感）
    const vg = ctx.createRadialGradient(W / 2, H * 0.46, H * 0.22, W / 2, H * 0.46, H * 0.78);
    vg.addColorStop(0.00, "rgba(0,0,0,0)");
    vg.addColorStop(0.62, "rgba(0,0,0,0.20)");
    vg.addColorStop(1.00, "rgba(0,0,0," + C.VIGNETTE + ")");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  },

  /* ---------- Y3.5 初始化 ---------- */
  init() {
    this._orig = { base: SKINBG.base, chrome: HUD.chrome };

    // ① 重烘焙柜体底图
    SKINBG.base = this.bakeBase();
    // ② 压暗霓虹与渐变色块，转为暗调机房氛围（改的是 skin-bg 的公开参数）
    SKINBG.C.GLOW_A = 0.16;   // 原 0.22
    SKINBG.C.BLOCK_A = 0.10;  // 原 0.16
    SKINBG.C.BAR_A = 0.12;    // 原 0.20
    SKINBG.C.BAND_A = 0.06;   // 原 0.08
    // ③ 重烘焙 HUD 面板
    if (HUD.C && HUD.C.PANELS) HUD.chrome = this.bakeChrome();

    // ④ 氛围层：插在背景层之后、盘面之前
    this._drawer = (ctx) => this.draw(ctx);
    const bi = GAME.drawers.findIndex((f) => /SKINBG\s*\./.test(String(f)));
    if (bi >= 0) GAME.drawers.splice(bi + 1, 0, this._drawer);
    else GAME.drawers.unshift(this._drawer);
    this.enabled = true;
  },

  /* ---------- Y3.6 总开关 ---------- */
  setEnabled(b) {
    b = !!b;
    if (b === this.enabled || !this._orig) return;
    this.enabled = b;
    if (b) {
      SKINBG.base = this.bakeBase();
      SKINBG.C.GLOW_A = 0.16; SKINBG.C.BLOCK_A = 0.10;
      SKINBG.C.BAR_A = 0.12; SKINBG.C.BAND_A = 0.06;
      HUD.chrome = this.bakeChrome();
      if (GAME.drawers.indexOf(this._drawer) < 0) {
        const bi = GAME.drawers.findIndex((f) => /SKINBG\s*\./.test(String(f)));
        GAME.drawers.splice(bi >= 0 ? bi + 1 : 0, 0, this._drawer);
      }
    } else {
      SKINBG.base = this._orig.base;
      SKINBG.C.GLOW_A = 0.22; SKINBG.C.BLOCK_A = 0.16;
      SKINBG.C.BAR_A = 0.20; SKINBG.C.BAND_A = 0.08;
      HUD.chrome = this._orig.chrome;
      const i = GAME.drawers.indexOf(this._drawer);
      if (i >= 0) GAME.drawers.splice(i, 1);
    }
  }
};

/* ---------- Y3.7 自注册：跟随背景开关 ---------- */
if (typeof UPGRADE === "undefined" || UPGRADE.bg) SHELL.init();
