"use strict";
/* =========================================================
 * 增量阶段 X2：特效增强 FX2（全部 Canvas2D + lighter 加法混合）
 * 职责：① 奖励靶命中 → 彩色粒子爆炸
 *       ② 倍率提升 → 机台外围灯带呼吸闪烁加速（×1/×2/×3 三档色温）
 *       ③ P2 高分槽 → 金色闪光；P0 低分槽 → 暗红警示闪光
 * 零侵入：包装 REWARD.hit 与 BALLS.onEnterPocket，不改任何既有文件。
 * 性能：粒子预分配对象池（环形取用，运行期零分配）；
 *       灯带与爆光全部离屏预渲染，每帧仅若干次 drawImage。
 * 透明度全部压低，保证不遮挡看清钢珠与钉子。
 * 学习演示用途，仅虚拟弹珠与虚拟积分，无任何兑换功能。
 * ========================================================= */

const FX2 = {
  /* ---------- X2.1 参数 ---------- */
  C: {
    MAX: 288,        // 粒子池容量
    N: 18,           // 单次奖励爆炸粒子数
    LIFE: 0.62,      // 粒子寿命
    GRAV: 300,       // 粒子重力
    DOT: 8,          // 粒子贴图尺寸
    A0: -170, A1: -10, // 向上扇形（度）
    EDGE: 11,        // 外围灯带宽度（对齐 skin-bg 的镀铬边条）
    SURGE: 0.9,      // 倍率提升时的灯带冲刺衰减时长
    FLASH_P2: 0.55,  // P2 金色闪光时长
    FLASH_P0: 0.50,  // P0 暗红警示时长
    TINT_P2: 0.16,   // 全屏色调上限（低透明度，不遮挡球路）
    TINT_P0: 0.18
  },

  /* 确定性颜色/速度表（无随机数） */
  COLORS: ["#ffd76a", "#5fe6ff", "#ff6ad5", "#7dff9b"],
  SPEEDS: [200, 120, 175, 95, 230, 140, 165, 110, 210, 130, 185, 100, 220, 150, 160, 125, 195, 145],

  parts: [], head: 0, dot: null, bloomG: null, bloomR: null,
  edge: { c: null, a: null, g: null },   // 青 / 琥珀 / 金 三档灯带
  edgeH: { c: null, a: null, g: null },  // 对应的横条
  t: 0, mult: 1, surge: 0, flash: null,

  off(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  },

  /* ---------- X2.2 预渲染：彩色粒子点 / 爆光 / 灯带 ---------- */
  buildSprites() {
    const S = this.C.DOT;
    // 粒子：按调色板各烘焙一张彩色软点（drawImage 无法被 fillStyle 着色）
    this.dots = this.COLORS.map((col) => {
      const d = this.off(S, S), dg = d.getContext("2d");
      const rg = dg.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
      rg.addColorStop(0.00, "rgba(255,255,255,1)");
      rg.addColorStop(0.25, col);
      rg.addColorStop(1.00, "rgba(255,255,255,0)");
      dg.fillStyle = rg; dg.fillRect(0, 0, S, S);
      return d;
    });
    this.dot = this.dots[0];

    // 入袋爆光：金 / 暗红两种
    const mk = (core, mid, out) => {
      const T = 128, c = this.off(T, T), g = c.getContext("2d");
      const r = g.createRadialGradient(T / 2, T / 2, 0, T / 2, T / 2, T / 2);
      r.addColorStop(0.00, core); r.addColorStop(0.30, mid); r.addColorStop(1.00, out);
      g.fillStyle = r; g.fillRect(0, 0, T, T);
      return c;
    };
    this.bloomG = mk("rgba(255,248,210,0.95)", "rgba(255,200,110,0.5)", "rgba(255,160,60,0)");
    this.bloomR = mk("rgba(255,190,190,0.85)", "rgba(190,40,50,0.45)", "rgba(140,20,30,0)");

    // 外围灯带：竖直条（左右）与水平条（底部），三档色温
    const mkEdge = (rgb, vertical) => {
      const W = vertical ? this.C.EDGE : 64, H = vertical ? 64 : this.C.EDGE;
      const c = this.off(W, H), g = c.getContext("2d");
      const lg = vertical
        ? g.createLinearGradient(0, 0, W, 0)
        : g.createLinearGradient(0, 0, 0, H);
      lg.addColorStop(0.00, "rgba(" + rgb + ",0)");
      lg.addColorStop(0.50, "rgba(" + rgb + ",0.9)");
      lg.addColorStop(1.00, "rgba(" + rgb + ",0)");
      g.fillStyle = lg; g.fillRect(0, 0, W, H);
      return c;
    };
    const tones = { c: "70,230,220", a: "255,190,80", g: "255,225,140" };
    for (const k in tones) {
      this.edge[k] = mkEdge(tones[k], true);
      this.edgeH[k] = mkEdge(tones[k], false);
    }
  },

  /* ---------- X2.3 奖励靶命中：彩色粒子爆炸 ---------- */
  burst(s) {
    const C = this.C;
    for (let k = 0; k < C.N; k++) {
      const ang = (C.A0 + (C.A1 - C.A0) * k / (C.N - 1)) * Math.PI / 180;
      const sp = this.SPEEDS[k % this.SPEEDS.length];
      const p = this.parts[this.head];
      this.head = (this.head + 1) % C.MAX;    // 环形推进，最旧的自动复用
      p.a = true;
      p.x = s.x; p.y = s.y;
      p.vx = Math.cos(ang) * sp;
      p.vy = Math.sin(ang) * sp;
      p.t = C.LIFE; p.m = C.LIFE;
      p.spr = this.dots[k % this.dots.length];
    }
  },

  /* ---------- X2.4 入袋闪光：P2 金 / P0 暗红 ---------- */
  pocket(id) {
    const C = this.C;
    if (id === 2) {
      this.flash = { t: C.FLASH_P2, m: C.FLASH_P2, cx: 240, cy: 520, tint: C.TINT_P2, col: "#ffd76a", spr: this.bloomG };
    } else if (id === 0) {
      this.flash = { t: C.FLASH_P0, m: C.FLASH_P0, cx: 65, cy: 520, tint: C.TINT_P0, col: "#8c1a24", spr: this.bloomR };
    }
  },

  /* ---------- X2.5 逻辑帧 ---------- */
  update(dt) {
    this.t += dt;

    // 粒子积分（与弹珠一致的半隐式欧拉）
    for (const p of this.parts) {
      if (!p.a) continue;
      p.vy += this.C.GRAV * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.t -= dt;
      if (p.t <= 0) p.a = false;              // 归还池子，不做数组删除
    }

    // 倍率提升 → 灯带冲刺
    if (typeof REWARD !== "undefined") {
      if (REWARD.mult > this.mult) this.surge = this.C.SURGE;
      this.mult = REWARD.mult;
    }
    if (this.surge > 0) this.surge -= dt;

    if (this.flash) {
      this.flash.t -= dt;
      if (this.flash.t <= 0) this.flash = null;
    }
  },

  /* ---------- X2.6 绘制 ---------- */
  draw(ctx) {
    const C = this.C;

    // ① 机台外围灯带：呼吸速度随倍率加快，倍率提升时额外冲刺
    //    档位：×1 青 → ×2 琥珀 → ×3 金
    const key = this.mult >= 3 ? "g" : (this.mult >= 2 ? "a" : "c");
    const speed = 1.6 + 0.9 * this.mult;                     // 呼吸角速度随倍率递增
    const breath = 0.5 + 0.5 * Math.sin(this.t * speed);
    const surgeK = Math.max(0, this.surge) / C.SURGE;
    const alpha = 0.20 + 0.22 * breath + 0.45 * surgeK;

    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = Math.min(0.9, alpha);
    const E = C.EDGE;
    ctx.drawImage(this.edge[key], 11, 88, E, 604);           // 左
    ctx.drawImage(this.edge[key], CFG.W - 11 - E, 88, E, 604); // 右
    ctx.drawImage(this.edgeH[key], 20, 700, CFG.W - 40, E);  // 底
    ctx.globalAlpha = 1;

    // ② 入袋闪光：全屏低透明度色调 + 槽口径向爆光
    if (this.flash) {
      const f = this.flash, k = f.t / f.m;
      const ease = k * k;
      ctx.globalAlpha = ease * f.tint;
      ctx.fillStyle = f.col;
      ctx.fillRect(0, 0, CFG.W, CFG.H);
      const s = 150 + 210 * (1 - k);
      ctx.globalAlpha = Math.min(1, k * 1.1);
      ctx.drawImage(f.spr, f.cx - s / 2, f.cy - s / 2, s, s);
      ctx.globalAlpha = 1;
    }

    // ③ 奖励靶彩色粒子
    const S = C.DOT;
    for (const p of this.parts) {
      if (!p.a || !p.spr) continue;
      ctx.globalAlpha = (p.t / p.m) * 0.9;
      ctx.drawImage(p.spr, p.x - S / 2, p.y - S / 2, S, S);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  },

  /* ---------- X2.7 初始化 ---------- */
  init() {
    for (let i = 0; i < this.C.MAX; i++) {
      this.parts.push({ a: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, m: 1, spr: null });
    }
    this.buildSprites();

    // 包装奖励靶命中：只有真正触发（不在冷却中）才爆炸
    const origHit = REWARD.hit.bind(REWARD);
    REWARD.hit = (s) => {
      const willFire = (s.cool <= 0);
      origHit(s);
      if (willFire) this.burst(s);
    };

    // 再来一层入袋回调，保留 PLAY 计分、FX 粒子与 REWARD 倍率
    const prev = BALLS.onEnterPocket;
    BALLS.onEnterPocket = (b, id) => {
      if (prev) prev(b, id);
      this.pocket(id);
    };

    // 插在玻璃层之前 → 特效在钢珠之上、玻璃之下
    const drawer = (ctx) => this.draw(ctx);
    const gi = GAME.drawers.findIndex((f) => /GLASS\s*\./.test(String(f)));
    if (gi >= 0) GAME.drawers.splice(gi, 0, drawer);
    else GAME.drawers.push(drawer);
  }
};

/* ---------- X2.8 自注册 ---------- */
FX2.init();
GAME.updaters.push((dt) => FX2.update(dt));
