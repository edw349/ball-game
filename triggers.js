"use strict";
/* =========================================================
 * 迭代阶段 Z25：被动机关 TRIGGERS（最后一阶段）
 * 四类机关：① 旋转偏转挡板 ② 金属反弹拨片 ③ 倾斜导流片 ④ 静态障碍凸起
 * 物理约束：balls.js 一字不改 —— 重力/恢复系数/摩擦/子步全部原版；
 *           本模块只在 BALLS.substep 之后追加外层碰撞几何，
 *           反弹一律复用 BALLS.bounce / BALLS.closestOnLine。
 * 排布原则：主走廊 (x 270~380) 对几何改动极度敏感（前两轮实测：
 *           2px 的靶位差异就能把满力度得分从 6770 推到 20350），
 *           因此机关主要布置在低交通的左/中区，只在球流经过的中下部
 *           放一个凸起，做到"分散但不劫持球路"。
 * 加载时会逐个做净间隙校验，不合格的机关自动剔除。
 * 学习演示用途，仅虚拟弹珠与虚拟积分，无任何兑换功能。
 * ========================================================= */

const TRIGGERS = {
  /* ---------- Z25.1 机关定义 ---------- */
  C: {
    MIN_CLEAR: 4,        // 机关表面到钉子/导轨的最小净间隙
    VALID_STEP: 8,       // 线段机关的采样校验步长
    HUB_SAFE: 15,        // 旋转挡板"轴心安全半径"：球心进入该范围不参与碰撞，
                         // 避免钢珠被旋转杆压在轴心处形成楔形锁死（本次卡球主因）
    SPIN_R: 2.5,         // 旋转挡板碰撞半径（原 3，减薄以扩大可通过缝隙）
    WATCH_T: 1.5,        // 卡死看门狗：判定窗口（秒）
    WATCH_D: 12,         // 卡死看门狗：窗口内累计位移小于该值即判定卡死（px）
    // t: 类型 | e: 恢复系数 | r: 半径 | len/amp/w: 旋转挡板参数
    // 位置由自动寻位脚本算出：在每个机关的邻域内搜索净间隙最大的合法点，
    // 保证任何姿态都不与 83 颗钉子、全部导轨冲突（实测净间隙 6.2~29px）。
    MECHS: [
      // ① 旋转偏转挡板：360° 持续圆周旋转（w = 角速度 rad/s，约 6~7 秒一圈）。
      //    转速刻意取中低速：碰撞只反射钢珠相对挡板的速度，挡板自身不注入能量，
      //    因此不会出现"被高速挡板甩飞"的异常弹射；中低速还能避免把球压进缝隙。
      { t: "spin", x: 118, y: 344, len: 34, e: 0.72, w: 1.05, ph: 0.0 },
      { t: "spin", x: 140, y: 448, len: 30, e: 0.72, w: 0.85, ph: 2.1 },
      // ② 金属反弹拨片（小圆，高弹）
      { t: "flip", x: 98, y: 400, r: 5, e: 0.90 },
      { t: "flip", x: 238, y: 276, r: 5, e: 0.90 },
      // ③ 倾斜导流片（斜置金属板，低弹导向）
      { t: "guide", x1: 92, y1: 480, x2: 164, y2: 452, e: 0.42 },
      { t: "guide", x1: 200, y1: 180, x2: 256, y2: 204, e: 0.42 },
      // ④ 静态障碍凸起（圆头铆，中等弹性）
      { t: "bump", x: 100, y: 192, r: 6, e: 0.62 },
      { t: "bump", x: 232, y: 288, r: 6, e: 0.62 },
      { t: "bump", x: 218, y: 470, r: 6, e: 0.62 }
    ]
  },

  list: [], t: 0, hits: 0, dropped: 0,
  enabled: false, _drawDone: false,

  /* ---------- Z25.2 净间隙校验：与 83 颗钉子、全部导轨比对 ---------- */
  clearanceAt(x, y, r) {
    let m = 1e9;
    for (const p of BOARD.pegs) {
      const d = Math.hypot(x - p.x, y - p.y) - p.r - r;
      if (d < m) m = d;
    }
    for (const s of BOARD.rails) {
      const cp = (s.type === "line") ? BALLS.closestOnLine(x, y, s) : BALLS.closestOnArc(x, y, s);
      const d = Math.hypot(x - cp.x, y - cp.y) - s.r - r;
      if (d < m) m = d;
    }
    return m;
  },
  /* 线段机关：沿线段采样取最小净间隙 */
  clearanceSeg(m, r) {
    const L = Math.hypot(m.x2 - m.x1, m.y2 - m.y1);
    const n = Math.max(3, Math.ceil(L / this.C.VALID_STEP));
    let best = 1e9;
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const g = this.clearanceAt(m.x1 + (m.x2 - m.x1) * k, m.y1 + (m.y2 - m.y1) * k, r);
      if (g < best) best = g;
    }
    return best;
  },

  /* ---------- Z25.3 校验并剔除不合格机关 ---------- */
  build() {
    const C = this.C;
    this.list = [];
    this.dropped = 0;
    for (let i = 0; i < C.MECHS.length; i++) {
      const m = Object.assign({ id: i, flash: 0 }, C.MECHS[i]);
      let gap;
      if (m.t === "spin") {
        // 360° 持续旋转 → 扫描范围是"整圆"而非几个摆角，
        // 因此沿半径 = 半长 + 碰撞半径 的圆周采样 16 个方向，取最小净间隙
        const half = m.len / 2, rr = half + this.C.SPIN_R;
        let worst = 1e9;
        for (let k = 0; k < 16; k++) {
          const a = k * Math.PI / 8;
          const g = this.clearanceAt(m.x + Math.cos(a) * rr, m.y + Math.sin(a) * rr, 2);
          if (g < worst) worst = g;
        }
        gap = worst;
      } else if (m.t === "guide") {
        gap = this.clearanceSeg(m, 2.5);
      } else {
        gap = this.clearanceAt(m.x, m.y, m.r);
      }
      m.gap = Math.round(gap * 10) / 10;
      if (gap >= C.MIN_CLEAR) this.list.push(m);
      else this.dropped++;                 // 与钉子/导轨冲突 → 直接剔除，绝不硬塞
    }
    // 旋转挡板每帧计算端点，预存半长
    for (const m of this.list) if (m.t === "spin") m.half = m.len / 2;
  },

  /* ---------- Z25.4 旋转挡板端点（360° 持续旋转，不再往复摆动） ---------- */
  spinEnds(m, t) {
    const a = m.ph + t * m.w;          // 连续圆周旋转：角度随时间线性累加
    const dx = Math.cos(a) * m.half, dy = Math.sin(a) * m.half;
    return { x1: m.x - dx, y1: m.y - dy, x2: m.x + dx, y2: m.y + dy };
  },

  /* ---------- Z25.5 碰撞：追加在原有物理之后 ---------- */
  collide(dt) {
    const list = this.list;
    if (!list.length) return;
    for (const b of BALLS.list) {
      for (const m of list) {
        if (m.t === "spin") {
          // 轴心安全半径：球太靠近转轴时不做碰撞，避免被旋转杆压在轴心锁死
          const dp = Math.hypot(b.x - m.x, b.y - m.y);
          if (dp < this.C.HUB_SAFE) continue;
          const s = this.spinEnds(m, this.t);
          const cp = BALLS.closestOnLine(b.x, b.y, s);
          const minD = b.r + this.C.SPIN_R;
          const dx = b.x - cp.x, dy = b.y - cp.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= minD * minD || d2 < 1e-6) continue;
          const dist = Math.sqrt(d2);
          if (BALLS.bounce(b, dx / dist, dy / dist, dist, minD, m.e, dt)) this.hit(m);
        } else if (m.t === "guide") {
          const cp = BALLS.closestOnLine(b.x, b.y, m);
          const minD = b.r + 2.5;
          const dx = b.x - cp.x, dy = b.y - cp.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= minD * minD || d2 < 1e-6) continue;
          const dist = Math.sqrt(d2);
          if (BALLS.bounce(b, dx / dist, dy / dist, dist, minD, m.e, dt)) this.hit(m);
        } else {
          // flip / bump：圆头，与钉子同一套碰撞响应
          const minD = b.r + m.r;
          const dx = b.x - m.x, dy = b.y - m.y;
          if (dx > minD || dx < -minD || dy > minD || dy < -minD) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 >= minD * minD || d2 < 1e-6) continue;
          const dist = Math.sqrt(d2);
          if (BALLS.bounce(b, dx / dist, dy / dist, dist, minD, m.e, dt)) this.hit(m);
        }
      }
    }
  },

  /* ---------- Z25.6 命中反馈：短暂高亮 + 轻音效 ---------- */
  hit(m) {
    m.flash = 0.35;
    this.hits++;
    // 节流：同一机关 0.12 秒内不重复发声，避免密集接触爆音
    const now = this.t;
    if (now - (m.lastSfx || -1) < 0.12) return;
    m.lastSfx = now;
    if (typeof AUDIO !== "undefined" && AUDIO.ac && AUDIO.enabled && AUDIO.master &&
        AUDIO.master.gain.value > 0) {
      AUDIO.note(m.t === "flip" ? 1320 : 420, 0, 0.05, 0.06, "square");
    }
  },

  /* ---------- Z25.7 逻辑帧 ---------- */
  update(dt) {
    this.t += dt;
    for (const m of this.list) if (m.flash > 0) m.flash -= dt;
    this.watchdog(dt);
  },

  /* ---------- Z25.7b 卡死看门狗（基于位移，不依赖速度） ----------
   * 钢珠若被旋转挡板反复挤压，速度并不低，reward.js 里基于速度的防卡死救不出来；
   * 这里改用"窗口内累计位移"判定：1.5 秒内几乎没挪动就施加一次确定性逃生冲量。
   * 方向按次数与球号旋转（无随机数），保证最终必然脱困。 */
  watchdog(dt) {
    const C = this.C;
    for (const b of BALLS.list) {
      if (b._px === undefined) { b._px = b.x; b._py = b.y; b._mt = 0; b._md = 0; }
      b._md += Math.hypot(b.x - b._px, b.y - b._py);
      b._px = b.x; b._py = b.y;
      b._mt += dt;
      if (b._mt < C.WATCH_T) continue;
      if (b._md < C.WATCH_D) {
        b._kn = (b._kn || 0) + 1;
        const ang = (b._kn * 2.1 + (b.id || 0) * 0.7) % (Math.PI * 2);
        b.vx += Math.cos(ang) * 130;
        b.vy += Math.sin(ang) * 130 - 70;
        this.escapes = (this.escapes || 0) + 1;
      }
      b._mt = 0; b._md = 0;
    }
  },

  /* ---------- Z25.8 绘制 ---------- */
  draw(ctx) {
    const flashA = (m) => (m.flash > 0 ? m.flash / 0.35 : 0);

    for (const m of this.list) {
      const fa = flashA(m);
      if (m.t === "spin") {
        const s = this.spinEnds(m, this.t);
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 9;
        ctx.beginPath(); ctx.moveTo(s.x1 + 2, s.y1 + 2.5); ctx.lineTo(s.x2 + 2, s.y2 + 2.5); ctx.stroke();
        ctx.strokeStyle = "#8ea0b8"; ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
        ctx.strokeStyle = "#e2ecfa"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke();
        // 中心转轴
        ctx.fillStyle = "#48566b";
        ctx.beginPath(); ctx.arc(m.x, m.y, 4.6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#d8e4f4";
        ctx.beginPath(); ctx.arc(m.x - 1.2, m.y - 1.4, 1.7, 0, Math.PI * 2); ctx.fill();
      } else if (m.t === "guide") {
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(m.x1 + 2, m.y1 + 2.5); ctx.lineTo(m.x2 + 2, m.y2 + 2.5); ctx.stroke();
        const lg = ctx.createLinearGradient(m.x1, m.y1, m.x2, m.y2);
        lg.addColorStop(0, "#6d7c92"); lg.addColorStop(0.5, "#c3d2e6"); lg.addColorStop(1, "#5a6879");
        ctx.strokeStyle = lg; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.moveTo(m.x1, m.y1); ctx.lineTo(m.x2, m.y2); ctx.stroke();
      } else if (m.t === "flip") {
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.beginPath(); ctx.ellipse(m.x, m.y + 3, m.r * 1.2, m.r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
        const rg = ctx.createRadialGradient(m.x - m.r * 0.4, m.y - m.r * 0.5, 0.5, m.x, m.y, m.r);
        rg.addColorStop(0, "#ffffff"); rg.addColorStop(0.45, "#cfe0f4"); rg.addColorStop(1, "#4d5a6e");
        ctx.fillStyle = rg;
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(255,220,150,0.75)"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r + 0.8, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.beginPath(); ctx.ellipse(m.x, m.y + 3.4, m.r * 1.15, m.r * 0.58, 0, 0, Math.PI * 2); ctx.fill();
        const bg = ctx.createLinearGradient(m.x, m.y - m.r, m.x, m.y + m.r);
        bg.addColorStop(0, "#f2f7fd"); bg.addColorStop(0.4, "#b7c6da");
        bg.addColorStop(0.75, "#71809a"); bg.addColorStop(1, "#3a4557");
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath(); ctx.ellipse(m.x - m.r * 0.3, m.y - m.r * 0.42, m.r * 0.32, m.r * 0.22, -0.5, 0, Math.PI * 2); ctx.fill();
      }

      // 命中高亮（加法混合，只提亮，不遮挡钢珠）
      if (fa > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = fa * 0.5;
        ctx.strokeStyle = "#8ff4ff"; ctx.lineWidth = 3;
        ctx.beginPath();
        if (m.t === "spin") { const s = this.spinEnds(m, this.t); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); }
        else if (m.t === "guide") { ctx.moveTo(m.x1, m.y1); ctx.lineTo(m.x2, m.y2); }
        else { ctx.arc(m.x, m.y, m.r + 2, 0, Math.PI * 2); }
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
    }
  },

  /* ---------- Z25.9 初始化 ---------- */
  init() {
    this.build();

    // 追加外层碰撞：原物理（含奖励靶）先算，再算机关
    const prevSub = BALLS.substep.bind(BALLS);
    BALLS.substep = (dt) => { prevSub(dt); this.collide(dt); };

    // 插在钢珠层之前 → 机关在盘面之上、钢珠之下（和钉子同层观感）
    const drawer = (ctx) => this.draw(ctx);
    const bi = GAME.drawers.findIndex((f) => /BALLS\s*\./.test(String(f)));
    if (bi >= 0) GAME.drawers.splice(bi, 0, drawer);
    else GAME.drawers.push(drawer);
    this.enabled = true;
  }
};

/* ---------- Z25.10 自注册（玩法层，不受 V 键皮肤开关影响） ---------- */
TRIGGERS.init();
GAME.updaters.push((dt) => TRIGGERS.update(dt));
