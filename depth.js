"use strict";
/* =========================================================
 * 增量阶段 Y2：盘面伪3D光影 DEPTH（纯 Canvas2D）
 * 职责：① 钢珠：金属球体（高光点 + 环形环境漫反射 + 底部霓虹反光 + 投影）
 *       ② 83 颗钉子：圆柱立体（顶面高光 + 柱身渐变 + 向下投影）
 *       ③ 导轨：厚度投影 + 金属管高光芯
 *       ④ P0~P4：凹槽内阴影，做向内凹陷的纵深
 * 零侵入做法：重烘焙 skin-board 的公开贴图属性（rivetC/rivetM/ball），
 *             并覆写 BOARD.draw 叠加壳体与凹槽层；skin-board.js 源码不动。
 * 物理、规则、存档、风险通道、奖励靶逻辑完全不涉及。
 * 学习演示用途，仅虚拟弹珠与虚拟积分，无任何兑换功能。
 * ========================================================= */

const DEPTH = {
  /* ---------- Y2.1 参数 ---------- */
  C: {
    TILE: 48, LEVELS: 16, PEG_DRAW: 24,   // 与 skin-board 保持一致
    PEG_SPEED: 1.6, GOLDEN: 2.39996,
    BALL: 72,                              // 钢珠贴图放大到 72px，细节更多
    SHADOW_OFF: 8,                         // 钉子投影在贴图内的下移量
    RAIL_SHADOW: 2.5,                      // 导轨投影偏移
    INSET_H: 30                            // 袋口凹槽阴影高度
  },

  enabled: false, inset: null, _orig: null,

  off(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  },

  /* ---------- Y2.2 圆柱铆钉（含向下投影） ---------- */
  bakeRivets(rgb) {
    const C = this.C, T = C.TILE, L = C.LEVELS, TAU = Math.PI * 2;
    const c = this.off(T * L, T), g = c.getContext("2d");
    for (let l = 0; l < L; l++) {
      const a = 0.20 + 0.80 * (l / (L - 1));
      const cx = l * T + T / 2, cy = T / 2, R = 7;

      // ① 向下投影：椭圆软影，是"立体"最直接的视觉线索
      const sh = g.createRadialGradient(cx, cy + C.SHADOW_OFF, 1, cx, cy + C.SHADOW_OFF, R * 1.5);
      sh.addColorStop(0.00, "rgba(0,0,0,0.55)");
      sh.addColorStop(0.60, "rgba(0,0,0,0.22)");
      sh.addColorStop(1.00, "rgba(0,0,0,0)");
      g.fillStyle = sh;
      g.save(); g.translate(cx, cy + C.SHADOW_OFF); g.scale(1, 0.45);
      g.beginPath(); g.arc(0, 0, R * 1.5, 0, TAU); g.fill(); g.restore();

      // ② 彩色外发光（保留 skin-board 的呼吸辉光）
      const rg = g.createRadialGradient(cx, cy, 2, cx, cy, T * 0.48);
      rg.addColorStop(0.00, "rgba(" + rgb + "," + (0.44 * a).toFixed(3) + ")");
      rg.addColorStop(0.45, "rgba(" + rgb + "," + (0.16 * a).toFixed(3) + ")");
      rg.addColorStop(1.00, "rgba(" + rgb + ",0)");
      g.fillStyle = rg;
      g.beginPath(); g.arc(cx, cy, T * 0.48, 0, TAU); g.fill();

      // ③ 彩色边缘反光环
      g.strokeStyle = "rgba(" + rgb + "," + (0.75 * a).toFixed(3) + ")";
      g.lineWidth = 1.6;
      g.beginPath(); g.arc(cx, cy, R + 0.7, 0, TAU); g.stroke();

      // ④ 圆柱柱身：竖直渐变（上亮下暗），比径向渐变更像"立起来的柱子"
      const body = g.createLinearGradient(cx, cy - R, cx, cy + R);
      body.addColorStop(0.00, "#f2f6fc");
      body.addColorStop(0.30, "#c3cddd");
      body.addColorStop(0.62, "#7d8a9d");
      body.addColorStop(1.00, "#3b4557");
      g.fillStyle = body;
      g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();

      // ⑤ 左侧受光高光（水平方向的明暗交界，圆柱体的特征）
      const side = g.createLinearGradient(cx - R, cy, cx + R, cy);
      side.addColorStop(0.00, "rgba(255,255,255,0.35)");
      side.addColorStop(0.42, "rgba(255,255,255,0.06)");
      side.addColorStop(1.00, "rgba(0,0,0,0.35)");
      g.fillStyle = side;
      g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();

      // ⑥ 顶面高光点 + 底部暗边，收口
      g.fillStyle = "rgba(255,255,255,0.95)";
      g.beginPath(); g.ellipse(cx - 2.2, cy - 2.8, 2.1, 1.5, -0.5, 0, TAU); g.fill();
      g.strokeStyle = "rgba(12,18,30,0.55)"; g.lineWidth = 1.2;
      g.beginPath(); g.arc(cx, cy, R - 0.8, Math.PI * 0.12, Math.PI * 0.88); g.stroke();
    }
    return c;
  },

  /* ---------- Y2.3 金属钢珠（环境漫反射 + 双光源 + 投影） ---------- */
  bakeBall() {
    const S = this.C.BALL, TAU = Math.PI * 2, R = S / 2 - 3;
    const c = this.off(S, S), g = c.getContext("2d");

    // 球体主渐变（光源左上）
    const rg = g.createRadialGradient(S * 0.34, S * 0.28, 1, S * 0.5, S * 0.5, R);
    rg.addColorStop(0.00, "#ffffff");
    rg.addColorStop(0.20, "#f2f6fc");
    rg.addColorStop(0.48, "#c2ccdb");
    rg.addColorStop(0.76, "#828fa2");
    rg.addColorStop(0.94, "#4a5568");
    rg.addColorStop(1.00, "#2c3444");
    g.beginPath(); g.arc(S / 2, S / 2, R, 0, TAU);
    g.fillStyle = rg; g.fill();

    g.save();
    g.beginPath(); g.arc(S / 2, S / 2, R, 0, TAU); g.clip();

    // 环境漫反射：机台灯箱在球体中段映出一道横向亮带
    const band = g.createLinearGradient(0, S * 0.34, 0, S * 0.62);
    band.addColorStop(0.00, "rgba(190,220,255,0)");
    band.addColorStop(0.50, "rgba(190,220,255,0.22)");
    band.addColorStop(1.00, "rgba(190,220,255,0)");
    g.fillStyle = band; g.fillRect(0, S * 0.34, S, S * 0.28);

    // 顶部环境反射弧（灯管映像）
    g.strokeStyle = "rgba(255,255,255,0.6)"; g.lineWidth = 3.4;
    g.beginPath(); g.arc(S / 2, S / 2, R * 0.78, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
    g.strokeStyle = "rgba(205,238,255,0.32)"; g.lineWidth = 1.5;
    g.beginPath(); g.arc(S / 2, S / 2, R * 0.60, Math.PI * 1.20, Math.PI * 1.80); g.stroke();

    // 底部霓虹反光（青紫）
    const rg2 = g.createRadialGradient(S * 0.58, S * 0.86, 1, S * 0.58, S * 0.86, R * 0.95);
    rg2.addColorStop(0.00, "rgba(120,220,255,0.55)");
    rg2.addColorStop(0.55, "rgba(150,90,255,0.22)");
    rg2.addColorStop(1.00, "rgba(120,220,255,0)");
    g.fillStyle = rg2; g.fillRect(0, 0, S, S);

    // 右下方压暗，加强球体转折
    const dark = g.createRadialGradient(S * 0.72, S * 0.76, R * 0.2, S * 0.72, S * 0.76, R);
    dark.addColorStop(0, "rgba(10,16,28,0)");
    dark.addColorStop(1, "rgba(10,16,28,0.5)");
    g.fillStyle = dark; g.fillRect(0, 0, S, S);
    g.restore();

    // 镜面高光点（金属特征：小而锐）
    g.fillStyle = "rgba(255,255,255,0.98)";
    g.beginPath(); g.arc(S * 0.35, S * 0.29, R * 0.16, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,0.55)";
    g.beginPath(); g.arc(S * 0.68, S * 0.71, R * 0.085, 0, TAU); g.fill();

    // 轮廓暗环
    g.strokeStyle = "rgba(14,20,32,0.6)"; g.lineWidth = 2.4;
    g.beginPath(); g.arc(S / 2, S / 2, R - 1, 0, TAU); g.stroke();
    return c;
  },

  /* ---------- Y2.4 袋口凹槽内阴影贴图 ---------- */
  bakeInset() {
    const W = 64, H = 40, c = this.off(W, H), g = c.getContext("2d");
    const lg = g.createLinearGradient(0, 0, 0, H);
    lg.addColorStop(0.00, "rgba(0,0,0,0.78)");
    lg.addColorStop(0.35, "rgba(0,0,0,0.42)");
    lg.addColorStop(0.75, "rgba(0,0,0,0.12)");
    lg.addColorStop(1.00, "rgba(0,0,0,0)");
    g.fillStyle = lg; g.fillRect(0, 0, W, H);
    // 左右两侧的内壁暗边，避免凹槽看起来只是"上暗下亮"
    const side = g.createLinearGradient(0, 0, W, 0);
    side.addColorStop(0.00, "rgba(0,0,0,0.45)");
    side.addColorStop(0.10, "rgba(0,0,0,0)");
    side.addColorStop(0.90, "rgba(0,0,0,0)");
    side.addColorStop(1.00, "rgba(0,0,0,0.45)");
    g.fillStyle = side; g.fillRect(0, 0, W, H);
    this.inset = c;
  },

  /* ---------- Y2.5 覆写后的盘面绘制 ---------- */
  board(ctx) {
    const F = BOARD.C.FRAME, I = BOARD.inner;
    const SW = I.x1 - I.x0, SH = I.y1 - I.y0;

    // ① 机台内框：金属斜向渐变 + 厚度阴影（外深内亮，做出壳体厚度）
    const lg = ctx.createLinearGradient(F.x, F.y, F.x + F.w, F.y + F.h);
    lg.addColorStop(0.00, "#e6edf6");
    lg.addColorStop(0.22, "#8d9aad");
    lg.addColorStop(0.55, "#414d63");
    lg.addColorStop(1.00, "#131a26");
    ctx.fillStyle = lg;
    ctx.fillRect(F.x, F.y, F.w, F.h);
    // 厚度：外沿一圈暗边 + 内侧一道窄高光
    ctx.strokeStyle = "rgba(0,0,0,0.55)"; ctx.lineWidth = 5;
    ctx.strokeRect(F.x + 2.5, F.y + 2.5, F.w - 5, F.h - 5);
    ctx.strokeStyle = "rgba(225,238,255,0.38)"; ctx.lineWidth = 1.4;
    ctx.strokeRect(I.x0 - 2, I.y0 - 2, SW + 4, SH + 4);

    // ② 复古印刷盘面（复用 skin-board 预烘焙贴图）
    if (SKIN.print) ctx.drawImage(SKIN.print, I.x0, I.y0);

    // ③ 内圈：凹陷阴影，让盘面像"嵌在壳体里"
    ctx.save();
    ctx.beginPath(); ctx.rect(I.x0, I.y0, SW, SH); ctx.clip();
    const iv = ctx.createLinearGradient(0, I.y0, 0, I.y0 + 22);
    iv.addColorStop(0, "rgba(0,0,0,0.55)");
    iv.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = iv; ctx.fillRect(I.x0, I.y0, SW, 22);
    const ih = ctx.createLinearGradient(I.x0, 0, I.x0 + 16, 0);
    ih.addColorStop(0, "rgba(0,0,0,0.4)");
    ih.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = ih; ctx.fillRect(I.x0, I.y0, 16, SH);
    const ih2 = ctx.createLinearGradient(I.x1, 0, I.x1 - 16, 0);
    ih2.addColorStop(0, "rgba(0,0,0,0.4)");
    ih2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = ih2; ctx.fillRect(I.x1 - 16, I.y0, 16, SH);
    ctx.restore();

    // ④ 袋口（复用 skin-board 的绘制）+ 凹槽内阴影
    SKIN.pockets(ctx);
    for (const pk of BOARD.pockets) {
      const w = pk.x1 - pk.x0;
      ctx.drawImage(this.inset, pk.x0 + 3, pk.y0 + 13, w - 6, this.C.INSET_H);
      // 槽底反光：底部一条淡亮边，强化"越往下越深"
      ctx.strokeStyle = "rgba(180,210,245,0.16)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pk.x0 + 6, pk.y1 - 4); ctx.lineTo(pk.x1 - 6, pk.y1 - 4);
      ctx.stroke();
    }

    // ⑤ 导轨：先铺一层偏移投影，再画金属管本体
    ctx.save();
    ctx.translate(this.C.RAIL_SHADOW, this.C.RAIL_SHADOW);
    ctx.lineCap = "round";
    for (const r of BOARD.rails) {
      if (r.kind === "divider") continue;
      ctx.beginPath();
      if (r.type === "line") { ctx.moveTo(r.x1, r.y1); ctx.lineTo(r.x2, r.y2); }
      else { ctx.arc(r.cx, r.cy, r.rad, r.a0, r.a1); }
      ctx.strokeStyle = "rgba(0,0,0,0.42)"; ctx.lineWidth = 10; ctx.stroke();
    }
    ctx.restore();
    SKIN.rails(ctx);

    // ⑥ 钉子（复用 skin-board 的绘制，贴图已被替换为圆柱样式）
    SKIN.pegs(ctx);
  },

  /* ---------- Y2.6 初始化：换贴图 + 覆写绘制 ---------- */
  init() {
    this.bakeInset();
    // 保存原始资源，供 V 键回退
    this._orig = {
      rivetC: SKIN.rivetC, rivetM: SKIN.rivetM, ball: SKIN.ball, board: BOARD.draw
    };
    // 重烘焙：圆柱钉子（保留青/品红双色）+ 金属钢珠
    SKIN.rivetC = this.bakeRivets("150,215,255");
    SKIN.rivetM = this.bakeRivets("255,140,225");
    SKIN.ball = this.bakeBall();

    this._boardFn = (ctx) => this.board(ctx);
    BOARD.draw = this._boardFn;
    this.enabled = true;
  },

  /* ---------- Y2.7 总开关：连贴图一起还原 ----------
   * 注意：关闭时要回退到 board.js 的「原始」绘制，而不是 skin-board 的版本。
   * skin-board 被 V 键关闭时会把 BOARD.draw 换成原始实现，若这里仍指向
   * skin-board 的绘制函数，就会导致"皮肤关了但盘面还是皮肤"的问题。 */
  setEnabled(b) {
    b = !!b;
    if (b === this.enabled || !this._orig) return;
    this.enabled = b;
    const plain = (typeof SKIN !== "undefined" && SKIN._origBoard) ? SKIN._origBoard : this._orig.board;
    BOARD.draw = b ? this._boardFn : plain;
    SKIN.rivetC = b ? this.bakeRivets("150,215,255") : this._orig.rivetC;
    SKIN.rivetM = b ? this.bakeRivets("255,140,225") : this._orig.rivetM;
    SKIN.ball = b ? this.bakeBall() : this._orig.ball;
  }
};

/* ---------- Y2.8 自注册：跟随盘面皮肤开关 ---------- */
if (typeof UPGRADE === "undefined" || UPGRADE.board) DEPTH.init();
