"use strict";
/* =========================================================
 * 阶段 6 模块（第 2 块）：参数调试面板 DEBUG
 * 职责：按 P 键显示/隐藏，只读列出生效参数与实时运行量。
 * 设计：① 每 REFRESH 秒重排一次文本，不每帧拼接字符串；
 *       ② 中文标签按「全角占 2 列」计算内边距，等宽字体下严格对齐；
 *       ③ 只读展示，不含输入框，避免引入表单焦点副作用。
 * 学习演示用途，仅虚拟弹珠与虚拟积分，无任何兑换功能。
 * ========================================================= */

const DEBUG = {
  /* ---------- 6.7 面板布局常量 ---------- */
  C: { REFRESH: 0.5, X: 58, Y: 104, W: 364, LH: 15 },

  show: false,
  t: 0,        // 刷新计时器
  lines: [],   // 缓存的文本行，仅在刷新时重建

  /* ---------- 6.8 全角感知对齐：汉字按 2 列宽计 ---------- */
  pad(k, n) {
    let w = 0;
    for (const ch of k) w += /[\u4e00-\u9fa5\uff00-\uffef]/.test(ch) ? 2 : 1;
    return k + " ".repeat(Math.max(0, n - w));
  },
  row(k, v) { return this.pad(k, 12) + v; },

  /* ---------- 6.9 重排文本：全部取当前生效值 ---------- */
  refresh() {
    const B = BALLS.C, P = PLAY.C, D = BOARD.C;
    this.lines = [
      "-- BOARD 盘面 --",
      this.row("DX / ROWS", D.DX + " / " + D.ROWS + "   Y0 " + D.Y0),
      this.row("PEGR", D.PEGR + "   钉数 " + BOARD.pegs.length),
      "-- BALLS 物理 --",
      this.row("R / G", B.R + " / " + B.G),
      this.row("E_PEG", B.E_PEG + "   E_RAIL " + B.E_RAIL),
      this.row("E_WALL", B.E_WALL + "   ROLL_K " + B.ROLL_K),
      this.row("MAXV", B.MAXV + "   子步位移 " + B.SUB_DISP),
      this.row("盘面球数", String(BALLS.list.length)),
      "-- PLAY 玩法 --",
      this.row("MIN/MAX V", P.MIN_V + " / " + P.MAX_V),
      this.row("CHARGE", P.CHARGE_TIME + "s   力度 " + (PLAY.charge * 100).toFixed(0) + "%"),
      this.row("MAX_BALLS", P.MAX_BALLS + "   剩余 " + GAME.ballsLeft),
      this.row("虚拟积分", String(GAME.score)),
      this.row("各袋命中", PLAY.stats.join(" / ")),
      "-- STATE 状态 --",
      this.row("状态", STATE.cur + "   FPS " + GAME.fps.toFixed(0)),
      this.row("累计帧", String(GAME.frame))
    ];
  },

  /* ---------- 6.10 输入：P 键切换 ---------- */
  bindInput() {
    window.addEventListener("keydown", (e) => {
      if (e.code !== "KeyP") return;
      e.preventDefault();
      this.show = !this.show;
      if (this.show) this.refresh();  // 打开即刷新，避免首帧空白
    });
  },

  /* ---------- 6.11 每逻辑帧 ---------- */
  update(dt) {
    if (!this.show) return;
    this.t += dt;
    if (this.t >= this.C.REFRESH) { this.t = 0; this.refresh(); }
  },

  /* ---------- 6.12 渲染：最后注册，盖在所有图层之上 ---------- */
  draw(ctx) {
    if (!this.show) return;
    const C = this.C;
    const h = this.lines.length * C.LH + 30;

    ctx.fillStyle = "rgba(6,10,20,0.90)";
    ctx.fillRect(C.X, C.Y, C.W, h);
    ctx.strokeStyle = "#4fd1c5"; ctx.lineWidth = 2;
    ctx.strokeRect(C.X + 1, C.Y + 1, C.W - 2, h - 2);

    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillStyle = "#4fd1c5"; ctx.font = "bold 13px monospace";
    ctx.fillText("参数调试面板   (P 隐藏)", C.X + 12, C.Y + 8);

    ctx.font = "12px monospace";
    for (let i = 0; i < this.lines.length; i++) {
      const s = this.lines[i];
      // 分组标题（以 -- 开头）用暖色，其余用冷色
      ctx.fillStyle = s.startsWith("--") ? "#ffd27a" : "#9fd0ff";
      ctx.fillText(s, C.X + 12, C.Y + 28 + i * C.LH);
    }
  }
};

/* ---------- 6.13 自注册：最后加载，保证面板在最上层 ---------- */
DEBUG.bindInput();
GAME.updaters.push((dt) => DEBUG.update(dt));
GAME.drawers.push((ctx) => DEBUG.draw(ctx));
