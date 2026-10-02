"use strict";
/* =========================================================
 * 增量阶段 R2：生命系统与历史最高分 LIFE
 * 职责：① localStorage 读写历史最高分（键 play_pachinko_best）
 *       ② HUD 空余行显示「最高分」与「倍率」
 *       ③ 局终弹窗补充「本局得分 / 历史最高分 / 新纪录」
 *       ④ 重新开始：重置积分、弹珠、倍率、奖励靶冷却
 * 音频：直接复用 audio.js 已有的 over()，不新增任何音频资源
 *       （AUDIO.update 检测到 STATE.cur === "over" 会自动触发）。
 * 几何与物理：不涉及；全部仅绘制与状态读写。
 * 学习演示用途，仅虚拟弹珠与虚拟积分，无任何兑换功能。
 * ========================================================= */

const LIFE = {
  /* ---------- R2.1 参数 ---------- */
  C: {
    KEY: "play_pachinko_best",   // localStorage 键名
    ROW_Y: 23,                   // HUD 空余行的纵向偏移
    OVER_Y: 108                  // 结算面板内"最高分"行的纵向偏移
  },

  best: 0,        // 历史最高分
  isRecord: false, // 本局是否刷新了纪录

  /* ---------- R2.2 localStorage 读写（隐私模式下会抛异常，全部吞掉降级） ---------- */
  load() {
    this.best = 0;
    try {
      if (typeof localStorage === "undefined") return;
      const v = localStorage.getItem(this.C.KEY);
      const n = parseInt(v, 10);
      if (isFinite(n) && n > 0) this.best = n;
    } catch (e) { this.best = 0; }
  },
  save() {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(this.C.KEY, String(this.best));
    } catch (e) { /* 存储不可用时静默降级，不影响游戏 */ }
  },

  /* ---------- R2.3 每逻辑帧：实时刷新纪录 ---------- */
  update() {
    if (GAME.score > this.best) {
      this.best = GAME.score;
      this.isRecord = true;
      this.save();                 // 仅在真正刷新时写盘，避免频繁 IO
    }
  },

  /* ---------- R2.4 重开一局：只清空"本局是否破纪录"标记，最高分保留 ---------- */
  resetRound() { this.isRecord = false; },

  /* ---------- R2.5 HUD 附加层：画在数码管面板的空余行内 ---------- */
  drawHud(ctx) {
    const P = HUD.C.PANELS;
    if (!P || P.length < 2) return;
    if (STATE.cur === "over") return;             // 结算时由弹窗统一展示
    ctx.font = "10px monospace";
    ctx.textBaseline = "top";

    // 积分面板空余行：最高分
    const a = P[0];
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(140,180,240,0.8)";
    ctx.fillText("最高分", a.x + 11, a.y + this.C.ROW_Y);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(226,190,110,0.95)";
    ctx.fillText(String(this.best), a.x + a.w - 11, a.y + this.C.ROW_Y);

    // 剩余面板空余行：当前倍率（>1 时变金色，强化正反馈）
    const b = P[1];
    const m = (typeof REWARD !== "undefined") ? REWARD.mult : 1;
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(140,180,240,0.8)";
    ctx.fillText("倍率", b.x + 11, b.y + this.C.ROW_Y);
    ctx.textAlign = "right";
    ctx.fillStyle = m > 1 ? "#ffd27a" : "rgba(130,160,200,0.75)";
    ctx.fillText("×" + m, b.x + b.w - 11, b.y + this.C.ROW_Y);
    ctx.textAlign = "left";
  },

  /* ---------- R2.6 局终弹窗附加层：历史最高分 / 新纪录 ---------- */
  drawOver(ctx) {
    if (STATE.cur !== "over" || !STATE.snap) return;
    const px = 90, py = 230, pw = 300;      // 与 state.js 的结算面板保持一致
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "bold 13px monospace";
    if (this.isRecord) {
      ctx.fillStyle = "#ffd27a";
      ctx.fillText("★ 新纪录  " + this.best, px + pw / 2, py + this.C.OVER_Y);
    } else {
      ctx.fillStyle = "rgba(150,190,255,0.9)";
      ctx.fillText("历史最高  " + this.best, px + pw / 2, py + this.C.OVER_Y);
    }
    ctx.textAlign = "left";
  },

  /* ---------- R2.7 初始化 ---------- */
  init() {
    this.load();

    // ① HUD 附加层：插在 PLAY 绘制之后、FX 之前
    const hudDrawer = (ctx) => this.drawHud(ctx);
    const pi = GAME.drawers.findIndex((f) => /PLAY\s*\./.test(String(f)));
    if (pi >= 0) GAME.drawers.splice(pi + 1, 0, hudDrawer);
    else GAME.drawers.push(hudDrawer);

    // ② 弹窗附加层：插在 DEBUG 之前（压在结算面板之上、调试面板之下）
    const overDrawer = (ctx) => this.drawOver(ctx);
    const di = GAME.drawers.findIndex((f) => /DEBUG\s*\./.test(String(f)));
    if (di >= 0) GAME.drawers.splice(di, 0, overDrawer);
    else GAME.drawers.push(overDrawer);

    // ③ 重开一局时清空本局纪录标记
    //    PLAY.reset 已被 REWARD 包装过，这里再包一层形成链：原逻辑 → 奖励复位 → 本模块复位
    const prevReset = PLAY.reset.bind(PLAY);
    PLAY.reset = () => { prevReset(); this.resetRound(); };
  }
};

/* ---------- R2.8 自注册 ---------- */
LIFE.init();
GAME.updaters.push(() => LIFE.update());
