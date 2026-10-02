"use strict";
/* =========================================================
 * 视觉/音频升级 阶段 V4：机台显示屏 HUD
 * 职责：覆写 PLAY.draw，把顶部状态条改为实体柏青哥机台显示屏：
 *       ① 七段数码管字形（Canvas 多边形自绘，预烘焙成图集）
 *       ② 金属倒角外框 + 内凹屏幕 + 扫描线
 *       ③ 三块屏幕：积分 / 剩余弹珠 / 蓄力力度（数字 + LED 力度条）
 * 数值全部只读 GAME.score / GAME.ballsLeft / PLAY.charge，逻辑零改动。
 * 性能：字形烘焙成贴图，运行时每字符 1 次 drawImage。
 * 学习演示用途，仅虚拟弹珠与虚拟积分，无任何兑换功能。
 * ========================================================= */

const HUD = {
  /* ---------- V4.1 参数与布局 ---------- */
  C: {
    PANELS: [
      { x: 8,   y: 6, w: 180, h: 72, label: "积分" },
      { x: 196, y: 6, w: 116, h: 72, label: "剩余" },
      { x: 320, y: 6, w: 152, h: 72, label: "力度" }
    ],
    TILE_W: 26, TILE_H: 44,   // 单个字形贴图尺寸
    SEG_T: 6, SEG_P: 2,       // 段厚 / 边距
    GLYPHS: "0123456789-+P ",
    BAR_CELLS: 12
  },

  /* 字形 → 段集合（a 上, b 右上, c 右下, d 下, e 左下, f 左上, g 中） */
  SEG: {
    "0": "abcdef", "1": "bc", "2": "abdeg", "3": "abcdg", "4": "bcfg",
    "5": "acdfg", "6": "acdefg", "7": "abc", "8": "abcdefg", "9": "abcdfg",
    "-": "g", "P": "abefg", "+": "plus", " ": ""
  },

  PAL: {
    c: { on: "#8ff4ff", glow: "#22c9ff", off: "#16283f" },  // 青（积分/剩余）
    a: { on: "#ffd27a", glow: "#ff9a2e", off: "#3a2a12" }   // 琥珀（力度）
  },

  atlas: {}, chrome: null, scan: null, cells: null,
  enabled: false, _origDraw: null, _drawFn: null,

  /* ---------- V4.11 总开关：换回原始文字版状态条 ---------- */
  setEnabled(b) {
    b = !!b;
    if (b === this.enabled) return;
    this.enabled = b;
    PLAY.draw = b ? this._drawFn : this._origDraw;
  },

  /* ---------- V4.2 离屏工具 ---------- */
  off(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  },
  roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  },

  /* ---------- V4.3 预烘焙：七段数码管字形图集 ---------- */
  buildAtlas(key) {
    const C = this.C, W = C.TILE_W, H = C.TILE_H, t = C.SEG_T, p = C.SEG_P;
    const pal = this.PAL[key];
    const chars = C.GLYPHS;
    const c = this.off(W * chars.length, H), g = c.getContext("2d");

    // 六边形段路径
    const horiz = (g, ox, xa, xb, cy) => {
      g.beginPath();
      g.moveTo(ox + xa, cy);
      g.lineTo(ox + xa + t / 2, cy - t / 2);
      g.lineTo(ox + xb - t / 2, cy - t / 2);
      g.lineTo(ox + xb, cy);
      g.lineTo(ox + xb - t / 2, cy + t / 2);
      g.lineTo(ox + xa + t / 2, cy + t / 2);
      g.closePath(); g.fill();
    };
    const vert = (g, ox, cx, ya, yb) => {
      g.beginPath();
      g.moveTo(ox + cx, ya);
      g.lineTo(ox + cx + t / 2, ya + t / 2);
      g.lineTo(ox + cx + t / 2, yb - t / 2);
      g.lineTo(ox + cx, yb);
      g.lineTo(ox + cx - t / 2, yb - t / 2);
      g.lineTo(ox + cx - t / 2, ya + t / 2);
      g.closePath(); g.fill();
    };
    const draw = (g, ox, name, lit) => {
      g.fillStyle = lit ? pal.on : pal.off;
      g.shadowBlur = lit ? 7 : 0;
      g.shadowColor = lit ? pal.glow : "transparent";
      if (name === "a") horiz(g, ox, p + t, W - p - t, p + t / 2);
      else if (name === "g") horiz(g, ox, p + t, W - p - t, H / 2);
      else if (name === "d") horiz(g, ox, p + t, W - p - t, H - p - t / 2);
      else if (name === "f") vert(g, ox, p + t / 2, p + t, H / 2 - t / 2);
      else if (name === "b") vert(g, ox, W - p - t / 2, p + t, H / 2 - t / 2);
      else if (name === "e") vert(g, ox, p + t / 2, H / 2 + t / 2, H - p - t);
      else if (name === "c") vert(g, ox, W - p - t / 2, H / 2 + t / 2, H - p - t);
    };

    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i], on = this.SEG[ch] || "", ox = i * W;
      // 先画熄灭段（真数码管关断时也有淡影）
      for (const s of "abcdefg") draw(g, ox, s, false);
      if (ch === "+") {                     // 加号十字，单独绘制
        g.fillStyle = pal.on; g.shadowBlur = 7; g.shadowColor = pal.glow;
        g.fillRect(ox + W / 2 - t * 1.6, H / 2 - t / 2, t * 3.2, t);
        g.fillRect(ox + W / 2 - t / 2, H / 2 - t * 1.6, t, t * 3.2);
      } else {
        for (const s of on) draw(g, ox, s, true);
      }
      g.shadowBlur = 0;
    }
    this.atlas[key] = c;
  },

  /* ---------- V4.4 预烘焙：机台面板（外框 + 内凹屏 + 标签） ---------- */
  buildChrome() {
    const c = this.off(480, 84), g = c.getContext("2d");
    for (const P of this.C.PANELS) {
      // 金属倒角外框
      const lg = g.createLinearGradient(P.x, P.y, P.x + P.w, P.y + P.h);
      lg.addColorStop(0.0, "#31456a");
      lg.addColorStop(0.5, "#1b2740");
      lg.addColorStop(1.0, "#0b1220");
      g.fillStyle = lg;
      this.roundRect(g, P.x, P.y, P.w, P.h, 7); g.fill();
      g.strokeStyle = "rgba(150,200,255,0.22)"; g.lineWidth = 1.5;
      this.roundRect(g, P.x + 0.75, P.y + 0.75, P.w - 1.5, P.h - 1.5, 7); g.stroke();

      // 内凹屏幕（顶部压暗，模拟玻璃反光）
      const ix = P.x + 5, iy = P.y + 5, iw = P.w - 10, ih = P.h - 10;
      g.fillStyle = "#040a14";
      this.roundRect(g, ix, iy, iw, ih, 4); g.fill();
      const iv = g.createLinearGradient(0, iy, 0, iy + ih);
      iv.addColorStop(0.0, "rgba(0,0,0,0.55)");
      iv.addColorStop(0.45, "rgba(0,0,0,0)");
      iv.addColorStop(1.0, "rgba(120,180,255,0.06)");
      g.fillStyle = iv;
      this.roundRect(g, ix, iy, iw, ih, 4); g.fill();

      // 屏幕标签
      g.font = "11px monospace";
      g.textAlign = "left"; g.textBaseline = "top";
      g.fillStyle = "rgba(140,190,255,0.85)";
      g.fillText(P.label, ix + 6, iy + 4);
    }
    this.chrome = c;
  },

  /* ---------- V4.5 预烘焙：扫描线 + 玻璃反光 ---------- */
  buildScan() {
    const c = this.off(480, 84), g = c.getContext("2d");
    g.fillStyle = "rgba(0,0,0,0.20)";
    for (let y = 0; y < 84; y += 3) g.fillRect(0, y, 480, 1);
    const lg = g.createLinearGradient(0, 0, 0, 40);
    lg.addColorStop(0, "rgba(200,230,255,0.055)");
    lg.addColorStop(1, "rgba(200,230,255,0)");
    g.fillStyle = lg; g.fillRect(0, 0, 480, 40);
    this.scan = c;
  },

  /* ---------- V4.6 预烘焙：LED 力度格（三种颜色 + 熄灭态） ---------- */
  buildCells() {
    const W = 10, H = 16;
    const mk = (a, b) => {
      const c = this.off(W, H), g = c.getContext("2d");
      const lg = g.createLinearGradient(0, 0, 0, H);
      lg.addColorStop(0, a); lg.addColorStop(0.5, b); lg.addColorStop(1, a);
      g.fillStyle = lg; g.fillRect(1, 1, W - 2, H - 2);
      g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(1, H / 2, W - 2, 1);
      return c;
    };
    this.cells = {
      c: mk("rgba(120,240,255,0.55)", "rgba(180,255,255,0.95)"),
      a: mk("rgba(255,190,90,0.55)", "rgba(255,230,160,0.95)"),
      r: mk("rgba(255,90,90,0.55)", "rgba(255,170,150,0.95)"),
      off: mk("rgba(30,45,70,0.45)", "rgba(50,70,105,0.55)")
    };
  },

  /* ---------- V4.7 数字绘制：右对齐，前导零留空 ---------- */
  glyphIndex(ch) {
    const i = this.C.GLYPHS.indexOf(ch);
    return i < 0 ? this.C.GLYPHS.length - 1 : i;   // 未知字符画空格
  },
  digitsWidth(n, scale, gap) {
    return n * this.C.TILE_W * scale + (n - 1) * gap;
  },
  drawNumber(ctx, num, count, right, bottom, scale, key) {
    const C = this.C, s = C.GLYPHS;
    let str = String(Math.max(0, Math.floor(num)));
    if (str.length > count) str = str.slice(str.length - count);   // 超长截高位
    while (str.length < count) str = " " + str;                    // 左侧补空位
    const gap = 3 * scale;
    const w = this.digitsWidth(count, scale, gap);
    let x = right - w;
    const y = bottom - C.TILE_H * scale;
    const at = this.atlas[key];
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch !== " ") {
        ctx.drawImage(at, this.glyphIndex(ch) * C.TILE_W, 0, C.TILE_W, C.TILE_H,
                      x, y, C.TILE_W * scale, C.TILE_H * scale);
      }
      x += C.TILE_W * scale + gap;
    }
  },

  /* ---------- V4.8 主绘制：覆写 PLAY.draw ---------- */
  draw(ctx) {
    const C = this.C, P = C.PANELS;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(this.chrome, 0, 0);

    // ① 积分：5 位，青
    const A = P[0];
    this.drawNumber(ctx, GAME.score, 5, A.x + A.w - 11, A.y + A.h - 9, 0.62, "c");

    // ② 剩余弹珠：2 位，青
    const B = P[1];
    this.drawNumber(ctx, GAME.ballsLeft, 2, B.x + B.w - 11, B.y + B.h - 9, 0.62, "c");

    // ③ 力度：3 位数字 + LED 力度条，琥珀
    const G = P[2];
    const p = PLAY.charging ? PLAY.charge : 0;
    this.drawNumber(ctx, Math.round(p * 100), 3, G.x + G.w - 11, G.y + 42, 0.52, "a");

    const lit = Math.round(p * C.BAR_CELLS);
    const cw = 9, gap = 2, bx = G.x + 11, by = G.y + 50;
    for (let i = 0; i < C.BAR_CELLS; i++) {
      let spr;
      if (i >= lit) spr = this.cells.off;
      else if (p > 0.8) spr = this.cells.r;
      else if (p > 0.5) spr = this.cells.a;
      else spr = this.cells.c;
      ctx.drawImage(spr, bx + i * (cw + gap), by, cw, 16);
    }

    // ④ 扫描线 + 玻璃反光
    ctx.drawImage(this.scan, 0, 0);

    // ⑤ 入袋提示（沿用 PLAY.hitTtl，数码管样式）
    if (PLAY.hitTtl > 0 && PLAY.lastHit) {
      const k = Math.min(1, PLAY.hitTtl / 0.4);
      const sc = 1.15;
      const txt = "P" + PLAY.lastHit.pocket + "+" + PLAY.lastHit.score;
      const gap2 = 3 * sc;
      const w = this.digitsWidth(txt.length, sc, gap2);
      let x = 240 - w / 2;
      const y = 320 - C.TILE_H * sc / 2;
      ctx.globalAlpha = k;
      const at = this.atlas.a;
      for (let i = 0; i < txt.length; i++) {
        ctx.drawImage(at, this.glyphIndex(txt[i]) * C.TILE_W, 0, C.TILE_W, C.TILE_H,
                      x, y, C.TILE_W * sc, C.TILE_H * sc);
        x += C.TILE_W * sc + gap2;
      }
      ctx.globalAlpha = 1;
    }
  },

  /* ---------- V4.9 初始化 + 覆写 ---------- */
  init() {
    this.buildAtlas("c");
    this.buildAtlas("a");
    this.buildChrome();
    this.buildScan();
    this.buildCells();
    this._origDraw = PLAY.draw;              // 备份原始状态条绘制
    this._drawFn = (ctx) => this.draw(ctx);
    this.enabled = true;
    PLAY.draw = this._drawFn;                // 覆写方法名，原闭包自动调用新实现
  }
};

/* ---------- V4.10 自注册：总开关关闭时保留原始文字 UI ---------- */
if (typeof UPGRADE === "undefined" || UPGRADE.hud) HUD.init();
