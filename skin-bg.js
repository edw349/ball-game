"use strict";
/* =========================================================
 * 视觉升级 阶段 W1：机台外框 + 几何霓虹背景 SKINBG
 * 职责：① 木质外框 / 镀铬边条 / 复古彩色装饰块（离屏预渲染，静态）
 *       ② 几何霓虹动画：流动光带、矩形灯带、圆形光晕、渐变色块
 * 性能：全部贴图预渲染，运行时每帧约 12 次 drawImage，零分配。
 * 挂接方式：GAME.drawers.unshift(...) 插到管线最前，不改任何原文件。
 * 学习演示用途，仅虚拟弹珠与虚拟积分，无任何兑换功能。
 * ========================================================= */

const SKINBG = {
  /* ---------- W1.1 参数 ---------- */
  C: {
    W: 480, H: 720,
    SIDE: 24,          // 左右外框宽（画布 480 - 盘面 432 = 48，两侧各 24）
    TOP: 84,           // 顶部面板区高
    BOT: 24,           // 底部区高
    GLOW: 380, GLOW_A: 0.22,
    BAND_H: 220, BAND_A: 0.08, SCROLL: 7,
    BAR_A: 0.20, BLOCK_A: 0.16
  },

  base: null, band: null, glow: [], bars: [], blocks: [],
  t: 0, enabled: false, _drawer: null, _updater: null,

  off(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  },

  /* ---------- W1.2 静态底图：机台柜体 ---------- */
  buildBase() {
    const C = this.C, c = this.off(C.W, C.H), g = c.getContext("2d");

    // 柜体底色（深色木/漆面）
    g.fillStyle = "#120d12";
    g.fillRect(0, 0, C.W, C.H);

    // 左右：外层浅木纹 + 内层镀铬边条（模拟图2的木质外框 + 金属内框）
    for (const sx of [0, C.W - C.SIDE]) {
      const wood = g.createLinearGradient(sx, 0, sx + C.SIDE, 0);
      wood.addColorStop(0.00, "#6d5333");
      wood.addColorStop(0.35, "#b99a68");
      wood.addColorStop(0.62, "#8a6f47");
      wood.addColorStop(1.00, "#4a3722");
      g.fillStyle = wood;
      g.fillRect(sx, 0, C.SIDE, C.H);

      const chrome = g.createLinearGradient(sx + (sx ? -9 : 9), 0, sx + (sx ? 0 : C.SIDE), 0);
      chrome.addColorStop(0.00, "#e8eef6");
      chrome.addColorStop(0.35, "#9fb0c4");
      chrome.addColorStop(0.55, "#5d6b7d");
      chrome.addColorStop(1.00, "#2b3540");
      g.fillStyle = chrome;
      g.fillRect(sx ? sx + C.SIDE - 11 : sx + 11, 0, 11, C.H);

      // 装饰铆钉
      g.fillStyle = "rgba(240,248,255,0.55)";
      for (let y = 40; y < C.H - 30; y += 62) {
        g.beginPath(); g.arc(sx + (sx ? C.SIDE - 5.5 : 5.5), y, 2.2, 0, Math.PI * 2); g.fill();
      }
    }

    // 顶部面板区：暗红漆面（HUD 面板会盖住大部分，留缝隙可见）
    const top = g.createLinearGradient(0, 0, 0, C.TOP);
    top.addColorStop(0, "#3d1020");
    top.addColorStop(1, "#1a0810");
    g.fillStyle = top;
    g.fillRect(0, 0, C.W, C.TOP);

    // 底部：暗色底座 + 一条镀铬饰线
    g.fillStyle = "#0b070c";
    g.fillRect(0, C.H - C.BOT, C.W, C.BOT);
    g.fillStyle = "rgba(180,200,220,0.30)";
    g.fillRect(0, C.H - C.BOT + 3, C.W, 1.5);

    // 复古彩色装饰块（模仿机台印刷面板的红/绿/蓝/橙）
    const chips = [
      [4, 78, 16, 26, "#c8323c"], [4, 330, 16, 40, "#1f8f5a"],
      [4, 520, 16, 30, "#2a6fb5"], [4, 610, 16, 22, "#d97a22"],
      [460, 78, 16, 22, "#d97a22"], [460, 300, 16, 44, "#2a6fb5"],
      [460, 500, 16, 30, "#c8323c"], [460, 600, 16, 30, "#1f8f5a"]
    ];
    for (const [x, y, w, h, col] of chips) {
      g.fillStyle = col; g.fillRect(x, y, w, h);
      g.fillStyle = "rgba(255,255,255,0.18)"; g.fillRect(x, y, w, 2);
      g.strokeStyle = "rgba(0,0,0,0.45)"; g.lineWidth = 1;
      g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
    this.base = c;
  },

  /* ---------- W1.3 圆形光晕精灵 ---------- */
  buildGlow(rgb) {
    const S = 128, c = this.off(S, S), g = c.getContext("2d");
    const r = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    r.addColorStop(0.00, "rgba(" + rgb + ",0.75)");
    r.addColorStop(0.45, "rgba(" + rgb + ",0.26)");
    r.addColorStop(1.00, "rgba(" + rgb + ",0)");
    g.fillStyle = r; g.fillRect(0, 0, S, S);
    return c;
  },

  /* ---------- W1.4 矩形霓虹灯带精灵（横向柔光条） ---------- */
  buildBar(rgb) {
    const W = 200, H = 8, c = this.off(W, H), g = c.getContext("2d");
    const lg = g.createLinearGradient(0, 0, W, 0);
    lg.addColorStop(0.00, "rgba(" + rgb + ",0)");
    lg.addColorStop(0.22, "rgba(" + rgb + ",0.5)");
    lg.addColorStop(0.50, "rgba(" + rgb + ",0.95)");
    lg.addColorStop(0.78, "rgba(" + rgb + ",0.5)");
    lg.addColorStop(1.00, "rgba(" + rgb + ",0)");
    g.fillStyle = lg; g.fillRect(0, H * 0.28, W, H * 0.44);
    const vg = g.createLinearGradient(0, 0, 0, H);
    vg.addColorStop(0.00, "rgba(" + rgb + ",0)");
    vg.addColorStop(0.50, "rgba(" + rgb + ",0.8)");
    vg.addColorStop(1.00, "rgba(" + rgb + ",0)");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
    return c;
  },

  /* ---------- W1.5 渐变色块精灵（印刷色块 + 柔边） ---------- */
  buildBlock(rgb) {
    const W = 128, H = 128, c = this.off(W, H), g = c.getContext("2d");
    for (const [x, y, w, h] of [[0, 0, 88, 96], [34, 58, 94, 70]]) {
      const lg = g.createLinearGradient(x, y, x + w, y + h);
      lg.addColorStop(0, "rgba(" + rgb + ",0.75)");
      lg.addColorStop(1, "rgba(" + rgb + ",0.10)");
      g.fillStyle = lg; g.fillRect(x, y, w, h);
    }
    g.globalCompositeOperation = "destination-in";
    const mask = g.createRadialGradient(W / 2, H / 2, 6, W / 2, H / 2, W / 2);
    mask.addColorStop(0, "rgba(0,0,0,1)");
    mask.addColorStop(0.7, "rgba(0,0,0,0.55)");
    mask.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = mask; g.fillRect(0, 0, W, H);
    return c;
  },

  /* ---------- W1.6 流动光带（无缝纵向循环） ---------- */
  buildBand() {
    const C = this.C, c = this.off(C.W, C.BAND_H), g = c.getContext("2d");
    const stops = [
      { y: 0.24, h: 0.15, a: 0.5, col: "80,220,255" },
      { y: 0.54, h: 0.18, a: 0.36, col: "150,110,255" },
      { y: 0.82, h: 0.13, a: 0.42, col: "255,110,190" }
    ];
    for (const s of stops) {
      const y0 = s.y * C.BAND_H, hh = s.h * C.BAND_H;
      const lin = g.createLinearGradient(0, y0 - hh, 0, y0 + hh);
      lin.addColorStop(0, "rgba(" + s.col + ",0)");
      lin.addColorStop(0.5, "rgba(" + s.col + "," + s.a + ")");
      lin.addColorStop(1, "rgba(" + s.col + ",0)");
      g.fillStyle = lin; g.fillRect(0, y0 - hh, C.W, hh * 2);
    }
    this.band = c;
  },

  /* ---------- W1.7 初始化 ---------- */
  init() {
    this.buildBase();
    this.buildBand();
    this.glow = [this.buildGlow("46,220,210"), this.buildGlow("120,110,255"),
                 this.buildGlow("255,80,170"), this.buildGlow("60,150,255")];
    this.bars = [this.buildBar("46,230,220"), this.buildBar("255,90,180"),
                 this.buildBar("255,180,70")];
    this.blocks = [this.buildBlock("40,180,120"), this.buildBlock("220,60,70"),
                   this.buildBlock("50,120,220")];
  },

  /* ---------- W1.8 每帧绘制 ---------- */
  draw(ctx) {
    const C = this.C, t = this.t;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.drawImage(this.base, 0, 0);          // 机台柜体（静态）

    ctx.globalCompositeOperation = "lighter";

    // ① 流动光带：两份错位实现无缝下淌
    ctx.globalAlpha = C.BAND_A;
    const off = (t * C.SCROLL) % C.BAND_H;
    ctx.drawImage(this.band, 0, off - C.BAND_H);
    ctx.drawImage(this.band, 0, off);

    // ② 渐变色块：缓慢漂移的印刷色块
    ctx.globalAlpha = C.BLOCK_A;
    for (let i = 0; i < 3; i++) {
      const ph = i * 2.1;
      const x = 60 + i * 150 + 46 * Math.sin(t * 0.09 + ph);
      const y = 150 + (i % 2) * 330 + 60 * Math.sin(t * 0.06 + ph * 1.4);
      const s = 120 + 26 * Math.sin(t * 0.13 + ph);
      ctx.drawImage(this.blocks[i], x - s / 2, y - s / 2, s, s);
    }

    // ③ 圆形光晕
    const px = [0.18, 0.82, 0.34, 0.70], py = [0.22, 0.74, 0.88, 0.14];
    for (let i = 0; i < 4; i++) {
      const ph = i * 1.7;
      const x = C.W * px[i] + 80 * Math.sin(t * 0.11 + ph);
      const y = C.H * py[i] + 120 * Math.sin(t * 0.07 + ph * 1.3);
      const pulse = 0.75 + 0.25 * Math.sin(t * 0.23 + ph);
      ctx.globalAlpha = C.GLOW_A * pulse;
      const s = C.GLOW;
      ctx.drawImage(this.glow[i], x - s / 2, y - s / 2, s, s);
    }

    // ④ 矩形霓虹灯带：缓慢摆动 + 呼吸
    for (let i = 0; i < this.bars.length; i++) {
      const wob = 0.12 * Math.sin(t * 0.17 + i * 2.0);   // 摆动 ±0.12rad（约 7°）
      ctx.save();
      ctx.translate(240 + (i - 1) * 62, 118 + i * 236);
      ctx.rotate(wob);
      ctx.globalAlpha = C.BAR_A * (0.7 + 0.3 * Math.sin(t * 0.31 + i));
      ctx.drawImage(this.bars[i], -150, -5, 300, 10);
      ctx.restore();
    }

    // 复原，避免污染后续绘制层
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  },

  /* ---------- W1.9 总开关：热切换 ---------- */
  setEnabled(b) {
    b = !!b;
    if (b === this.enabled) return;
    this.enabled = b;
    if (b) {
      if (GAME.drawers.indexOf(this._drawer) < 0) GAME.drawers.unshift(this._drawer);
      if (GAME.updaters.indexOf(this._updater) < 0) GAME.updaters.unshift(this._updater);
    } else {
      let i = GAME.drawers.indexOf(this._drawer);
      if (i >= 0) GAME.drawers.splice(i, 1);
      i = GAME.updaters.indexOf(this._updater);
      if (i >= 0) GAME.updaters.splice(i, 1);
    }
  }
};

/* ---------- W1.10 自注册：总开关关闭时整套跳过 ---------- */
if (typeof UPGRADE === "undefined" || UPGRADE.bg) {
  SKINBG.init();
  SKINBG._drawer = (ctx) => SKINBG.draw(ctx);
  SKINBG._updater = (dt) => { SKINBG.t += dt; };
  SKINBG.enabled = true;
  GAME.drawers.unshift(SKINBG._drawer);
  GAME.updaters.unshift(SKINBG._updater);
}
