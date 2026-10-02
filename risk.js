"use strict";
/* =========================================================
 * 第二轮增量 阶段 X1：风险落球通道 RISK
 * 职责：① 盘面左右两侧各一条风险通道，钢珠落入扣 3 颗钢珠
 *       ② 落入时触发暗红色闪烁反馈（通道内 + 全屏暗红警示）
 *       ③ 复用 audio 模块合成警示音，不新增音频资源
 * 通道改的是"落球去向"，P0~P4 袋口几何与分值一律不动。
 * 物理内核 balls.js 未修改：只在逻辑帧末尾移出落入通道的钢珠。
 * 学习演示用途，仅虚拟弹珠与虚拟积分，无任何兑换功能。
 * ========================================================= */

const RISK = {
  /* ---------- X1.1 参数 ---------- */
  C: {
    PENALTY: 2,      // 落入风险通道扣除的钢珠数
    CAP_Y: 500,      // 捕获线高度（袋口分隔板 520 之上，确保先于计分生效）
    FLASH: 1.0,      // 暗红闪烁时长（秒）
    PEN_A: 0.26,     // 全屏暗红警示最大透明度（刻意压低，不遮挡球与钉）
    // 左通道：内导轨(x=58) 与最左钉子(x=80) 之间的窄缝。
    //   active:false —— 仅保留视觉外观作对称装饰，不参与碰撞捕获。
    //   warn:false   —— 用常规中性色调，不带暗红危险色，避免误导玩家。
    //   （实测该缝钢珠球心活动范围仅 68~69.5px，正常游玩几乎不可达）
    L: { x0: 58, x1: 78, yTop: 210, active: false, warn: false },
    // 右通道：紧贴右壁的一小条，是真正生效的风险区（保留暗红警示色）
    R: { x0: 433, x1: 443, yTop: 322, active: true, warn: true }
  },

  flashT: 0, flashCh: null, hitsL: 0, hitsR: 0, lost: 0, t: 0,
  led: null, enabled: true,

  off(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  },

  /* ---------- X1.2 预渲染：通道底部灯带（危险色 / 常规色两套） ---------- */
  buildLed() {
    const W = 64, H = 18;
    const mk = (core, mid) => {
      const c = this.off(W, H), g = c.getContext("2d");
      const lg = g.createLinearGradient(0, 0, W, 0);
      lg.addColorStop(0.00, "rgba(" + mid + ",0)");
      lg.addColorStop(0.20, "rgba(" + mid + ",0.55)");
      lg.addColorStop(0.50, "rgba(" + core + ",0.95)");
      lg.addColorStop(0.80, "rgba(" + mid + ",0.55)");
      lg.addColorStop(1.00, "rgba(" + mid + ",0)");
      g.fillStyle = lg; g.fillRect(0, H * 0.25, W, H * 0.5);
      const vg = g.createLinearGradient(0, 0, 0, H);
      vg.addColorStop(0.00, "rgba(" + mid + ",0)");
      vg.addColorStop(0.50, "rgba(" + core + ",0.85)");
      vg.addColorStop(1.00, "rgba(" + mid + ",0)");
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
      return c;
    };
    this.ledWarn = mk("255,70,70", "190,30,40");     // 生效通道：暗红危险色
    this.ledIdle = mk("225,240,255", "120,170,230"); // 装饰通道：与机台常规灯色统一
  },

  /* ---------- X1.3 判定钢珠落在哪条通道（仅 active 通道参与捕获） ---------- */
  channelOf(x) {
    const C = this.C;
    if (C.L.active && x >= C.L.x0 && x <= C.L.x1) return C.L;
    if (C.R.active && x >= C.R.x0 && x <= C.R.x1) return C.R;
    return null;
  },

  /* ---------- X1.4 结算：扣球 + 闪烁 + 警示音 ---------- */
  take(ch) {
    GAME.ballsLeft = Math.max(0, GAME.ballsLeft - this.C.PENALTY);
    if (ch === this.C.L) this.hitsL++; else this.hitsR++;
    this.lost += this.C.PENALTY;
    this.flashT = this.C.FLASH;
    this.flashCh = ch;
    // 复用 audio 模块的合成基元（不新增音频资源）
    if (typeof AUDIO !== "undefined" && AUDIO.ac && AUDIO.enabled) {
      AUDIO.note(233.08, 0.00, 0.20, 0.20, "sawtooth");
      AUDIO.note(174.61, 0.10, 0.26, 0.18, "sawtooth");
      AUDIO.note(116.54, 0.22, 0.34, 0.16, "triangle");
    }
  },

  /* ---------- X1.5 逻辑帧：移出落入通道的钢珠 ----------
   * 捕获线 500 远高于袋口判定线 675，所以这里移出后一定不会再去计分。 */
  update(dt) {
    this.t += dt;
    if (this.flashT > 0) this.flashT -= dt;
    if (!this.enabled) return;
    for (let i = BALLS.list.length - 1; i >= 0; i--) {
      const b = BALLS.list[i];
      if (b.y < this.C.CAP_Y) continue;
      const ch = this.channelOf(b.x);
      if (!ch) continue;
      BALLS.list.splice(i, 1);      // 物理列表移出，不进入 P0~P4 计分
      this.take(ch);
    }
  },

  /* ---------- X1.6a 背景层：画在钉子与钢珠之下，保证不遮挡 ----------
   * 生效通道用暗红警示色；装饰通道用与机台一致的中性蓝灰色，只留外形轮廓。 */
  drawBack(ctx) {
    const C = this.C;
    for (const ch of [C.L, C.R]) {
      const w = ch.x1 - ch.x0, y0 = ch.yTop, y1 = C.CAP_Y;
      const p = ch.warn
        ? { fill: "rgba(70,10,16,0.30)", edge: "rgba(255,90,100,0.32)", mark: "rgba(255,120,120,0.42)" }
        : { fill: "rgba(34,48,74,0.20)", edge: "rgba(150,185,225,0.20)", mark: "rgba(150,185,225,0.24)" };

      // 通道底色
      ctx.fillStyle = p.fill;
      ctx.fillRect(ch.x0, y0, w, y1 - y0);
      // 两侧边线
      ctx.strokeStyle = p.edge;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ch.x0 + 0.5, y0); ctx.lineTo(ch.x0 + 0.5, y1);
      ctx.moveTo(ch.x1 - 0.5, y0); ctx.lineTo(ch.x1 - 0.5, y1);
      ctx.stroke();
      // 入口斜纹（保留外形轮廓，颜色跟随通道色调）
      ctx.strokeStyle = p.mark;
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const yy = y0 + i * 9;
        ctx.beginPath();
        ctx.moveTo(ch.x0 + 2, yy + 7); ctx.lineTo(ch.x1 - 2, yy);
        ctx.stroke();
      }
    }
  },

  /* ---------- X1.6b 前景层：捕获线灯带 + 命中闪烁，画在钢珠之上但透明度很低 ---------- */
  drawFront(ctx) {
    const C = this.C, pulse = 0.5 + 0.5 * Math.sin(this.t * 3.2);

    for (const ch of [C.L, C.R]) {
      const w = ch.x1 - ch.x0, y1 = C.CAP_Y;
      const spr = ch.warn ? this.ledWarn : this.ledIdle;

      // 捕获线灯带（呼吸）
      ctx.globalAlpha = 0.45 + 0.35 * pulse;
      ctx.drawImage(spr, ch.x0, y1 - 12, w, 18);
      ctx.globalAlpha = 1;

      // 命中时通道整体亮起（加法混合，只提亮不遮挡；仅生效通道会触发）
      if (this.flashT > 0 && this.flashCh === ch) {
        const k = this.flashT / C.FLASH;
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = k * 0.5;
        ctx.fillStyle = "#ff3a3a";
        ctx.fillRect(ch.x0, ch.yTop, w, y1 - ch.yTop);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
    }

    // 全屏暗红警示（低透明度，不遮挡盘面）
    if (this.flashT > 0) {
      const k = this.flashT / C.FLASH;
      const ease = k * k;                 // 快速衰减，避免长时间压暗画面
      ctx.globalAlpha = ease * C.PEN_A;
      ctx.fillStyle = "#6b0d12";
      ctx.fillRect(0, 0, CFG.W, CFG.H);
      ctx.globalAlpha = 1;
    }
  },

  /* ---------- X1.7 初始化 ---------- */
  init() {
    this.buildLed();
    // 背景层：插在 BOARD 之后（钉子/钢珠之下），绝不遮挡钉阵
    const back = (ctx) => this.drawBack(ctx);
    const bi = GAME.drawers.findIndex((f) => /BOARD\s*\./.test(String(f)));
    if (bi >= 0) GAME.drawers.splice(bi + 1, 0, back);
    else GAME.drawers.push(back);
    // 前景层：插在玻璃层之前（钢珠之上、玻璃之下）
    const front = (ctx) => this.drawFront(ctx);
    const gi = GAME.drawers.findIndex((f) => /GLASS\s*\./.test(String(f)));
    if (gi >= 0) GAME.drawers.splice(gi, 0, front);
    else GAME.drawers.push(front);
  }
};

/* ---------- X1.8 自注册（玩法模块，不受 V 键皮肤开关影响） ---------- */
RISK.init();
GAME.updaters.push((dt) => RISK.update(dt));
