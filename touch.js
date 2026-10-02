"use strict";
/* =========================================================
 * 增量阶段 T1：触屏交互 TOUCH
 * 职责：① 手指按下屏幕任意位置开始蓄力，抬起即发射钢珠 ——
 *          完全复刻键盘空格那套逻辑（同一套 PLAY.charging / PLAY.charge / PLAY.fire）
 *       ② 欢迎页点击任意位置进入游戏
 *       ③ 结算页点击任意位置重新开局（不必依赖回车）
 * 约束：只做上面两套触屏逻辑；B 切换背景 / M 静音 / P 调试面板 / V 皮肤
 *       维持仅键盘可用，不做虚拟按键。
 * 零侵入：不改 game.js / balls.js / state.js；
 *         键盘监听全部保留，电脑端操作一字未变。
 * 学习演示用途，仅虚拟弹珠与虚拟积分，无任何兑换功能。
 * ========================================================= */

const TOUCH = {
  /* ---------- T1.1 参数 ---------- */
  C: {
    SUPPRESS: 0.40,   // 开始/重开后短暂屏蔽，避免"点击进入"的同一次触摸顺手开始蓄力
    MOVE_TOL: 28      // 手指移动超过该距离视为滑动手势，抬起时不发射（防误触）
  },

  suppress: 0,        // 屏蔽计时（秒）
  charging: false,    // 是否由触屏发起了本次蓄力
  startX: 0, startY: 0,
  lastPaused: true, lastCur: "idle",

  /* ---------- T1.2 蓄力开始：复刻 PLAY 的 keydown 判定 ---------- */
  chargeStart(x, y) {
    if (this.suppress > 0) return;
    if (GAME.paused) return;             // 欢迎页 / 暂停中不可蓄力
    if (GAME.over) return;               // 结算面板打开时屏蔽发射
    if (GAME.ballsLeft <= 0) return;     // 无弹珠
    if (PLAY.charging) return;           // 已在蓄力（键盘或触屏）
    this.startX = x; this.startY = y;
    this.charging = true;
    PLAY.charging = true;                // 复用同一套状态，蓄力条自然变化
    PLAY.charge = 0;
  },

  /* ---------- T1.3 松手发射：复刻 PLAY 的 keyup ---------- */
  chargeEnd(x, y, isCancel) {
    if (!this.charging) return;
    this.charging = false;
    if (!PLAY.charging) return;          // 键盘那边已处理
    if (isCancel) {                      // 手势被系统取消 → 丢弃蓄力，不发射
      PLAY.charging = false;
      PLAY.charge = 0;
      return;
    }
    // 滑动手势（滚页/误触）不发射
    if (Math.hypot(x - this.startX, y - this.startY) > this.C.MOVE_TOL) {
      PLAY.charging = false;
      PLAY.charge = 0;
      return;
    }
    PLAY.fire();                         // 与空格松开完全同一条路径
  },

  /* ---------- T1.4 逻辑帧：状态跃迁屏蔽 ---------- */
  update(dt) {
    if (this.suppress > 0) this.suppress -= dt;
    // ① 欢迎页 → 游戏：paused 由 true 变 false
    if (this.lastPaused && !GAME.paused) this.suppress = this.C.SUPPRESS;
    this.lastPaused = GAME.paused;
    // ② 结算 → 重开：cur 由 over 变为其它
    if (this.lastCur === "over" && STATE.cur !== "over") this.suppress = this.C.SUPPRESS;
    this.lastCur = STATE.cur;
  },

  /* ---------- T1.5 初始化 ---------- */
  init() {
    const cv = canvas;

    // ① 触屏蓄力 / 发射（touch-action:none 已在 CSS 中设定，这里再拦一次默认行为）
    cv.addEventListener("touchstart", (e) => {
      e.preventDefault();
      if (e.touches.length > 1) return;              // 多指忽略
      const t = e.touches[0];
      this.chargeStart(t.clientX, t.clientY);
    }, { passive: false });

    cv.addEventListener("touchend", (e) => {
      e.preventDefault();
      // touchend 的 touches 已为空，改用 changedTouches 取松手位置
      const t = e.changedTouches && e.changedTouches[0];
      this.chargeEnd(t ? t.clientX : this.startX, t ? t.clientY : this.startY, false);
    }, { passive: false });

    cv.addEventListener("touchcancel", () => {
      this.chargeEnd(0, 0, true);
    }, { passive: false });

    // ② 欢迎页 / 结算页点击（pointerdown 同时覆盖鼠标与触屏）
    cv.addEventListener("pointerdown", () => {
      if (typeof WELCOME !== "undefined" && WELCOME.active) {
        WELCOME.start();                             // 点击屏幕任意位置进入游戏
      } else if (STATE.cur === "over") {
        STATE.restart();                             // 点击屏幕任意位置重新开局
      }
    });

    this.lastPaused = GAME.paused;
    this.lastCur = STATE.cur;
  }
};

/* ---------- T1.6 自注册 ---------- */
TOUCH.init();
GAME.updaters.push((dt) => TOUCH.update(dt));
