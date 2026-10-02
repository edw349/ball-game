"use strict";
/* =========================================================
 * 增量阶段 X3：开局欢迎界面 WELCOME
 * 职责：打开网页先显示欢迎页（Canvas 绘制 + 操作说明），
 *       点击【开始游戏】后才进入主游戏。
 * 实现要点：
 *   ① 用 GAME.paused 冻结逻辑帧（index.html 主循环原生支持）
 *   ② 用 GAME.over 屏蔽空格发射（PLAY 的 keydown 原生检查该标志）
 *   ③ 动画在绘制回调里用 performance.now() 计时，因为逻辑帧被冻结
 * 不修改任何既有文件；不引入外部图片与音频资源。
 * 学习演示用途，仅虚拟弹珠与虚拟积分，无任何兑换功能。
 * ========================================================= */

const WELCOME = {
  /* ---------- X3.1 参数 ---------- */
  C: {
    PANEL: { x: 56, y: 132, w: 368, h: 452 },
    BTN: { x: 168, y: 508, w: 144, h: 46 },
    TITLE: "柏青哥技术演示 Demo",
    SUB: "编程学习演示 · 仅虚拟弹珠与虚拟积分",
    LINES: [
      "【空格按住蓄力，松开空格发射钢珠】",
      "【P 键 打开参数调试面板】",
      "",
      "V 键    切换 实体机台皮肤 / 简易版",
      "松手前 1.2 秒自动发射（力度 = 初速度）",
      "中央 P2 袋 100 分 · 连击可叠到 ×3 倍率",
      "右侧暗红通道 = 风险区，落入扣 2 颗钢珠",
      "打满高分的奖励靶可获得加分与赠球",
      "50 颗钢珠打完，弹出结算与 S/A/B/C/D 评级"
    ],
    FOOT: "本页面无任何充值、兑换、现金功能，仅供编程学习"
  },

  active: true,
  t0: 0,

  /* ---------- X3.2 命中测试 ---------- */
  hit(p, b) {
    return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  },
  toLogical(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (CFG.W / r.width),
      y: (e.clientY - r.top) * (CFG.H / r.height)
    };
  },

  /* ---------- X3.3 开始游戏 ---------- */
  start() {
    if (!this.active) return;
    this.active = false;
    GAME.over = false;      // 放开 PLAY 的空格发射
    GAME.paused = false;    // 恢复逻辑帧
  },

  /* ---------- X3.4 绘制 ---------- */
  draw(ctx) {
    if (!this.active) return;
    const C = this.C, P = C.PANEL, B = C.BTN;
    const now = performance.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(now * 3.0);          // 按钮呼吸
    const scan = (now * 40) % 4;                            // 缓慢扫描线

    // 整体压暗（把已经画好的游戏画面盖住，形成"幕布"感）
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(4,8,16,0.90)";
    ctx.fillRect(0, 0, CFG.W, CFG.H);

    // 面板：金属外框 + 内凹屏
    const lg = ctx.createLinearGradient(P.x, P.y, P.x + P.w, P.y + P.h);
    lg.addColorStop(0.00, "#dfe7f2");
    lg.addColorStop(0.20, "#8b98ab");
    lg.addColorStop(0.55, "#3b475c");
    lg.addColorStop(1.00, "#121a26");
    ctx.fillStyle = lg;
    ctx.fillRect(P.x, P.y, P.w, P.h);
    ctx.fillStyle = "#080e1a";
    ctx.fillRect(P.x + 6, P.y + 6, P.w - 12, P.h - 12);
    ctx.strokeStyle = "rgba(226,190,110,0.55)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(P.x + 9.5, P.y + 9.5, P.w - 19, P.h - 19);

    // 面板内扫描线（老式屏幕质感，透明度很低）
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = "#9fd0ff";
    for (let y = P.y + 10; y < P.y + P.h - 10; y += 4) ctx.fillRect(P.x + 8, y, P.w - 16, 1);
    ctx.globalAlpha = 1;

    // 标题（带辉光）
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "bold 24px monospace";
    ctx.shadowColor = "#22c9ff";
    ctx.shadowBlur = 16;
    ctx.fillStyle = "#eaf4ff";
    ctx.fillText(C.TITLE, CFG.W / 2, P.y + 30);
    ctx.shadowBlur = 0;

    ctx.font = "12px monospace";
    ctx.fillStyle = "rgba(150,190,255,0.9)";
    ctx.fillText(C.SUB, CFG.W / 2, P.y + 62);

    // 分隔线
    ctx.strokeStyle = "rgba(150,190,255,0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(P.x + 34, P.y + 88); ctx.lineTo(P.x + P.w - 34, P.y + 88);
    ctx.stroke();

    // 操作说明
    ctx.textAlign = "left";
    for (let i = 0; i < C.LINES.length; i++) {
      const s = C.LINES[i];
      if (!s) continue;
      const emphasis = (i < 2);                   // 前两行是核心操作，高亮
      ctx.font = emphasis ? "bold 13px monospace" : "12px monospace";
      ctx.fillStyle = emphasis ? "#ffd27a" : "rgba(178,208,248,0.92)";
      ctx.fillText(s, P.x + 34, P.y + 104 + i * 22);
    }

    // 开始按钮（呼吸描边 + 内渐亮）
    const bg = ctx.createLinearGradient(B.x, B.y, B.x, B.y + B.h);
    bg.addColorStop(0, "#1d5f6b");
    bg.addColorStop(1, "#0d2f3a");
    ctx.fillStyle = bg;
    ctx.fillRect(B.x, B.y, B.w, B.h);
    ctx.strokeStyle = "rgba(79,209,197," + (0.55 + 0.45 * pulse).toFixed(3) + ")";
    ctx.lineWidth = 2 + pulse;
    ctx.strokeRect(B.x + 1, B.y + 1, B.w - 2, B.h - 2);
    ctx.textAlign = "center";
    ctx.font = "bold 18px monospace";
    ctx.fillStyle = "#dffaf7";
    ctx.fillText("开 始 游 戏", B.x + B.w / 2, B.y + 13);

    // 底部提示与移动扫描线
    ctx.font = "10px monospace";
    ctx.fillStyle = "rgba(120,155,200,0.85)";
    ctx.fillText("点击屏幕任意位置 / 按回车 进入游戏（首次点击同时解锁音效）", CFG.W / 2, P.y + P.h - 30);
    ctx.fillStyle = "rgba(120,155,200,0.7)";
    ctx.fillText(C.FOOT, CFG.W / 2, P.y + P.h - 14);

    // 缓慢下移的扫描亮线（纯装饰，透明度极低）
    ctx.globalAlpha = 0.10;
    ctx.fillStyle = "#bfe6ff";
    ctx.fillRect(P.x + 8, P.y + 10 + scan, P.w - 16, 2);
    ctx.globalAlpha = 1;
  },

  /* ---------- X3.5 初始化 ---------- */
  init() {
    // 进入欢迎页：冻结逻辑帧 + 屏蔽空格发射
    GAME.paused = true;
    GAME.over = true;

    // 欢迎层画在最顶层（连调试面板也一并盖住，与"未开局"语义一致）
    GAME.drawers.push((ctx) => this.draw(ctx));

    canvas.addEventListener("pointerdown", (e) => {
      if (!this.active) return;
      if (this.hit(this.toLogical(e), this.C.BTN)) this.start();
    });
    // 回车也能开始，方便纯键盘操作
    window.addEventListener("keydown", (e) => {
      if (!this.active) return;
      if (e.code === "Enter" || e.code === "NumpadEnter") {
        e.preventDefault();
        this.start();
      }
    });
  }
};

/* ---------- X3.6 自注册 ---------- */
WELCOME.init();
