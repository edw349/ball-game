"use strict";
/* =========================================================
 * 阶段 5 模块：局状态机与结算面板 STATE
 * 职责：四态切换（待机 / 蓄力 / 有球在盘 / 局终）、
 *       局终结算快照、再来一局入口（鼠标点击 或 回车）。
 * 学习演示用途，仅虚拟弹珠与虚拟积分，无任何兑换功能。
 * ========================================================= */

const STATE = {
  /* ---------- 5.1 状态定义 ---------- */
  // idle     待机：无球在盘、未蓄力
  // charging 蓄力中
  // playing  有球在盘（禁止重复蓄力的判断依据）
  // over     局终：50 颗打完且盘面无球
  cur: "idle",
  snap: null,      // 局终快照 {score, stats, balls, maxPocket}

  /* 结算面板按钮矩形（逻辑坐标），绘制与点击命中都用这一份数据 */
  btn: { x: 150, y: 440, w: 180, h: 44 },

  /* ---------- 5.2 状态推导：由数据算出状态，不手工置位 ---------- */
  derive() {
    if (this.cur === "over") return "over";          // 结算后只能手动重开
    const onBoard = BALLS.list.length > 0;
    if (onBoard) return "playing";
    if (PLAY.charging) return "charging";
    if (GAME.ballsLeft <= 0) return "over";          // 球打完且盘面清空 → 局终
    return "idle";
  },

  /* ---------- 5.3 进入新状态时的副作用 ---------- */
  onEnter(next) {
    if (next === "over") {
      GAME.over = true;
      PLAY.charging = false;      // 丢弃未完成的蓄力
      PLAY.charge = 0;
      const st = PLAY.stats;
      let best = 0;
      for (let i = 1; i < st.length; i++) if (st[i] > st[best]) best = i;
      this.snap = {
        score: GAME.score,
        stats: st.slice(),
        balls: PLAY.C.MAX_BALLS,
        maxPocket: best
      };
    }
  },

  /* ---------- 5.4 每逻辑帧 ---------- */
  update() {
    const next = this.derive();
    if (next !== this.cur) {
      this.cur = next;
      this.onEnter(next);
    }
  },

  /* ---------- 5.5 重开：统一的复位入口 ---------- */
  restart() {
    PLAY.reset();          // 内含 GAME.over = false
    this.cur = "idle";
    this.snap = null;
  },

  /* ---------- 5.6 输入：面板按钮点击 + 回车重开 ---------- */
  toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (CFG.W / r.width),
      y: (e.clientY - r.top) * (CFG.H / r.height)
    };
  },

  bindInput() {
    canvas.addEventListener("pointerdown", (e) => {
      if (this.cur !== "over") return;
      const p = this.toLogical(e);
      const b = this.btn;
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) this.restart();
    });
    window.addEventListener("keydown", (e) => {
      if (e.code === "Enter" && this.cur === "over") { e.preventDefault(); this.restart(); }
    });
  },

  /* ---------- 5.7 渲染：局终结算面板 ---------- */
  draw(ctx) {
    if (this.cur !== "over" || !this.snap) return;
    const s = this.snap;

    ctx.fillStyle = "rgba(4,8,16,0.72)";     // 压暗盘面
    ctx.fillRect(0, 0, CFG.W, CFG.H);

    const px = 90, py = 230, pw = 300, ph = 270;
    ctx.fillStyle = "#141d31"; ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = "#4fd1c5"; ctx.lineWidth = 2; ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);

    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillStyle = "#8fb6ff"; ctx.font = "bold 20px monospace";
    ctx.fillText("本局结束", px + pw / 2, py + 18);

    ctx.fillStyle = "#ffe6a3"; ctx.font = "bold 34px monospace";
    ctx.fillText(String(s.score), px + pw / 2, py + 52);
    ctx.fillStyle = "#5c7bb0"; ctx.font = "12px monospace";
    ctx.fillText("总虚拟积分  /  " + s.balls + " 颗弹珠", px + pw / 2, py + 94);

    // 各袋命中分布
    ctx.font = "14px monospace"; ctx.textAlign = "left";
    const names = ["P0", "P1", "P2", "P3", "P4"];
    for (let i = 0; i < 5; i++) {
      const y = py + 126 + i * 20;
      const isBest = (i === s.maxPocket && s.stats[i] > 0);
      ctx.fillStyle = isBest ? "#4fd1c5" : "#7f9dd0";
      ctx.fillText(names[i] + "  " + PLAY.POCKET_SCORE[i] + " 分", px + 34, y);
      ctx.textAlign = "right";
      ctx.fillText(s.stats[i] + " 颗", px + pw - 34, y);
      ctx.textAlign = "left";
    }

    // 按钮
    const b = this.btn;
    ctx.fillStyle = "#1d3b52"; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = "#4fd1c5"; ctx.lineWidth = 2; ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    ctx.fillStyle = "#cfe8ff"; ctx.font = "bold 16px monospace"; ctx.textAlign = "center";
    ctx.fillText("再来一局 (Enter)", b.x + b.w / 2, b.y + 14);
  }
};

/* ---------- 5.8 自注册：逻辑层最后注册，保证在 PLAY 之后判定 ---------- */
STATE.bindInput();
GAME.updaters.push(() => STATE.update());
GAME.drawers.push((ctx) => STATE.draw(ctx));
