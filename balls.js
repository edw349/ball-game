"use strict";
/* =========================================================
 * 阶段 3 模块（第 1 块）：弹珠与固定步长物理 BALLS
 * 职责：重力积分、钉/导轨/隔板碰撞、限速与回收。
 *       全部数值为固定常量，无随机器；子步长只由速度决定，
 *       因此相同初速度一定得到相同轨迹（可复现）。
 * 学习演示用途，仅虚拟弹珠与虚拟积分。
 * ========================================================= */

const BALLS = {
  /* ---------- 3.1 物理常量（单位：px、秒） ---------- */
  C: {
    R: 7,          // 弹珠半径
    G: 800,        // 重力加速度
    E_PEG: 0.60,   // 钉恢复系数（弹性，形成柏青哥式乱弹）
    E_RAIL: 0.60,  // 导轨恢复系数（钢珠碰钢轨，弹性偏高）
    E_WALL: 0.45,  // 隔板/直角墙恢复系数
    DRAG: 0.02,    // 空气阻尼系数（钢珠空气阻力极小；原 0.15 会吃掉 40% 动能）
    ROLL_K: 0.5,   // 接触时切向滚动摩擦（仅接触瞬间生效）
    MAXV: 1300,    // 速度上限，防穿透与能量爆炸
    SUB_DISP: 3,   // 每子步最大位移（px），越小越不穿模
    SUB_MAX: 24,   // 子步上限，保护性能
    DEAD_Y: 675,   // 越过此 y 视为已落底，回收（必须低于发射点 660，否则球一出生就被删）
    LAUNCH_V: 1100 // 发射初速度（阶段 4 使用）
  },

  list: [],
  nextId: 1,

  /* ---------- 3.2 弹珠生成 ---------- */
  spawn(x, y, vx, vy) {
    const b = { id: this.nextId++, x, y, vx, vy, r: this.C.R, hits: 0 };
    this.list.push(b);
    return b;
  },

  /* ---------- 3.3 几何求最近点 ---------- */
  closestOnLine(px, py, s) {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - s.x1) * dx + (py - s.y1) * dy) / len2 : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t); // 夹到线段范围
    return { x: s.x1 + t * dx, y: s.y1 + t * dy };
  },

  closestOnArc(px, py, a) {
    let ang = Math.atan2(py - a.cy, px - a.cx);
    const TAU = Math.PI * 2;
    while (ang < a.a0) ang += TAU;           // 归一到 [a0, a0+2π)
    if (ang > a.a1) {                        // 角度在弧外 → 取两端点较近者
      const p0 = { x: a.cx + Math.cos(a.a0) * a.rad, y: a.cy + Math.sin(a.a0) * a.rad };
      const p1 = { x: a.cx + Math.cos(a.a1) * a.rad, y: a.cy + Math.sin(a.a1) * a.rad };
      const d0 = (px - p0.x) ** 2 + (py - p0.y) ** 2;
      const d1 = (px - p1.x) ** 2 + (py - p1.y) ** 2;
      return d0 < d1 ? p0 : p1;
    }
    return { x: a.cx + Math.cos(ang) * a.rad, y: a.cy + Math.sin(ang) * a.rad };
  },

  /* ---------- 3.4 碰撞响应：先分离，再沿法线反射 ---------- */
  bounce(b, nx, ny, dist, minD, e, dt) {
    b.x += nx * (minD - dist + 0.01);   // 位置修正，杜绝穿透累积
    b.y += ny * (minD - dist + 0.01);
    const vn = b.vx * nx + b.vy * ny;   // 法向分量
    if (vn >= 0) return false;          // 正在远离则该帧不再施加冲量（防抖动）
    b.vx -= (1 + e) * vn * nx;
    b.vy -= (1 + e) * vn * ny;
    const f = Math.max(0, 1 - this.C.ROLL_K * dt); // 切向摩擦按 dt 归一
    b.vx *= f; b.vy *= f;
    return true;
  },

  /* ---------- 3.5 单子步：积分 + 碰撞检测 ---------- */
  substep(dt) {
    const C = this.C;
    for (const b of this.list) {
      // 半隐式欧拉：先更新速度再更新位置，比显式欧拉稳定
      b.vy += C.G * dt;
      const damp = 1 - C.DRAG * dt;
      b.vx *= damp; b.vy *= damp;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // 限速
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > C.MAXV) { const k = C.MAXV / sp; b.vx *= k; b.vy *= k; }

      // 与钉碰撞（先做包围盒快速排除，再开方）
      for (const p of BOARD.pegs) {
        const minD = b.r + p.r;
        const dx = b.x - p.x, dy = b.y - p.y;
        if (dx > minD || dx < -minD || dy > minD || dy < -minD) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD || d2 < 1e-6) continue;
        const dist = Math.sqrt(d2);
        if (this.bounce(b, dx / dist, dy / dist, dist, minD, C.E_PEG, dt)) b.hits++;
      }

      // 与导轨 / 隔板碰撞
      for (const r of BOARD.rails) {
        const minD = b.r + r.r;
        const cp = (r.type === "line") ? this.closestOnLine(b.x, b.y, r)
                                       : this.closestOnArc(b.x, b.y, r);
        const dx = b.x - cp.x, dy = b.y - cp.y;
        if (dx > minD || dx < -minD || dy > minD || dy < -minD) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD || d2 < 1e-6) continue;
        const e = (r.kind === "divider") ? C.E_WALL : C.E_RAIL;
        this.bounce(b, dx / Math.sqrt(d2), dy / Math.sqrt(d2), Math.sqrt(d2), minD, e, dt);
      }
    }
  },

  /* ---------- 3.6 逻辑帧入口：按速度决定子步数 ---------- */
  step(dt) {
    if (!this.list.length) return;
    let vmax = 0;
    for (const b of this.list) vmax = Math.max(vmax, Math.hypot(b.vx, b.vy));
    let n = Math.ceil(vmax * dt / this.C.SUB_DISP);
    n = n < 1 ? 1 : (n > this.C.SUB_MAX ? this.C.SUB_MAX : n);
    const h = dt / n;
    for (let k = 0; k < n; k++) this.substep(h);

    // 入袋判定：命中袋口则回调计分，否则静默回收
    if (!this.list.length) return;
    const keep = [];
    for (const b of this.list) {
      if (b.y > this.C.DEAD_Y) {
        if (this.onEnterPocket) this.onEnterPocket(b, this.pocketOf(b.x));
      } else keep.push(b);
    }
    this.list = keep;
  },

  /* 由球心 x 反查所在袋号；落在发射道内（x < 58）判为失球，返回 -1 不计分 */
  pocketOf(x) {
    if (x < 58) return -1;
    const ps = BOARD.pockets;
    for (const p of ps) if (x >= p.x0 && x < p.x1) return p.id;
    let best = 0, bestD = Infinity;
    for (const p of ps) {
      const d = Math.abs(x - (p.x0 + p.x1) / 2);
      if (d < bestD) { bestD = d; best = p.id; }
    }
    return best;
  },

  /* ---------- 3.7 渲染 ---------- */
  draw(ctx) {
    for (const b of this.list) {
      ctx.fillStyle = "#ffe6a3";
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff8dc";   // 高光，便于观察自转方向
      ctx.beginPath(); ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.35, 0, Math.PI * 2); ctx.fill();
    }
  }
};

/* ---------- 3.8 自注册 ---------- */
GAME.updaters.push((dt) => BALLS.step(dt));
GAME.drawers.push((ctx) => BALLS.draw(ctx));

/* 3.9 发射入口已移交阶段 4 模块 PLAY（正式蓄力发射） */
