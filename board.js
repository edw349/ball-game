"use strict";
/* =========================================================
 * 阶段 2 模块：盘面几何 BOARD
 * 职责：只负责「盘面长什么样、墙/钉/袋在哪里」，不做物理与计分。
 *       所有坐标均为逻辑坐标；所有参数为固定常量，不含随机数。
 * 学习演示用途，仅虚拟弹珠与虚拟积分。
 * ========================================================= */

const BOARD = {
  /* ---------- 2.1 固定几何常量 ---------- */
  C: {
    FRAME: { x: 24, y: 84, w: 432, h: 612 }, // 外框外沿，底边 y = 696
    WALL: 10,                                 // 壁厚
    DX: 40,                                   // 钉阵水平间距
    ROWS: 10,                                 // 钉阵行数
    Y0: 205,                                  // 首行 y（须低于左内弧，避免与导轨重叠）
    CX: 240,                                  // 盘面纵向中轴
    PEGR: 3.5,                                // 钉半径
    POCKET_Y: 520,                            // 得分袋顶部 y
    RAIL_W: 6,                                // 导轨绘制线宽
    RAIL_R: 3                                 // 导轨碰撞半径（阶段 3 用）
  },

  pegs: [],   // 钉：{x, y, r}
  rails: [],  // 碰撞体：line | arc，供阶段 3 物理使用
  pockets: [],// 得分袋：{id, x0, x1, y0, y1}

  /* 内区边界（外框内壁） */
  inner: { x0: 34, y0: 94, x1: 446, y1: 686 },

  /* ---------- 2.2 构建几何数据（纯计算，幂等） ---------- */
  build() {
    const C = this.C;
    this.pegs.length = 0;
    this.rails.length = 0;
    this.pockets.length = 0;

    /* 内区边界由外框推导，避免两处硬编码不一致 */
    this.inner = {
      x0: C.FRAME.x + C.WALL,
      y0: C.FRAME.y + C.WALL,
      x1: C.FRAME.x + C.FRAME.w - C.WALL,
      y1: C.FRAME.y + C.FRAME.h - C.WALL
    };

    /* 钉阵：等边三角格。DY = DX * √3/2，保证相邻三钉等距 */
    const DY = C.DX * Math.sqrt(3) / 2; // ≈ 34.641
    for (let i = 0; i < C.ROWS; i++) {
      const y = C.Y0 + i * DY;
      const even = (i % 2 === 0);
      if (even) {
        // 偶行 9 钉，关于中轴对称：CX + (j-4)*DX
        for (let j = 0; j < 9; j++) {
          const x = C.CX + (j - 4) * C.DX;
          if (y <= 340 && j === 4) continue; // 剔除中央钉，形成中心通道
          this.pegs.push({ x, y, r: C.PEGR });
        }
      } else {
        // 奇行 8 钉，半格错位：CX + (j-3.5)*DX
        for (let j = 0; j < 8; j++) {
          const x = C.CX + (j - 3.5) * C.DX;
          this.pegs.push({ x, y, r: C.PEGR });
        }
      }
    }
    GAME.pegs = this.pegs; // 交给物理模块使用

    /* 球道 = 同心环道：内轨 r=78 / 外轨 r=102，半径差 24 = 道宽，球心走 r=90 中线 */
    const R = C.RAIL_R;
    // 内轨：左竖道 → 左内弧 → 顶轨 → 右内弧（球路内侧，右侧开口即入场点）
    this.rails.push({ type: "line", kind: "rail", x1: 58, y1: 686, x2: 58, y2: 210, r: R });
    /* 注意：r 是碰撞厚度，圆弧的几何半径一律写 rad，两者语义不可混用 */
    this.rails.push({ type: "arc", kind: "rail", cx: 136, cy: 210, rad: 78, a0: Math.PI, a1: Math.PI * 1.5, r: R });
    this.rails.push({ type: "line", kind: "rail", x1: 136, y1: 132, x2: 344, y2: 132, r: R });
    this.rails.push({ type: "arc", kind: "rail", cx: 344, cy: 210, rad: 78, a0: Math.PI * 1.5, a1: Math.PI * 2, r: R });
    // 外轨：与内轨同心，半径 +24；终点 (446,210) 与右内壁正好衔接
    this.rails.push({ type: "line", kind: "outer", x1: 34, y1: 686, x2: 34, y2: 210, r: R });
    this.rails.push({ type: "arc", kind: "outer", cx: 136, cy: 210, rad: 102, a0: Math.PI, a1: Math.PI * 1.5, r: R });
    this.rails.push({ type: "line", kind: "outer", x1: 136, y1: 108, x2: 344, y2: 108, r: R });
    this.rails.push({ type: "arc", kind: "outer", cx: 344, cy: 210, rad: 102, a0: Math.PI * 1.5, a1: Math.PI * 2, r: R });
    this.rails.push({ type: "line", kind: "outer", x1: 446, y1: 686, x2: 446, y2: 210, r: R });
    /* 右导向板：入场点 (434,210) 正下方，把球斜向导入钉阵中部。
       没有它，球会沿右侧空槽直落 P4，力度差异完全失去意义。 */
    this.rails.push({ type: "line", kind: "outer", x1: 447, y1: 225, x2: 390, y2: 305, r: R });

    /* 底部得分袋：仅定义几何区间，分值在阶段 4 处理 */
    const py0 = C.POCKET_Y, py1 = this.inner.y1;
    const ranges = [[34, 96], [96, 186], [186, 294], [294, 384], [384, 446]];
    ranges.forEach((rg, i) => {
      this.pockets.push({ id: i, x0: rg[0], x1: rg[1], y0: py0, y1: py1 });
      // 隔板同时是物理碰撞体（细墙，半径 2），防止球在袋间串门
      this.rails.push({ type: "line", kind: "divider", x1: rg[0], y1: py0, x2: rg[0], y2: py1, r: 2 });
    });
  },

  /* ---------- 2.3 绘制：每个子层单独函数，便于调试开关 ---------- */
  drawFrame(ctx) {
    const f = this.C.FRAME;
    // 外框（壁）→ 再在内区盖一层底板，自然形成边框
    ctx.fillStyle = "#1d2b46";
    ctx.fillRect(f.x, f.y, f.w, f.h);
    ctx.fillStyle = "#111a2e";
    ctx.fillRect(this.inner.x0, this.inner.y0, this.inner.x1 - this.inner.x0, this.inner.y1 - this.inner.y0);
    // 外框高光边
    ctx.strokeStyle = "#37f"; ctx.lineWidth = 1;
    ctx.strokeRect(f.x + 0.5, f.y + 0.5, f.w - 1, f.h - 1);
  },

  drawRails(ctx) {
    ctx.lineCap = "round";
    for (const r of this.rails) {
      if (r.kind === "divider") continue; // 隔板由 drawPockets 负责
      ctx.strokeStyle = (r.kind === "outer") ? "#41608f" : "#9fc4ff";
      ctx.lineWidth = (r.kind === "outer") ? 5 : this.C.RAIL_W;
      ctx.beginPath();
      if (r.type === "line") { ctx.moveTo(r.x1, r.y1); ctx.lineTo(r.x2, r.y2); }
      else { ctx.arc(r.cx, r.cy, r.rad, r.a0, r.a1); }
      ctx.stroke();
    }
  },

  drawPegs(ctx) {
    ctx.fillStyle = "#cfe0ff";
    for (const p of this.pegs) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  drawPockets(ctx) {
    for (const pk of this.pockets) {
      // 袋口底色
      ctx.fillStyle = (pk.id === 2) ? "#2a1f3a" : "#161f33";
      ctx.fillRect(pk.x0 + 3, pk.y0, pk.x1 - pk.x0 - 6, pk.y1 - pk.y0);
      // 隔板
      ctx.strokeStyle = "#5f7fb5"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(pk.x0, pk.y0); ctx.lineTo(pk.x0, pk.y1); ctx.stroke();
      // 编号
      ctx.fillStyle = "#7f9dd0"; ctx.font = "11px monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText("P" + pk.id, (pk.x0 + pk.x1) / 2, pk.y0 + 6);
    }
    // 最右侧封边
    ctx.strokeStyle = "#5f7fb5"; ctx.lineWidth = 4;
    const last = this.pockets[this.pockets.length - 1];
    ctx.beginPath(); ctx.moveTo(last.x1, last.y0); ctx.lineTo(last.x1, last.y1); ctx.stroke();
  },

  /* 模块总绘制入口，注册到 GAME.drawers */
  draw(ctx) {
    this.drawFrame(ctx);
    this.drawPockets(ctx);
    this.drawRails(ctx);
    this.drawPegs(ctx);
  }
};

/* ---------- 2.4 自注册：构建几何 + 挂入渲染管线 ---------- */
BOARD.build();
GAME.drawers.push((ctx) => BOARD.draw(ctx));
