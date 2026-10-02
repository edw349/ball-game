"use strict";
/* =========================================================
 * 阶段 6 模块（第 1 块）：入袋特效 FX
 * 职责：① 袋口闪光  ② 入袋粒子迸发
 * 设计：粒子用「预分配对象池 + 环形取用」，运行期零 new / 零 push，
 *       避免 GC 抖动；方向与速度取自固定表，不含随机数。
 * 学习演示用途，仅虚拟弹珠与虚拟积分，无任何兑换功能。
 * ========================================================= */

const FX = {
  /* ---------- 6.1 固定参数 ---------- */
  C: {
    MAX: 144,        // 粒子池容量（12 个 × 12 次爆发，够用且不会溢出）
    N: 12,           // 单次迸发粒子数
    LIFE: 0.55,      // 粒子寿命（秒）
    GRAV: 320,       // 粒子自身重力（比弹珠轻，飘一点更好看）
    FLASH_TTL: 0.35, // 袋口闪光寿命
    A0: -160,        // 扇面起始角（度，向上为主）
    A1: -20          // 扇面结束角
  },

  /* 固定速度表：下标 k 对应第 k 个粒子，无随机 */
  SPEEDS: [130, 82, 112, 70, 124, 92, 118, 76, 128, 86, 108, 96],

  parts: [],   // 对象池，初始化时一次性建好
  head: 0,     // 环形写指针
  flash: null, // { x0, x1, t, m }

  /* ---------- 6.2 初始化：建池 + 用装饰器挂入袋回调 ---------- */
  init() {
    for (let i = 0; i < this.C.MAX; i++) {
      this.parts.push({ a: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, m: 1 });
    }
    // 不修改 PLAY，直接包一层：保留原有计分，再叠加特效
    const prev = BALLS.onEnterPocket;
    BALLS.onEnterPocket = (b, id) => {
      if (prev) prev(b, id);
      this.burst(b, id);
    };
  },

  /* ---------- 6.3 迸发：入袋点触发 ---------- */
  burst(b, id) {
    const pk = BOARD.pockets[id];
    if (!pk) return;
    this.flash = { x0: pk.x0, x1: pk.x1, t: this.C.FLASH_TTL, m: this.C.FLASH_TTL };

    const C = this.C;
    for (let k = 0; k < C.N; k++) {
      const ang = (C.A0 + (C.A1 - C.A0) * k / (C.N - 1)) * Math.PI / 180;
      const sp = this.SPEEDS[k % this.SPEEDS.length];
      const p = this.parts[this.head];
      this.head = (this.head + 1) % C.MAX;  // 环形推进，最旧的粒子被自动复用
      p.a = true;
      p.x = b.x; p.y = b.y;
      p.vx = Math.cos(ang) * sp;
      p.vy = Math.sin(ang) * sp;
      p.t = C.LIFE; p.m = C.LIFE;
    }
  },

  /* ---------- 6.4 每逻辑帧：与物理同用固定 dt ---------- */
  update(dt) {
    for (const p of this.parts) {
      if (!p.a) continue;
      p.vy += this.C.GRAV * dt;   // 半隐式欧拉，与弹珠一致
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.t -= dt;
      if (p.t <= 0) p.a = false;  // 归还池，不做数组删除
    }
    if (this.flash) {
      this.flash.t -= dt;
      if (this.flash.t <= 0) this.flash = null;
    }
  },

  /* ---------- 6.5 渲染：闪光在下、粒子在上 ---------- */
  draw(ctx) {
    const py = BOARD.C.POCKET_Y;

    if (this.flash) {
      const f = this.flash;
      const a = f.t / f.m;                 // 线性淡出
      ctx.globalAlpha = a * 0.5;
      ctx.fillStyle = "#ffe6a3";
      ctx.fillRect(f.x0 + 2, py, (f.x1 - f.x0) - 4, 44);
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = "#ffd27a";
      ctx.lineWidth = 2;
      ctx.strokeRect(f.x0 + 2.5, py + 0.5, (f.x1 - f.x0) - 5, 43);
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = "#ffd27a";
    for (const p of this.parts) {
      if (!p.a) continue;
      ctx.globalAlpha = p.t / p.m;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
};

/* ---------- 6.6 自注册：放在 STATE 之前加载，保证粒子在结算遮罩之下 ---------- */
FX.init();
GAME.updaters.push((dt) => FX.update(dt));
GAME.drawers.push((ctx) => FX.draw(ctx));
