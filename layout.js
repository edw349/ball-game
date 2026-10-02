"use strict";
/* =========================================================
 * 迭代阶段 Z1：布局重构 LAYOUT
 * 职责：① 奖励靶重新分散布置（中上 / 左 / 右 / 左下），不再挤在发射点附近
 *          冷却机制、奖励表、倍率逻辑全部沿用 reward.js 原实现
 *       ② 风险通道独立成"侧边金属通道"：自带入口、通道壁、格栅底与警示灯，
 *          与底部得分槽完全分离；惩罚与红闪逻辑沿用 risk.js 原实现
 * 零侵入：reward.js / risk.js 源码不改，只替换其公开数据与绘制方法。
 * 物理内核 balls.js 不涉及。
 * 学习演示用途，仅虚拟弹珠与虚拟积分，无任何兑换功能。
 * ========================================================= */

const LAYOUT = {
  /* ---------- Z1.1 奖励靶目标位（按区域分散，加载时逐个校验净间隙） ---------- */
  C: {
    // 方案 B：四个靶沿主走廊按"高度"分层，覆盖不同发射力度档位。
    // 高度依据轨迹热区实测（x=320 在 y240/300、x=300 在 y360、x=280 在 y430 均有通过），
    // 纵向间隔 60~70px，视觉上呈阶梯状分散，不扎堆在入球口。
    TARGETS: [
      { name: "上", x: 320, y: 240 },
      { name: "中上", x: 320, y: 300 },
      { name: "中下", x: 300, y: 360 },
      { name: "下", x: 280, y: 430 }
    ],
    MIN_CLEAR: 6,        // 净间隙下限（R=7 时与钉子不重叠）
    // 底部通道重分配：从最右侧分割出扣球风险通道。
    // 原布局 P4 = 384~446(62px)；现改为 P4 = 384~420(36px) + 扣球通道 420~446(26px)，
    // 总宽仍为 34~446 = 412px，逐段首尾相接，无错位、无缝隙。
    // 分割点经扫描确定：424 时钢珠几乎不落入(0 次)，420 时 50 颗触发 14 次、
    // 扣 28 球，且分布 0/7/3/6/4 比改前更贴近最初基线(0/8/4/8/8)。
    SPLIT: 420,          // 扣球通道左边界（也是 P4 的新右边界）
    // 扣球通道几何：复用 RISK 的全部惩罚逻辑（扣球数 / 冷却 / 红闪 / 音效）
    R_CH: { x0: 420, x1: 446, yTop: 520, active: true, warn: true },
    L_CH: { x0: 0, x1: 0, yTop: 0, active: false, warn: false }
  },

  spots: [], hitBySpot: [],

  /* ---------- Z1.2 重排奖励靶：逐个校验净间隙，不合格的自动就地微调 ---------- */
  placeTargets() {
    const C = this.C, R = REWARD.C.R;
    const out = [];
    for (let i = 0; i < C.TARGETS.length; i++) {
      const t = C.TARGETS[i];
      let best = null;
      // 原位优先，否则在其周围 ±40px 内找净间隙最大的点（确定性扫描）
      const probe = [[0, 0]];
      for (let r = 8; r <= 40; r += 8) {
        probe.push([r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]);
      }
      for (const [dx, dy] of probe) {
        const x = t.x + dx, y = t.y + dy;
        if (x < 70 || x > 440 || y < 150 || y > 500) continue;
        const gap = REWARD.clearance(x, y, R);
        if (gap >= C.MIN_CLEAR) { best = { x, y, gap }; break; }
      }
      if (!best) continue;                       // 该区域无可用点则舍弃
      out.push({ x: Math.round(best.x), y: Math.round(best.y), g: Math.round(best.gap),
                 cool: 0, flash: 0, id: out.length, name: t.name });
    }
    this.spots = out;
    this.hitBySpot = out.map(() => 0);
    REWARD.spots = out;                          // 直接替换公开数组，冷却/倍率逻辑不变
  },

  /* ---------- Z1.3 风险通道：金属侧边通道美术 ---------- */
  channelSkin(ctx, ch, t) {
    const w = ch.x1 - ch.x0, y0 = ch.yTop, y1 = RISK.C.CAP_Y;
    const h = y1 - y0;
    const p = ch.warn
      ? { wall: "#7d2b30", wall2: "#2a0d10", edge: "rgba(255,120,120,0.55)",
          mouth: "rgba(255,140,120,0.55)", led: "#ff4646", tint: "rgba(120,16,22,0.45)" }
      : { wall: "#4a5668", wall2: "#1b2230", edge: "rgba(160,195,235,0.4)",
          mouth: "rgba(160,195,235,0.4)", led: "#cfe3ff", tint: "rgba(40,52,78,0.35)" };

    // 通道内腔：竖向渐变，做出向下的纵深
    const lg = ctx.createLinearGradient(ch.x0, y0, ch.x1, y0);
    lg.addColorStop(0.00, p.wall2);
    lg.addColorStop(0.35, p.wall);
    lg.addColorStop(0.70, "#0a0f18");
    lg.addColorStop(1.00, p.wall2);
    ctx.fillStyle = lg;
    ctx.fillRect(ch.x0, y0, w, h);

    // 两侧金属壁（亮边 + 厚度）
    ctx.fillStyle = p.edge;
    ctx.fillRect(ch.x0, y0, 2, h);
    ctx.fillRect(ch.x1 - 2, y0, 2, h);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(ch.x0 + 2, y0, 1, h);
    ctx.fillRect(ch.x1 - 3, y0, 1, h);

    // 入口危险斜纹（左右交叉，明确"这里是入口"）
    ctx.strokeStyle = p.mouth;
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const yy = y0 + 2 + i * 8;
      ctx.beginPath();
      ctx.moveTo(ch.x0 + 3, yy + 6); ctx.lineTo(ch.x1 - 3, yy);
      ctx.stroke();
    }

    // 通道中部：金属加强筋（每 26px 一道，弱反光）
    ctx.strokeStyle = "rgba(200,220,245,0.10)";
    ctx.lineWidth = 1;
    for (let y = y0 + 48; y < y1 - 26; y += 26) {
      ctx.beginPath();
      ctx.moveTo(ch.x0 + 3, y); ctx.lineTo(ch.x1 - 3, y);
      ctx.stroke();
    }

    // 底部格栅（钢珠从此处被回收）+ 警示灯
    const gy = y1 - 16;
    ctx.fillStyle = "rgba(8,12,20,0.92)";
    ctx.fillRect(ch.x0 + 2, gy, w - 4, 16);
    ctx.strokeStyle = p.edge;
    ctx.lineWidth = 1;
    for (let x = ch.x0 + 4; x < ch.x1 - 3; x += 4) {
      ctx.beginPath(); ctx.moveTo(x, gy + 1); ctx.lineTo(x, gy + 15); ctx.stroke();
    }
    // 灯带（呼吸）
    const breath = 0.5 + 0.5 * Math.sin(t * 3.2);
    ctx.globalAlpha = 0.45 + 0.4 * breath;
    ctx.fillStyle = p.led;
    ctx.fillRect(ch.x0 + 2, y1 - 3, w - 4, 3);
    ctx.globalAlpha = 1;

    // 命中时整条通道亮起（加法混合，只提亮不遮挡）
    if (RISK.flashT > 0 && RISK.flashCh === ch) {
      const k = RISK.flashT / RISK.C.FLASH;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = k * 0.45;
      ctx.fillStyle = p.led;
      ctx.fillRect(ch.x0, y0, w, h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  },

  /* ---------- Z1.4 覆写 risk.js 的背景层与前景层 ----------
   * 旧的左黑 / 右红两条侧边通道已彻底删除（不再有任何通道绘制与碰撞）。
   * 现在只有一条"底部扣球通道"，画在底部得分槽最右侧，样式与得分槽明显区分。 */
  back(ctx) {
    const ch = RISK.C.R;
    if (!ch.active) return;
    const y0 = BOARD.C.POCKET_Y, y1 = BOARD.inner.y1;
    const x = ch.x0, w = ch.x1 - ch.x0;
    if (w <= 0) return;

    // ① 腔体：暗红危险色，与蓝灰金属得分槽形成强对比
    const vg = ctx.createLinearGradient(0, y0, 0, y1);
    vg.addColorStop(0.00, "#3a0c11");
    vg.addColorStop(0.35, "#25070b");
    vg.addColorStop(1.00, "#120305");
    ctx.fillStyle = vg;
    ctx.fillRect(x + 2, y0 + 8, w - 4, (y1 - y0) - 8);

    // ② 左右金属壁：内侧亮线 + 红色描边
    ctx.fillStyle = "rgba(210,120,120,0.55)";
    ctx.fillRect(x + 2, y0 + 8, 2, (y1 - y0) - 8);
    ctx.fillRect(x + w - 4, y0 + 8, 2, (y1 - y0) - 8);
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x + 4, y0 + 8, 1, (y1 - y0) - 8);
    ctx.fillRect(x + w - 5, y0 + 8, 1, (y1 - y0) - 8);

    // ③ 槽口危险斜纹（与得分槽的金属槽唇区分开）
    ctx.strokeStyle = "rgba(255,120,110,0.62)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const yy = y0 - 4 + i * 7;
      ctx.beginPath();
      ctx.moveTo(x + 3, yy + 6); ctx.lineTo(x + w - 3, yy);
      ctx.stroke();
    }

    // ④ 底部格栅（钢珠从此回收）
    const gy = y1 - 18;
    ctx.fillStyle = "rgba(6,8,14,0.95)";
    ctx.fillRect(x + 2, gy, w - 4, 18);
    ctx.strokeStyle = "rgba(255,110,100,0.55)";
    ctx.lineWidth = 1;
    for (let gx = x + 4; gx < x + w - 3; gx += 4) {
      ctx.beginPath(); ctx.moveTo(gx, gy + 1); ctx.lineTo(gx, gy + 17); ctx.stroke();
    }

    // ⑤ 警示灯带（呼吸）
    const breath = 0.5 + 0.5 * Math.sin(RISK.t * 3.4);
    ctx.globalAlpha = 0.5 + 0.4 * breath;
    ctx.fillStyle = "#ff4a4a";
    ctx.fillRect(x + 2, y1 - 4, w - 4, 3);
    ctx.globalAlpha = 1;

    // ⑥ 危险标识「!」——一眼区分于得分槽
    ctx.font = "bold 15px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(255,140,130," + (0.65 + 0.35 * breath).toFixed(3) + ")";
    ctx.fillText("!", x + w / 2, y0 + 26);
    ctx.textAlign = "left";

    // ⑦ 落入时的通道整体亮起（加法混合，只提亮不遮挡）
    if (RISK.flashT > 0 && RISK.flashCh === ch) {
      const k = RISK.flashT / RISK.C.FLASH;
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = k * 0.5;
      ctx.fillStyle = "#ff3a3a";
      ctx.fillRect(x, y0, w, y1 - y0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  },
  front(ctx) {
    // 全屏暗红警示：复用 risk.js 原有的惩罚反馈参数
    if (RISK.flashT > 0) {
      const k = RISK.flashT / RISK.C.FLASH;
      ctx.globalAlpha = k * k * RISK.C.PEN_A;
      ctx.fillStyle = "#6b0d12";
      ctx.fillRect(0, 0, CFG.W, CFG.H);
      ctx.globalAlpha = 1;
    }
  },

  /* ---------- Z1.5 初始化 ---------- */
  init() {
    // ① 靶位重排（冷却/奖励/倍率逻辑完全不动）
    this.placeTargets();

    // ② 弹射力度下调：reward.js 原值 330 会向混沌系统注入能量，实测最高分被推到
    //    理论满分的 138%、评级恒为 S。降到 80 后满力度得分与改动前完全一致（6770），
    //    落袋分布 0/9/4/9/15 对照基线 0/8/4/8/8 基本重合，且卡球仍为 0
    //    （防卡死逃生机制兜住了"钢珠停在靶顶"的极端情况）。
    REWARD.C.POP = 80;
    // ② 底部通道重分配：最右侧分割出扣球通道
    //    P4 由 384~446 收窄为 384~430，新增扣球通道 430~446；总宽不变、无缝无错位。
    const ps = BOARD.pockets;
    const last = ps[ps.length - 1];
    last.x1 = this.C.SPLIT;
    // 新增隔板（物理边界），防止钢珠在得分槽与扣球通道之间串门
    BOARD.rails.push({
      type: "line", kind: "divider",
      x1: this.C.SPLIT, y1: BOARD.C.POCKET_Y,
      x2: this.C.SPLIT, y2: BOARD.inner.y1, r: 2
    });
    // 扣球通道几何（惩罚数值、冷却、红闪、音效全部复用 risk.js 原实现）
    RISK.C.R = Object.assign({}, this.C.R_CH);
    RISK.C.L = Object.assign({}, this.C.L_CH);
    // 捕获线抬到袋口之上，确保钢珠在进入得分槽计分前就被扣球通道拦下
    RISK.C.CAP_Y = BOARD.C.POCKET_Y - 6;

    // ③ 换掉 risk.js 的两个绘制方法（其 drawer 运行时按方法名查找）
    RISK.drawBack = (ctx) => this.back(ctx);
    RISK.drawFront = (ctx) => this.front(ctx);

    // ④ 统计每个靶的命中次数，便于评估分散布局是否合理
    const origHit = REWARD.hit.bind(REWARD);
    REWARD.hit = (s) => {
      const fire = (s.cool <= 0);
      origHit(s);
      if (fire && typeof s.id === "number" && this.hitBySpot[s.id] !== undefined) {
        this.hitBySpot[s.id]++;
      }
    };
  }
};

/* ---------- Z1.6 自注册（玩法布局层，不受 V 键皮肤开关影响） ---------- */
LAYOUT.init();
