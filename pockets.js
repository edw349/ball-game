"use strict";
/* =========================================================
 * 迭代阶段 Z2：底部得分槽金属工业化 POCKETS
 * 职责：① 把 P0~P4 从"黑色方框"改成金属工业风槽体
 *           拉丝底纹 + 金属侧脊 + 倒角槽唇 + 微弱斜向反光
 *       ② 彻底删除底部的 P0~P4 文字标识
 *       ③ 保留：P2 暖金灯带更高更亮、命中爆光、隔板物理边界
 * 零侵入：覆写 SKIN.pockets（DEPTH.board 按方法名调用它）。
 *         计分逻辑在 PLAY，物理边界在 BOARD.rails，均不涉及。
 * 学习演示用途，仅虚拟弹珠与虚拟积分，无任何兑换功能。
 * ========================================================= */

const POCKETS = {
  /* ---------- Z2.1 参数 ---------- */
  C: {
    LIP: 5,          // 槽唇倒角高度
    RIDGE: 4,        // 槽口两侧金属脊宽度
    BRUSH: 18,       // 拉丝底纹行距
    SHEEN: 0.10      // 斜向反光强度上限
  },

  brusher: null,     // 预烘焙拉丝底纹（横向重复贴图）

  off(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  },

  /* ---------- Z2.2 预烘焙：拉丝金属底纹 ---------- */
  buildBrush() {
    const W = 64, H = 32, c = this.off(W, H), g = c.getContext("2d");
    g.fillStyle = "#0c1119";
    g.fillRect(0, 0, W, H);
    // 细密横向拉丝：确定性正弦哈希，图案每次加载一致（无随机数）
    for (let i = 0; i < 120; i++) {
      const n = Math.sin(i * 12.9898) * 43758.5453;
      const f = n - Math.floor(n);
      const y = f * H;
      const a = 0.05 + 0.09 * (1 - f);
      g.fillStyle = "rgba(190,214,240," + a.toFixed(3) + ")";
      g.fillRect(0, y, W, 1);
    }
    // 一道很淡的斜向反光，避免整块死黑
    const lg = g.createLinearGradient(0, 0, W, H);
    lg.addColorStop(0.00, "rgba(255,255,255,0.06)");
    lg.addColorStop(0.45, "rgba(255,255,255,0.015)");
    lg.addColorStop(1.00, "rgba(255,255,255,0)");
    g.fillStyle = lg; g.fillRect(0, 0, W, H);
    this.brusher = c;
  },

  /* ---------- Z2.3 单个槽体绘制 ---------- */
  one(ctx, pk, t) {
    const C = this.C;
    const isP2 = (pk.id === 2);
    const x = pk.x0 + 2, w = (pk.x1 - pk.x0) - 4;
    const y0 = pk.y0 + 8, h = (pk.y1 - pk.y0) - 8;
    if (w <= 4 || h <= 4) return;

    // ① 槽腔：金属拉丝底（横向平铺贴图，纵向拉满）
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y0, w, h); ctx.clip();
    ctx.fillStyle = "#080c13";
    ctx.fillRect(x, y0, w, h);
    ctx.drawImage(this.brusher, x, y0, w, h);

    // ② 纵向明暗：上暗下更暗，做出"越往里越深"
    const vg = ctx.createLinearGradient(0, y0, 0, y0 + h);
    vg.addColorStop(0.00, "rgba(0,0,0,0.62)");
    vg.addColorStop(0.28, "rgba(0,0,0,0.25)");
    vg.addColorStop(1.00, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vg;
    ctx.fillRect(x, y0, w, h);
    ctx.restore();

    // ③ 槽唇倒角：上沿金属高光 + 内侧暗缝
    const lip = ctx.createLinearGradient(0, pk.y0, 0, pk.y0 + C.LIP + 3);
    lip.addColorStop(0.00, "rgba(226,238,252,0.75)");
    lip.addColorStop(0.55, "rgba(140,162,190,0.42)");
    lip.addColorStop(1.00, "rgba(0,0,0,0)");
    ctx.fillStyle = lip;
    ctx.fillRect(x, pk.y0, w, C.LIP + 3);
    ctx.strokeStyle = "rgba(10,14,22,0.85)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, pk.y0 + C.LIP + 3.5); ctx.lineTo(x + w, pk.y0 + C.LIP + 3.5);
    ctx.stroke();

    // ④ 两侧金属脊：亮边 + 内暗边，做出槽体壁的厚度
    const rw = C.RIDGE;
    for (const rx of [x, x + w - rw]) {
      const inner = (rx === x);
      const rg = ctx.createLinearGradient(rx, 0, rx + rw, 0);
      if (inner) {
        rg.addColorStop(0.00, "#2a3547");
        rg.addColorStop(0.45, "#c9d6e6");
        rg.addColorStop(1.00, "#5a6a80");
      } else {
        rg.addColorStop(0.00, "#5a6a80");
        rg.addColorStop(0.55, "#c9d6e6");
        rg.addColorStop(1.00, "#2a3547");
      }
      ctx.fillStyle = rg;
      ctx.fillRect(rx, y0, rw, h);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(inner ? rx + rw : rx - 1, y0, 1, h);
    }

    // ⑤ 底部承托板：一条水平金属带，给槽体"封底"
    const bg = ctx.createLinearGradient(0, pk.y1 - 12, 0, pk.y1 - 2);
    bg.addColorStop(0.00, "rgba(120,142,170,0.30)");
    bg.addColorStop(0.45, "rgba(206,222,242,0.55)");
    bg.addColorStop(1.00, "rgba(60,74,94,0.35)");
    ctx.fillStyle = bg;
    ctx.fillRect(x + rw, pk.y1 - 12, w - rw * 2, 10);
    ctx.strokeStyle = "rgba(8,12,20,0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + rw, pk.y1 - 1.5); ctx.lineTo(x + w - rw, pk.y1 - 1.5);
    ctx.stroke();

    // ⑥ 灯带：沿用 skin-board 的贴图与呼吸节奏（P2 更亮更快）
    const pulse = 0.5 + 0.5 * Math.sin(t * (isP2 ? 2.4 : 1.2) + pk.id * 1.1);
    const spr = isP2 ? SKIN.ledP2 : SKIN.led;
    ctx.globalAlpha = (isP2 ? 0.30 : 0.16) + 0.16 * pulse;
    ctx.drawImage(spr, pk.x0 - 2, pk.y0 - 7, (pk.x1 - pk.x0) + 4, isP2 ? 34 : 26);
    ctx.globalAlpha = (isP2 ? 0.72 : 0.34) + 0.28 * pulse;
    ctx.drawImage(spr, pk.x0 + 3, pk.y0 - 3, (pk.x1 - pk.x0) - 6, isP2 ? 18 : 12);
    ctx.globalAlpha = 1;

    // ⑦ 斜向弱反光（拉丝金属的环境反射，只提亮不遮物）
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y0, w, h); ctx.clip();
    const sh = ctx.createLinearGradient(x, y0, x + w * 0.7, y0 + h);
    sh.addColorStop(0.00, "rgba(210,232,255," + (C.SHEEN * 0.9).toFixed(3) + ")");
    sh.addColorStop(0.38, "rgba(210,232,255,0.02)");
    sh.addColorStop(1.00, "rgba(210,232,255,0)");
    ctx.fillStyle = sh;
    ctx.fillRect(x, y0, w, h);
    ctx.restore();

    // ⑧ 隔板（物理边界可视化）：金属立板，带亮边与下投影
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(pk.x0 + 2, pk.y0); ctx.lineTo(pk.x0 + 2, pk.y1); ctx.stroke();
    ctx.strokeStyle = "rgba(178,198,224,0.55)";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(pk.x0, pk.y0); ctx.lineTo(pk.x0, pk.y1); ctx.stroke();
  },

  /* ---------- Z2.4 总绘制（替代 SKIN.pockets） ---------- */
  draw(ctx) {
    const t = SKIN.t;                      // 复用 skin-board 的时间轴，节奏一致
    for (const pk of BOARD.pockets) this.one(ctx, pk, t);

    // 最右侧封边立板
    const last = BOARD.pockets[BOARD.pockets.length - 1];
    ctx.strokeStyle = "rgba(0,0,0,0.6)"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(last.x1 - 2, last.y0); ctx.lineTo(last.x1 - 2, last.y1); ctx.stroke();
    ctx.strokeStyle = "rgba(178,198,224,0.55)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(last.x1, last.y0); ctx.lineTo(last.x1, last.y1); ctx.stroke();

    // 注意：此处不再绘制 P0~P4 文字标识（按需求彻底删除）。
    // P2 命中爆光仍由 skin-board 的 SKIN.pockets 逻辑保留 —— 见下方 wrap 说明。
  },

  /* ---------- Z2.5 初始化 ---------- */
  init() {
    this.buildBrush();
    this._orig = SKIN.pockets;             // 备份，供 V 键回退
    const self = this;
    this._wrapped = function (ctx) {
      self.draw(ctx);
      // 保留原实现中的 P2 命中爆光（只读 PLAY 状态，不碰计分）
      if (PLAY.lastHit && PLAY.lastHit.pocket === 2 && PLAY.hitTtl > 0) {
        const k = PLAY.hitTtl / PLAY.C.HIT_TTL;
        const s = 150 + 190 * (1 - k);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = k * 0.85;
        ctx.drawImage(SKIN.bloom, 240 - s / 2, BOARD.C.POCKET_Y - s / 2, s, s);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
    };
    SKIN.pockets = this._wrapped;
  }
};

/* ---------- Z2.6 自注册：跟随盘面皮肤开关 ---------- */
if (typeof UPGRADE === "undefined" || UPGRADE.board) POCKETS.init();
