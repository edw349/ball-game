"use strict";
/* =========================================================
 * 增量阶段 Y4：连击文字提示 COMBO
 * 职责：短时间连续命中高分槽时，在盘面上方弹出连击计数，
 *       带弹入缩放、随时间淡出，并显示连击剩余时间进度条。
 * 判定：复用 PLAY.POCKET_SCORE 的公开分值表，分值 ≥ COMBO.C.HIGH 视为高分槽；
 *       命中低分槽立即断连；两次高分槽间隔超过 TTL 也断连。
 * 零侵入：只包装 BALLS.onEnterPocket 与 PLAY.reset，不改任何既有文件。
 * 与既有 "P2 +100" 分数弹出动画并存，位置错开不重叠。
 * 学习演示用途，仅虚拟弹珠与虚拟积分，无任何兑换功能。
 * ========================================================= */

const COMBO = {
  /* ---------- Y4.1 参数 ---------- */
  C: {
    HIGH: 30,        // 高分槽判定阈值（P1=30 / P2=100 / P3=30）
    TTL: 2.6,        // 连击保持时间（秒），超时断连
    Y: 248,          // 文字纵向位置（在既有分数弹出 y=320 之上，互不遮挡）
    POP: 0.26,       // 弹入缩放动画时长
    FADE: 0.55       // 末段淡出时长
  },

  n: 0,      // 当前连击数
  ttl: 0,    // 连击剩余时间
  pop: 0,    // 弹入动画剩余时间
  best: 0,   // 本局最高连击（供调试面板查看）

  /* ---------- Y4.2 入袋判定 ---------- */
  onPocket(id) {
    const sc = (PLAY.POCKET_SCORE && PLAY.POCKET_SCORE[id]) || 0;
    if (sc >= this.C.HIGH) {
      // 上一次高分槽还在有效期内 → 连击累加，否则从 1 重新起算
      this.n = (this.ttl > 0) ? this.n + 1 : 1;
      this.ttl = this.C.TTL;
      this.pop = this.C.POP;
      if (this.n > this.best) this.best = this.n;
    } else {
      this.n = 0;       // 落入低分槽 → 立即断连
      this.ttl = 0;
    }
  },

  /* ---------- Y4.3 逻辑帧 ---------- */
  update(dt) {
    if (this.ttl > 0) {
      this.ttl -= dt;
      if (this.ttl <= 0) { this.ttl = 0; this.n = 0; }   // 超时断连
    }
    if (this.pop > 0) this.pop = Math.max(0, this.pop - dt);
  },

  /* ---------- Y4.4 重开一局复位 ---------- */
  resetRound() { this.n = 0; this.ttl = 0; this.pop = 0; },

  /* ---------- Y4.5 绘制 ---------- */
  draw(ctx) {
    if (this.n < 2 || this.ttl <= 0) return;      // 单次命中不显示连击
    const C = this.C;

    // 弹入缩放：命中瞬间放大到 1.5 倍再回弹；末段整体淡出
    const k = this.pop / C.POP;                    // 1 → 0
    const scale = 1 + 0.5 * k * k;
    const alpha = Math.min(1, this.ttl / C.FADE);

    // 连击越高颜色越"烫"：青 → 金 → 品红
    const col = this.n >= 5 ? "#ff6ad5" : (this.n >= 3 ? "#ffd76a" : "#8ff4ff");

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(240, C.Y);
    ctx.scale(scale, scale);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 30px monospace";
    ctx.shadowColor = col;
    ctx.shadowBlur = 16;
    ctx.fillStyle = col;
    ctx.fillText(this.n + " COMBO", 0, 0);
    ctx.shadowBlur = 0;

    // 副标题
    ctx.font = "11px monospace";
    ctx.fillStyle = "rgba(200,225,255,0.85)";
    ctx.fillText("连续命中高分槽", 0, 25);
    ctx.restore();

    // 连击剩余时间进度条（直观表达"短时间"这一约束）
    const bw = 130, bh = 4, bx = 240 - bw / 2, by = C.Y + 40;
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = "rgba(18,28,46,0.85)";
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = col;
    ctx.fillRect(bx, by, bw * (this.ttl / C.TTL), bh);
    ctx.globalAlpha = 1;
  },

  /* ---------- Y4.6 初始化 ---------- */
  init() {
    // 再包一层入袋回调：保留 PLAY 计分、FX 粒子、REWARD 倍率、FX2 闪光
    const prev = BALLS.onEnterPocket;
    BALLS.onEnterPocket = (b, id) => {
      if (prev) prev(b, id);
      this.onPocket(id);
    };

    // 重开一局时清空连击（PLAY.reset 已被 REWARD / LIFE 依次包装，这里续到链尾）
    const prevReset = PLAY.reset.bind(PLAY);
    PLAY.reset = () => { prevReset(); this.resetRound(); };

    // 插在玻璃层之前 → 连击文字在钢珠之上、玻璃之下
    const drawer = (ctx) => this.draw(ctx);
    const gi = GAME.drawers.findIndex((f) => /GLASS\s*\./.test(String(f)));
    if (gi >= 0) GAME.drawers.splice(gi, 0, drawer);
    else GAME.drawers.push(drawer);
  }
};

/* ---------- Y4.7 自注册（玩法层，不受 V 键皮肤开关影响） ---------- */
COMBO.init();
GAME.updaters.push((dt) => COMBO.update(dt));
