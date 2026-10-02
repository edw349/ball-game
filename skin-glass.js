"use strict";
/* =========================================================
 * 视觉升级 阶段 W3：玻璃盖板与机台压边 GLASS
 * 职责：① 金属压边外框（固定玻璃的镀铬压条）+ 四角螺丝高光
 *       ② 弧形玻璃反光（两道斜向柔和环境光）+ 边角暗角
 *       ③ HUD 数码管面板复古配色描边（暗红 + 金色）
 * 层级：插在 FX 之后、STATE 之前 —— 在盘面/钢珠/粒子之上，
 *       但在结算面板与调试面板之下，保证 UI 始终清晰可读。
 * 性能：压边与 HUD 边框各烘焙成 1 张贴图，每帧仅 2 次 drawImage。
 * 不修改任何物理、钉阵、袋口、弹珠逻辑。
 * 学习演示用途，仅虚拟弹珠与虚拟积分，无任何兑换功能。
 * ========================================================= */

const GLASS = {
  /* ---------- W3.1 参数 ---------- */
  C: {
    BEZEL: 14,        // 压边宽度（同时压住 10px 壁厚 + 4px 玻璃边缘）
    SCREW_R: 4.5,     // 角螺丝半径
    SHEEN_A: 0.10,    // 弧形反光强度上限（必须很低，不能遮挡球路）
    VIGNETTE: 0.09    // 玻璃暗角强度
  },

  pane: null, hudFrame: null,
  enabled: false, _drawer: null,

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

  /* ---------- W3.2 预烘焙：压边 + 螺丝 + 弧形反光 + 暗角 ---------- */
  buildPane() {
    const C = this.C, F = BOARD.C.FRAME, I = BOARD.inner;
    const W = F.w, H = F.h;                       // 432 × 612
    const ix = I.x0 - F.x, iy = I.y0 - F.y;       // 玻璃内区在贴图内的原点
    const iw = I.x1 - I.x0, ih = I.y1 - I.y0;     // 412 × 592
    const b = C.BEZEL;
    const c = this.off(W, H), g = c.getContext("2d");

    // ① 四条镀铬压条：上亮下暗、左亮右次亮，模拟机台上方来光
    const tl = g.createLinearGradient(0, 0, 0, b);
    tl.addColorStop(0.00, "#f4f8fd"); tl.addColorStop(0.45, "#aab7c8"); tl.addColorStop(1.00, "#5b6675");
    g.fillStyle = tl; g.fillRect(0, 0, W, b);

    const bl = g.createLinearGradient(0, H - b, 0, H);
    bl.addColorStop(0.00, "#39424f"); bl.addColorStop(0.60, "#8b97a8"); bl.addColorStop(1.00, "#d3dbe6");
    g.fillStyle = bl; g.fillRect(0, H - b, W, b);

    const lf = g.createLinearGradient(0, 0, b, 0);
    lf.addColorStop(0.00, "#e2e9f2"); lf.addColorStop(0.50, "#95a2b3"); lf.addColorStop(1.00, "#4e5866");
    g.fillStyle = lf; g.fillRect(0, 0, b, H);

    const rt = g.createLinearGradient(W - b, 0, W, 0);
    rt.addColorStop(0.00, "#4e5866"); rt.addColorStop(0.55, "#98a5b6"); rt.addColorStop(1.00, "#cfd8e3");
    g.fillStyle = rt; g.fillRect(W - b, 0, b, H);

    // 压条上的细高光与内沿缝隙
    g.fillStyle = "rgba(255,255,255,0.55)";
    g.fillRect(0, 2, W, 1); g.fillRect(2, 0, 1, H);
    g.fillStyle = "rgba(10,14,22,0.75)";
    g.fillRect(b - 1, 0, 1, H); g.fillRect(0, b - 1, W, 1);
    g.fillStyle = "rgba(10,14,22,0.55)";
    g.fillRect(W - b, 0, 1, H); g.fillRect(0, H - b - 1, W, 1);

    // ② 四角螺丝（金属圆盘 + 一字槽 + 高光弧）
    const screws = [[7, 7], [W - 7, 7], [7, H - 7], [W - 7, H - 7]];
    for (let i = 0; i < screws.length; i++) {
      const [sx, sy] = screws[i], r = C.SCREW_R;
      const rg = g.createRadialGradient(sx - r * 0.4, sy - r * 0.4, 0.5, sx, sy, r);
      rg.addColorStop(0.00, "#ffffff"); rg.addColorStop(0.45, "#b9c4d2");
      rg.addColorStop(0.80, "#6f7b8c"); rg.addColorStop(1.00, "#333c49");
      g.fillStyle = rg; g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "rgba(12,18,28,0.7)"; g.lineWidth = 1;
      g.beginPath(); g.arc(sx, sy, r - 0.5, 0, Math.PI * 2); g.stroke();
      // 一字槽（四个角轮换角度，破除呆板）
      g.save(); g.translate(sx, sy); g.rotate((i % 2 ? Math.PI / 4 : -Math.PI / 4));
      g.fillStyle = "rgba(20,26,36,0.75)"; g.fillRect(-r * 0.7, -0.8, r * 1.4, 1.6);
      g.restore();
      g.strokeStyle = "rgba(255,255,255,0.6)"; g.lineWidth = 1;
      g.beginPath(); g.arc(sx, sy, r * 0.72, Math.PI * 1.05, Math.PI * 1.7); g.stroke();
    }

    // ③ 弧形玻璃反光：裁剪在玻璃区域内，两道斜向柔和光带
    g.save();
    g.beginPath(); g.rect(ix, iy, iw, ih); g.clip();

    g.save();
    g.translate(ix + iw * 0.34, iy + ih * 0.30);
    g.rotate(-0.62);                                  // 约 -35°
    const s1 = g.createLinearGradient(0, -110, 0, 110);
    s1.addColorStop(0.00, "rgba(255,255,255,0)");
    s1.addColorStop(0.48, "rgba(226,240,255," + C.SHEEN_A + ")");
    s1.addColorStop(1.00, "rgba(255,255,255,0)");
    g.fillStyle = s1; g.fillRect(-460, -110, 920, 220);
    g.restore();

    g.save();
    g.translate(ix + iw * 0.72, iy + ih * 0.68);
    g.rotate(-0.62);
    const s2 = g.createLinearGradient(0, -54, 0, 54);
    s2.addColorStop(0.00, "rgba(255,255,255,0)");
    s2.addColorStop(0.50, "rgba(210,232,255," + (C.SHEEN_A * 0.62).toFixed(3) + ")");
    s2.addColorStop(1.00, "rgba(255,255,255,0)");
    g.fillStyle = s2; g.fillRect(-460, -54, 920, 108);
    g.restore();

    // ④ 玻璃暗角：四角略暗，增强"隔着玻璃看"的纵深
    const cx0 = ix + iw / 2, cy0 = iy + ih / 2;
    const vg = g.createRadialGradient(cx0, cy0, ih * 0.30, cx0, cy0, ih * 0.78);
    vg.addColorStop(0.00, "rgba(0,0,0,0)");
    vg.addColorStop(1.00, "rgba(0,0,0," + C.VIGNETTE + ")");
    g.fillStyle = vg; g.fillRect(ix, iy, iw, ih);
    g.restore();

    this.pane = c;
  },

  /* ---------- W3.3 预烘焙：HUD 面板复古边框（暗红 + 金色） ---------- */
  buildHudFrame() {
    const c = this.off(CFG.W, 84), g = c.getContext("2d");
    for (const P of HUD.C.PANELS) {
      // 暗红外描边（老机台面板漆色）
      g.strokeStyle = "#5e1722"; g.lineWidth = 3.5;
      this.roundRect(g, P.x - 1.5, P.y - 1.5, P.w + 3, P.h + 3, 8); g.stroke();
      // 金色细线
      g.strokeStyle = "rgba(214,178,92,0.78)"; g.lineWidth = 1.4;
      this.roundRect(g, P.x + 0.7, P.y + 0.7, P.w - 1.4, P.h - 1.4, 7); g.stroke();
      // 四角金色装饰角标
      const L = 9;
      g.strokeStyle = "rgba(238,206,124,0.9)"; g.lineWidth = 2;
      const corners = [[P.x + 3, P.y + 3, 1, 1], [P.x + P.w - 3, P.y + 3, -1, 1],
                       [P.x + 3, P.y + P.h - 3, 1, -1], [P.x + P.w - 3, P.y + P.h - 3, -1, -1]];
      for (const [cx, cy, sx, sy] of corners) {
        g.beginPath();
        g.moveTo(cx, cy + sy * L); g.lineTo(cx, cy); g.lineTo(cx + sx * L, cy);
        g.stroke();
      }
    }
    this.hudFrame = c;
  },

  /* ---------- W3.4 每帧绘制：2 次 drawImage ---------- */
  draw(ctx) {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (this.pane) ctx.drawImage(this.pane, BOARD.C.FRAME.x, BOARD.C.FRAME.y);
    if (this.hudFrame) ctx.drawImage(this.hudFrame, 0, 0);
  },

  /* ---------- W3.5 总开关：从渲染管线插拔 ---------- */
  insert() {
    // 定位 STATE 的 drawer（闭包形如 (ctx) => STATE.draw(ctx)），插到它之前
    const i = GAME.drawers.findIndex((f) => /STATE\s*\./.test(String(f)));
    if (i >= 0) GAME.drawers.splice(i, 0, this._drawer);
    else GAME.drawers.push(this._drawer);
  },
  remove() {
    const i = GAME.drawers.indexOf(this._drawer);
    if (i >= 0) GAME.drawers.splice(i, 1);
  },
  setEnabled(b) {
    b = !!b;
    if (b === this.enabled) return;
    this.enabled = b;
    if (b) this.insert(); else this.remove();
  }
};

/* ---------- W3.6 自注册：盘面皮肤开启时才压玻璃；HUD 边框跟随 HUD 开关 ---------- */
if (typeof UPGRADE === "undefined" || UPGRADE.board) {
  if (typeof UPGRADE === "undefined" || UPGRADE.hud) GLASS.buildHudFrame();
  GLASS.buildPane();
  GLASS._drawer = (ctx) => GLASS.draw(ctx);
  GLASS.enabled = true;
  GLASS.insert();
}
