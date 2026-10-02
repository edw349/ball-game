"use strict";
/* =========================================================
 * 增量阶段 Y1：对局结算评级 RANK
 * 职责：结算弹窗下方增加 S/A/B/C/D 评级、趣味评语、
 *       距下一评级还差多少分，以及一条进度条。
 * 判定依据：本局得分 / 理论满分。
 *   理论满分 14700 = 50 颗球全部入 P2(100 分) 且倍率链吃满 ×3：
 *   第1球×1=100，第2球×2=200，第3~50球×3=300 → 100+200+48×300。
 * 挂接方式：只追加一个渲染层，不修改 state.js / life.js / 任何物理代码。
 * 学习演示用途，仅虚拟弹珠与虚拟积分，无任何兑换功能。
 * ========================================================= */

const RANK = {
  /* ---------- Y1.1 参数：评级阈值按理论满分占比划分 ---------- */
  C: {
    THEORY: 14700,
    TIERS: [
      { g: "S", r: 0.50, col: "#ffd27a", glow: "#ff9a2e", msg: "神级发挥，这盘机台记住你了" },
      { g: "A", r: 0.30, col: "#8ff4ff", glow: "#22c9ff", msg: "表现优秀，发射手感已经很稳" },
      { g: "B", r: 0.15, col: "#9ee493", glow: "#3fbf6a", msg: "发挥普通，多试试不同力度" },
      { g: "C", r: 0.05, col: "#ffb066", glow: "#e07a2e", msg: "发挥欠佳，注意避开右侧风险道" },
      { g: "D", r: 0.00, col: "#9aa8bd", glow: "#5d6b7d", msg: "运气不佳，再来一局找找手感" }
    ],
    // 评级区布局（画在 state.js 结算面板正下方，面板底边 y=500）
    X: 90, Y: 508, W: 300
  },

  /* ---------- Y1.2 由得分推导评级 / 下一级 / 差距 ---------- */
  judge(score) {
    const C = this.C;
    const ratio = Math.max(0, score) / C.THEORY;
    let idx = C.TIERS.length - 1;
    for (let i = 0; i < C.TIERS.length; i++) {
      if (ratio >= C.TIERS[i].r) { idx = i; break; }
    }
    const cur = C.TIERS[idx];
    const next = (idx > 0) ? C.TIERS[idx - 1] : null;
    const need = next ? Math.max(0, Math.ceil(this.C.THEORY * next.r) - score) : 0;
    // 到下一级的进度（0~1），用于进度条
    const base = C.THEORY * cur.r;
    const target = next ? C.THEORY * next.r : C.THEORY;
    const prog = next ? Math.min(1, (score - base) / Math.max(1, target - base)) : 1;
    return { idx, cur, next, need, prog, ratio };
  },

  /* ---------- Y1.3 绘制：只在局终弹窗出现时叠加 ---------- */
  draw(ctx) {
    if (STATE.cur !== "over" || !STATE.snap) return;
    const j = this.judge(STATE.snap.score);
    const C = this.C, x = C.X, y = C.Y, w = C.W;

    // 分隔线：把评级区与上方结算面板在视觉上分段
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = "#4fd1c5";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 10, y - 6); ctx.lineTo(x + w - 10, y - 6);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // ① 大号评级字母（带辉光）
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "bold 46px monospace";
    ctx.shadowColor = j.cur.glow;
    ctx.shadowBlur = 14;
    ctx.fillStyle = j.cur.col;
    ctx.fillText(j.cur.g, x + 16, y + 2);
    ctx.shadowBlur = 0;

    // ② 评语
    ctx.font = "bold 12px monospace";
    ctx.fillStyle = "rgba(200,225,255,0.95)";
    ctx.fillText(j.cur.msg, x + 64, y + 6);

    // ③ 得分率
    ctx.font = "11px monospace";
    ctx.fillStyle = "rgba(140,180,240,0.85)";
    ctx.fillText("得分率 " + (j.ratio * 100).toFixed(1) + "%   (满分 " + C.THEORY + ")", x + 64, y + 24);

    // ④ 距离下一评级
    if (j.next) {
      ctx.fillStyle = j.next.col;
      ctx.fillText("距离 " + j.next.g + " 级还差 " + j.need + " 分", x + 64, y + 40);
      // 进度条
      const bx = x + 64, by = y + 56, bw = w - 80, bh = 6;
      ctx.fillStyle = "rgba(20,32,52,0.9)";
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = j.cur.col;
      ctx.fillRect(bx, by, bw * j.prog, bh);
      ctx.strokeStyle = "rgba(150,190,255,0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    } else {
      ctx.fillStyle = "#ffd27a";
      ctx.fillText("已达最高评级 · 满分挑战者", x + 64, y + 40);
    }
  },

  /* ---------- Y1.4 初始化：插在 DEBUG 之前（压在结算面板之上） ---------- */
  init() {
    const drawer = (ctx) => this.draw(ctx);
    const di = GAME.drawers.findIndex((f) => /DEBUG\s*\./.test(String(f)));
    if (di >= 0) GAME.drawers.splice(di, 0, drawer);
    else GAME.drawers.push(drawer);
  }
};

/* ---------- Y1.5 自注册（纯展示层，无逻辑帧开销） ---------- */
RANK.init();
