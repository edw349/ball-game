"use strict";
/* =========================================================
 * 阶段 4 模块：发射机构与计分 PLAY
 * 职责：① 按住空格蓄力、松开发射（力度 → 初速度）
 *       ② 弹珠入袋计分、虚拟积分累计、剩余弹珠管理
 * 学习演示用途，仅虚拟弹珠与虚拟积分，无任何兑换功能。
 * ========================================================= */

const PLAY = {
  /* ---------- 4.1 固定规则常量 ---------- */
  C: {
    MAX_BALLS: 50,       // 每局虚拟弹珠数
    CHARGE_TIME: 1.2,    // 蓄满力度所需秒数
    MIN_V: 980,          // 最低初速度（刚好能越过顶部通道所需约 930）
    MAX_V: 1260,         // 最高初速度（不超过 BALLS.C.MAXV 的 1300）
    LANE_X: 46,          // 发射道中线
    LANE_Y: 660,         // 发射出球点
    HIT_TTL: 1.2         // 入袋提示停留秒数
  },

  /* 袋号 → 虚拟积分：中央袋 P2 最高 */
  POCKET_SCORE: [10, 30, 100, 30, 10],

  /* ---------- 4.2 局内状态 ---------- */
  charge: 0,        // 当前力度 0~1
  charging: false,  // 是否正在蓄力
  hitTtl: 0,        // 入袋提示剩余时间
  lastHit: null,    // { pocket, score }
  stats: [0, 0, 0, 0, 0], // 各袋命中次数（供阶段 5 展示）

  /* ---------- 4.3 初始化：写入 GAME 预留字段 ---------- */
  init() {
    this.reset();
    BALLS.onEnterPocket = (b, id) => this.onPocket(b, id);
    this.bindInput();
  },

  /* ---------- 4.3b 重开一局：清空全部局内状态（阶段 5 调用） ---------- */
  reset() {
    GAME.score = 0;
    GAME.ballsLeft = this.C.MAX_BALLS;
    GAME.over = false;
    BALLS.list.length = 0;          // 回收盘面上所有弹珠
    this.charge = 0;
    this.charging = false;
    this.hitTtl = 0;
    this.lastHit = null;
    this.stats = [0, 0, 0, 0, 0];
  },

  /* ---------- 4.4 输入：keydown 起蓄力，keyup 发射 ---------- */
  bindInput() {
    window.addEventListener("keydown", (e) => {
      if (e.code !== "Space") return;
      e.preventDefault();
      if (e.repeat) return;              // 长按不重复触发
      if (GAME.over) return;             // 结算面板打开时屏蔽发射
      if (GAME.ballsLeft <= 0) return;   // 无弹珠时不可蓄力
      if (this.charging) return;
      this.charging = true;
      this.charge = 0;
    });
    window.addEventListener("keyup", (e) => {
      if (e.code !== "Space" || !this.charging) return;
      this.fire();
    });
    // 失焦兜底：避免切窗口时按键状态卡死
    window.addEventListener("blur", () => { this.charging = false; this.charge = 0; });
  },

  /* ---------- 4.5 发射：力度线性映射初速度 ---------- */
  fire() {
    const C = this.C;
    this.charging = false;
    const p = this.charge;
    this.charge = 0;
    if (GAME.ballsLeft <= 0) return;
    const v = C.MIN_V + p * (C.MAX_V - C.MIN_V);
    GAME.ballsLeft--;
    BALLS.spawn(C.LANE_X, C.LANE_Y, 0, -v); // 垂直上行，负号为向上
  },

  /* ---------- 4.6 入袋结算 ---------- */
  onPocket(b, id) {
    if (id < 0) return;                       // 异常袋号不计分
    const s = this.POCKET_SCORE[id] || 0;
    GAME.score += s;
    this.stats[id]++;
    this.lastHit = { pocket: id, score: s };
    this.hitTtl = this.C.HIT_TTL;
  },

  /* ---------- 4.7 每逻辑帧 ---------- */
  update(dt) {
    if (this.charging) {
      this.charge += dt / this.C.CHARGE_TIME;
      if (this.charge >= 1) { this.charge = 1; this.charging = false; this.fire(); } // 蓄满自动发射
    }
    if (this.hitTtl > 0) this.hitTtl -= dt;
  },

  /* ---------- 4.8 渲染：顶部状态条 + 力度条 + 入袋提示 ---------- */
  draw(ctx) {
    // 顶部闲置区（y 0~84）用作状态面板
    ctx.fillStyle = "#0a0f1c";
    ctx.fillRect(0, 0, CFG.W, 84);
    ctx.textBaseline = "top";

    ctx.fillStyle = "#8fb6ff"; ctx.font = "bold 18px monospace"; ctx.textAlign = "left";
    ctx.fillText("积分 " + GAME.score, 28, 14);
    ctx.textAlign = "right";
    ctx.fillText("剩余 " + GAME.ballsLeft, 452, 14);

    // 力度条
    const bx = 28, by = 46, bw = 424, bh = 12;
    ctx.strokeStyle = "#3a5580"; ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);
    const p = this.charging ? this.charge : 0;
    ctx.fillStyle = p > 0.8 ? "#ff8a5c" : "#4fd1c5";
    ctx.fillRect(bx + 1, by + 1, (bw - 2) * p, bh - 2);

    ctx.fillStyle = "#5c7bb0"; ctx.font = "11px monospace"; ctx.textAlign = "left";
    ctx.fillText(p > 0 ? "力度 " + (p * 100).toFixed(0) + "%  松开空格发射"
                       : "按住空格蓄力 / 松开发射", bx, by + bh + 4);

    // 入袋提示
    if (this.hitTtl > 0 && this.lastHit) {
      const a = Math.min(1, this.hitTtl / 0.4);   // 末段淡出
      ctx.globalAlpha = a;
      ctx.textAlign = "center";
      ctx.fillStyle = "#ffe6a3"; ctx.font = "bold 20px monospace";
      ctx.fillText("P" + this.lastHit.pocket + "  +" + this.lastHit.score, CFG.W / 2, 320);
      ctx.globalAlpha = 1;
    }
  }
};

/* ---------- 4.9 自注册 ---------- */
PLAY.init();
GAME.updaters.push((dt) => PLAY.update(dt));
GAME.drawers.push((ctx) => PLAY.draw(ctx));
