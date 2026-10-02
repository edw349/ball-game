"use strict";
/* =========================================================
 * 增量阶段 R1：奖励撞击靶 + 得分倍率 REWARD
 * 职责：① 自动寻位生成奖励靶（保证与 83 颗钉子、导轨零冲突）
 *       ② 包装 BALLS.substep 追加靶碰撞（balls.js 一行不改）
 *       ③ 确定性奖励序列：加分 / 赠球 / 提升倍率
 *       ④ 命中后闪烁发光 + 冷却防刷分
 *       ⑤ 得分倍率：连续命中 P2 逐级 ×1→×2→×3，落入 P0 重置
 * 学习演示用途，仅虚拟弹珠与虚拟积分，无任何兑换功能。
 * ========================================================= */

const REWARD = {
  /* ---------- R1.1 参数 ---------- */
  C: {
    R: 7,            // 靶半径（钉阵格内净间隙仅 11px 左右，7 是安全上限）
    E: 0.30,         // 靶恢复系数：刻意做低，避免与钉子形成高弹乱弹
    POP: 330,        // 主动弹射速度：像真机役物一样把球弹开，杜绝钢珠停在靶顶
    POP_MAX: 620,    // 仅在球速低于此值时才弹射，防止能量失控
    NEED: 9,         // 靶面到最近障碍的最小净间隙
    MIN_GAP: 60,     // 靶与靶之间的最小间距（>球径+两倍靶半径，保证球能穿过）
    PICK: 3,         // 靶数量
    COOL: 3.0,       // 冷却秒数（防刷分）
    FLASH: 0.55,     // 命中闪烁时长
    MULT_MAX: 3,     // 倍率上限
    STUCK_V: 40,     // 防卡死：判定为"慢"的速度阈值
    STUCK_T: 1.0     // 防卡死：低速持续超过该秒数则施加一次逃生冲量
  },

  /* 确定性奖励序列：非线性步进取值，观感有变化但完全可复现（无随机数） */
  TABLE: [
    { t: "score", v: 100 }, { t: "ball", v: 1 }, { t: "mult", v: 1 },
    { t: "score", v: 200 }, { t: "ball", v: 2 }, { t: "score", v: 50 },
    { t: "mult", v: 1 }, { t: "score", v: 150 }, { t: "ball", v: 1 }
  ],
  STEP: 7,           // 与表长 9 互质 → 遍历顺序不重复

  spots: [], hits: 0, mult: 1, chain: 0, t: 0, last: null,
  base: null, glow: null, _wrapDone: false,

  /* ---------- R1.2 几何净间隙：到所有钉子与导轨的最小距离 ---------- */
  clearance(x, y, r) {
    let m = 1e9;
    for (const p of BOARD.pegs) {
      const d = Math.hypot(x - p.x, y - p.y) - p.r - r;
      if (d < m) m = d;
    }
    for (const s of BOARD.rails) {
      const cp = (s.type === "line") ? BALLS.closestOnLine(x, y, s)
                                     : BALLS.closestOnArc(x, y, s);
      const d = Math.hypot(x - cp.x, y - cp.y) - s.r - r;
      if (d < m) m = d;
    }
    return m;
  },

  /* 实测钢珠通过率先验（由轨迹热区统计得出，静态常量，无随机性）
   * 热区实测样本：x 280~360 / y 240~440 是主走廊（19~89 次），
   *              x <= 240 区域样本几乎为 0 —— 靶放那里等于死内容。 */
  HEAT: { x: 320, y: 340, sx: 70, sy: 95 },

  /* 位置评分：热区权重（高斯先验） */
  heat(x, y) {
    const H = this.HEAT;
    const ax = (x - H.x) / H.sx, ay = (y - H.y) / H.sy;
    return Math.exp(-(ax * ax + ay * ay) / 2);
  },

  /* ---------- R1.3 自动寻位：净间隙达标 + 钢珠最常经过 ---------- */
  findSpots() {
    const C = this.C, cand = [];
    // 只在中场区域扫描（y 210~470 为钉阵主体，x 90~400 避开两侧球道）
    for (let y = 210; y <= 470; y += 3) {
      for (let x = 92; x <= 400; x += 3) {
        const g = this.clearance(x, y, C.R);
        if (g >= C.NEED) cand.push({ x, y, g, h: this.heat(x, y) });
      }
    }
    // 先按热区权重降序，权重相同再取净间隙更大者
    cand.sort((a, b) => (b.h - a.h) || (b.g - a.g));
    const out = [];
    for (const c of cand) {
      if (out.length >= C.PICK) break;
      let ok = true;
      for (const o of out) if (Math.hypot(c.x - o.x, c.y - o.y) < C.MIN_GAP) { ok = false; break; }
      if (ok) out.push({ x: Math.round(c.x), y: Math.round(c.y), g: Math.round(c.g),
                         cool: 0, flash: 0, id: out.length });
    }
    this.spots = out;
  },

  /* ---------- R1.4 预渲染：靶体与命中辉光 ---------- */
  buildSprites() {
    const R = this.C.R, S = 64, cx = S / 2, cy = S / 2;
    const c = document.createElement("canvas");
    c.width = S; c.height = S;
    const g = c.getContext("2d");
    const k = S / (R * 2);          // 贴图放大倍率

    // 外圈金属座
    const rg = g.createRadialGradient(cx - 5, cy - 6, 1, cx, cy, R * k);
    rg.addColorStop(0.00, "#f5f9ff");
    rg.addColorStop(0.35, "#aebccd");
    rg.addColorStop(0.72, "#5c6a7d");
    rg.addColorStop(1.00, "#2b3444");
    g.fillStyle = rg;
    g.beginPath(); g.arc(cx, cy, R * k, 0, Math.PI * 2); g.fill();

    // 内凹靶芯
    const r2 = g.createRadialGradient(cx - 3, cy - 4, 1, cx, cy, R * k * 0.66);
    r2.addColorStop(0.00, "#26313f");
    r2.addColorStop(0.70, "#141c28");
    r2.addColorStop(1.00, "#0a0f18");
    g.fillStyle = r2;
    g.beginPath(); g.arc(cx, cy, R * k * 0.66, 0, Math.PI * 2); g.fill();

    // 金色装饰环 + 四个色标（复古机台配色）
    g.strokeStyle = "rgba(226,190,110,0.9)"; g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, R * k * 0.80, 0, Math.PI * 2); g.stroke();
    const cols = ["#d8424a", "#2fb37a", "#3f8fd8", "#e0912c"];
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      g.fillStyle = cols[i];
      g.beginPath();
      g.arc(cx + Math.cos(a) * R * k * 0.80, cy + Math.sin(a) * R * k * 0.80, 2.4, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.beginPath(); g.arc(cx - R * k * 0.34, cy - R * k * 0.38, 2.2, 0, Math.PI * 2); g.fill();
    this.base = c;

    // 命中辉光精灵
    const T = 128, t = document.createElement("canvas");
    t.width = T; t.height = T;
    const h = t.getContext("2d");
    const hg = h.createRadialGradient(T / 2, T / 2, 0, T / 2, T / 2, T / 2);
    hg.addColorStop(0.00, "rgba(255,246,214,0.95)");
    hg.addColorStop(0.28, "rgba(255,196,96,0.55)");
    hg.addColorStop(0.62, "rgba(255,150,70,0.18)");
    hg.addColorStop(1.00, "rgba(255,120,60,0)");
    h.fillStyle = hg; h.fillRect(0, 0, T, T);
    this.glow = t;
  },

  /* ---------- R1.5 命中：冷却判定 → 发奖 → 闪烁 ---------- */
  hit(s) {
    if (s.cool > 0) return;                      // 冷却中，不重复发奖（防刷分）
    s.cool = this.C.COOL;
    s.flash = this.C.FLASH;
    this.hits++;

    const r = this.TABLE[(this.hits * this.STEP) % this.TABLE.length];
    this.last = r;
    if (r.t === "score") GAME.score += r.v;      // 直接加分
    else if (r.t === "ball") GAME.ballsLeft += r.v; // 赠送钢珠
    else this.raiseMult();                       // 提升倍率

    // 复用现有音频模块（AUDIO.note 为公开基元，不改 audio.js）
    if (typeof AUDIO !== "undefined" && AUDIO.ac) {
      AUDIO.note(880, 0, 0.10, 0.18, "square");
      AUDIO.note(1318.5, 0.07, 0.16, 0.16, "square");
      if (r.t === "mult") AUDIO.note(1760, 0.17, 0.22, 0.15, "triangle");
    }
  },

  /* ---------- R1.6 倍率 ---------- */
  raiseMult() {
    this.chain++;
    const m = Math.min(this.C.MULT_MAX, this.chain);
    if (m > this.mult) this.mult = m;
  },
  resetMult() { this.chain = 0; this.mult = 1; },

  /* ---------- R1.7 碰撞：追加在原有 substep 之后 ---------- */
  collide(dt) {
    const C = this.C;
    for (const b of BALLS.list) {
      for (const s of this.spots) {
        const dx = b.x - s.x, dy = b.y - s.y, minD = b.r + C.R;
        if (dx > minD || dx < -minD || dy > minD || dy < -minD) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minD * minD || d2 < 1e-6) continue;
        const dist = Math.sqrt(d2);
        // 复用物理层的碰撞响应，手感与钉子一致
        if (BALLS.bounce(b, dx / dist, dy / dist, dist, minD, C.E, dt)) {
          // 主动弹射：真机役物靠弹力把球打飞；没有这一步，钢珠会停在靶顶不动
          const sp = Math.hypot(b.vx, b.vy);
          if (sp < C.POP_MAX) {
            b.vx += (dx / dist) * C.POP;
            b.vy += (dy / dist) * C.POP;
          }
          this.hit(s);
        }
      }
    }
  },

  /* ---------- R1.8 逻辑帧 ---------- */
  update(dt) {
    this.t += dt;
    for (const s of this.spots) {
      if (s.cool > 0) s.cool -= dt;
      if (s.flash > 0) s.flash -= dt;
    }
    this.antiStuck(dt);
  },

  /* ---------- R1.8b 防卡死保护 ----------
   * 钢珠若在靶顶/钉顶缓慢悬停（无力学扰动时会一直停住），每累计 STUCK_T 秒
   * 就施加一次逃生冲量。方向按次数旋转，确定性、无随机数，保证最终必然脱困。
   * 不需要可把 C.STUCK_T 设为 Infinity 关闭。 */
  antiStuck(dt) {
    const C = this.C;
    for (const b of BALLS.list) {
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 120) { b.stuck = 0; continue; }     // 明显在运动 → 计时清零
      if (sp > C.STUCK_V) { b.stuck = 0; continue; }
      b.stuck = (b.stuck || 0) + dt;
      if (b.stuck > C.STUCK_T) {
        b.stuck = 0;
        b.kickN = (b.kickN || 0) + 1;
        const ang = (b.kickN * 1.9) % (Math.PI * 2);   // 每次方向不同（确定性）
        b.vx += Math.cos(ang) * 95;
        b.vy += Math.sin(ang) * 95 - 45;
      }
    }
  },

  /* ---------- R1.9 绘制：靶体 + 冷却暗化 + 命中辉光 ---------- */
  draw(ctx) {
    const R = this.C.R, S = 64, G = 128;
    for (const s of this.spots) {
      // 冷却中压低亮度，直观表达"暂时不响应"
      const ready = s.cool > 0 ? 0.45 : 1;
      ctx.globalAlpha = ready;
      ctx.drawImage(this.base, s.x - R, s.y - R, R * 2, R * 2);
      ctx.globalAlpha = 1;

      // 命中辉光：alpha 与尺寸随闪烁衰减
      if (s.flash > 0) {
        const k = s.flash / this.C.FLASH;
        const gs = R * 2 + 54 * (1 - k);
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = k * 0.9;
        ctx.drawImage(this.glow, s.x - gs / 2, s.y - gs / 2, gs, gs);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      } else if (s.cool > 0) {
        // 冷却剩余时间用一圈细弧表示
        const k = s.cool / this.C.COOL;
        ctx.strokeStyle = "rgba(120,160,220,0.5)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, R + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - k));
        ctx.stroke();
      }
    }
  },

  /* ---------- R1.10b 回合复位：重开一局时清空倍率、计数与靶冷却 ---------- */
  resetRound() {
    this.hits = 0;
    this.mult = 1;
    this.chain = 0;
    this.last = null;
    for (const s of this.spots) { s.cool = 0; s.flash = 0; }
  },

  /* ---------- R1.10 初始化：寻位 → 碰撞包装 → 计分挂接 → 注册绘制 ---------- */
  init() {
    this.findSpots();
    this.buildSprites();

    // 包装 PLAY.reset：重开一局时同步清空本模块状态（game.js 未被修改）
    const origReset = PLAY.reset.bind(PLAY);
    PLAY.reset = () => { origReset(); this.resetRound(); };

    // 包装 substep：原物理先算，再追加靶碰撞（balls.js 未被修改）
    const origSub = BALLS.substep.bind(BALLS);
    BALLS.substep = (dt) => { origSub(dt); this.collide(dt); };

    // 包装入袋回调，实现倍率结算（PLAY 已按基础分记账，这里补差额）
    const prev = BALLS.onEnterPocket;
    BALLS.onEnterPocket = (b, id) => {
      const before = GAME.score;
      if (prev) prev(b, id);
      const gained = GAME.score - before;
      if (gained <= 0) return;
      if (id === 2) this.raiseMult();                       // 连续命中高分袋 → 倍率提升
      else if (id === 0) this.resetMult();                  // 落入 P0 低分袋 → 倍率归 1
      if (this.mult > 1) GAME.score += gained * (this.mult - 1);
    };

    // 插入到玻璃层之前 → 靶体在钢珠之上、玻璃之下
    const drawer = (ctx) => this.draw(ctx);
    const gi = GAME.drawers.findIndex((f) => /GLASS\s*\./.test(String(f)));
    const si = GAME.drawers.findIndex((f) => /STATE\s*\./.test(String(f)));
    if (gi >= 0) GAME.drawers.splice(gi, 0, drawer);
    else if (si >= 0) GAME.drawers.splice(si, 0, drawer);
    else GAME.drawers.push(drawer);
  }
};

/* ---------- R1.11 自注册（玩法模块，不受 V 键皮肤开关影响） ---------- */
REWARD.init();
GAME.updaters.push((dt) => REWARD.update(dt));
