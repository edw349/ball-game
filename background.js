"use strict";
/* =========================================================
 * 迭代阶段 Z23-R3：8-bit 像素卡通背景库 BACKGROUND
 * 职责：① 内置 6 套 8-bit 像素卡通背景，B 键循环切换
 *          鲸鱼 → 猫 → 狗 → 小人 → 城堡 → 汉堡包 → 回到鲸鱼
 *       ② 初始进入游戏固定为「像素卡通可爱鲸鱼」
 *       ③ 所有角色均由字符点阵 + 调色板逐像素方块绘制（无位图、无外部资源）
 * 层级：由 DEPTH.board 第一步绘制，永远位于最底层 ——
 *       钉子、钢珠、旋转挡板、底部得分通道、右侧扣球惩罚通道、
 *       顶部 UI 面板全部在其之上，不受任何遮挡。
 * 风格：柔和低饱和配色 + 统一蒙层压暗，画面干净，不干扰游戏判断。
 * 零侵入：只重烘焙 skin-board 的公开贴图属性 SKIN.print。
 * 学习演示用途，仅虚拟弹珠与虚拟积分，无任何兑换功能。
 * ========================================================= */

const BACKGROUND = {
  /* ---------- Z23.1 通用参数 ---------- */
  C: {
    PX: 9,             // 主角像素方块边长（8-bit 颗粒感）
    PX_SMALL: 5,       // 装饰像素方块边长
    SCRIM: 0.20,       // 蒙层强度（统一压暗，保证主体清晰）
    VIGNETTE: 0.32,    // 边缘暗角
    SPECK: 1100,       // 细噪点数量
    TOAST: 1.8         // 切换背景时名称提示的停留秒数
  },

  /* ---------- Z23.2 点阵素材 ---------- */
  /* 通用调色板键：b 主体 / w 白 / E 眼睛 / s 浅色 / T 尾部或暗部 / m 嘴 / a 点缀 */
  ART: {
    whale: [
      "......w.........",
      ".....www........",
      "....bbbbbbb.....",
      "..bbbbbbbbbbbb..",
      ".bbbbbbbbbbbbbb.",
      ".bEbbbbbbbbbbbbT",
      ".bbbbbbbbbbbbbTT",
      ".bbbbbbbbbbbbTTT",
      "..bbbbbbbbbb.TT.",
      "...ssssssss.....",
      "....ssssss......"
    ],
    cat: [
      "..b..........b..",
      "..bb........bb..",
      "..bbbbbbbbbbbb..",
      ".bbbbbbbbbbbbbb.",
      ".bbEbbbbbbEbbbb.",
      ".bbbbbbbbbbbbbb.",
      ".bbb..mm..bbbbb.",
      "..bbbbbbbbbbbb..",
      "...bbbbbbbbbb...",
      "...bssssssssb...",
      "..bbbbbbbbbbbb..",
      "..bb..bbbb..bb..",
      "..bb..bbbb..bb..",
      "...ss......ss..."
    ],
    dog: [
      "..bb........bb..",
      "..bbb......bbb..",
      "..bbbbbbbbbbbb..",
      ".bbbbbbbbbbbbbb.",
      ".bbEbbbbbbEbbbb.",
      ".bbbbbbbbbbbbbb.",
      ".bbbmmmmmmmbbbb.",
      "..bbb.wwww.bbb..",
      "..bbbbbbbbbbbb..",
      "...bbbbbbbbbb...",
      "...ssssssssss...",
      "..bbbbbbbbbbbb..",
      "..bb..bbbb..bb..",
      "...ss......ss..."
    ],
    kid: [
      "....aaaaaa......",
      "...aaaaaaaa.....",
      "..aaadddddaa....",
      "..bdddddddddb...",
      "..bdddddddddb...",
      "..bdEbbbbbEdb...",
      "..bdddddddddb...",
      "...dddmmdddd....",
      "....ddddddd.....",
      "...ccccccccc....",
      "..cccaaaaaccc...",
      "..ccccccccccc...",
      "...ccccccccc....",
      "...CC.....CC....",
      "...ss.....ss...."
    ],
    castle: [
      "..T....T....T...",
      ".TTT..TTT..TTT..",
      ".bTb..bTb..bTb..",
      ".bbbbbbbbbbbbbb.",
      ".bbbbbbbbbbbbbb.",
      ".bbbwbbbbbbwbbb.",
      ".bbbwbbbbbbwbbb.",
      ".bbbbbbbbbbbbbb.",
      ".bbbbbwwwwbbbbb.",
      ".bbbbbw..wbbbbb.",
      ".bbbbbw..wbbbbb.",
      ".ssssssssssssss.",
      ".ss..ssssss..ss.",
      ".ss..ssssss..ss."
    ],
    burger: [
      "....aaaaaaaa....",
      "..aaaaaaaaaaaa..",
      ".aaaaaaaaaaaaaa.",
      "aaaaaaaaaaaaaaaa",
      "ssssssssssssssss",
      ".gggggggggggggg.",
      "gggggggggggggggg",
      ".bbbbbbbbbbbbbb.",
      "bbbbbbbbbbbbbbbb",
      "ssssssssssssssss",
      ".aaaaaaaaaaaaaa.",
      "..aaaaaaaaaaaa..",
      "....aaaaaaaa...."
    ]
  },

  /* ---------- Z23.3 六套背景定义（顺序即切换顺序） ---------- */
  BGS: [
    {
      name: "像素卡通可爱鲸鱼",
      base: ["#2b3f66", "#22315a", "#1b2545"],
      pal: { b: "#7fd6e8", w: "#ffffff", E: "#2f3350", s: "#bfeaf5", T: "#5cc0d8" },
      art: "whale", scale: 1.25, dy: 0.26, deco: "bubble"
    },
    {
      name: "像素卡通可爱猫",
      base: ["#4a3a5e", "#3b3050", "#2c2740"],
      pal: { b: "#f0b48c", w: "#ffffff", E: "#3a2b40", s: "#ffe0c4", m: "#c96b7a" },
      art: "cat", scale: 1.15, dy: 0.24, deco: "heart"
    },
    {
      name: "像素卡通可爱狗",
      base: ["#5a4636", "#463528", "#33261c"],
      pal: { b: "#d9a86c", w: "#ffffff", E: "#33261c", s: "#f2d5ae", m: "#8a5a3a" },
      art: "dog", scale: 1.15, dy: 0.24, deco: "star"
    },
    {
      name: "像素卡通可爱小人",
      base: ["#3a4a6a", "#2f3d59", "#242e46"],
      pal: { a: "#ff9ec4", d: "#ffe4d2", b: "#9a8ad8", E: "#3b3a5c",
             m: "#cf7183", c: "#5fc9dc", C: "#3f95ab", s: "#ffe4d2" },
      art: "kid", scale: 1.15, dy: 0.24, deco: "star"
    },
    {
      name: "像素卡通可爱城堡",
      base: ["#2f4468", "#26375a", "#1d2a46"],
      pal: { b: "#b8c6e0", w: "#ffe9a8", T: "#e07a7a", s: "#8ea3c4" },
      art: "castle", scale: 1.05, dy: 0.26, deco: "cloud"
    },
    {
      name: "像素卡通可爱汉堡包",
      base: ["#6a4a34", "#543a28", "#3d2a1c"],
      pal: { a: "#f0b96c", g: "#8fd08a", b: "#a4603a", s: "#ffe0b0" },
      art: "burger", scale: 1.15, dy: 0.26, deco: "sparkle"
    }
  ],

  idx: 0,            // 当前背景序号（初始 0 = 鲸鱼）
  toast: 0,          // 切换提示计时
  _orig: null, enabled: false, _drawer: null,

  off(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  },
  /* 确定性哈希（无随机数，同一背景每次加载图案一致） */
  h1(i, k) {
    const n = Math.sin(i * 12.9898 + (k || 0) * 78.233) * 43758.5453;
    return n - Math.floor(n);
  },

  /* ---------- Z23.4 绘制点阵 ---------- */
  stamp(g, map, pal, px, ox, oy, alpha) {
    g.globalAlpha = alpha === undefined ? 1 : alpha;
    for (let r = 0; r < map.length; r++) {
      const row = map[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === "." || ch === " ") continue;
        const col = pal[ch];
        if (!col) continue;
        g.fillStyle = col;
        g.fillRect(ox + c * px, oy + r * px, px, px);
      }
    }
    g.globalAlpha = 1;
  },

  /* ---------- Z23.5 按序号烘焙背板 ---------- */
  bake(i) {
    const I = BOARD.inner;
    const W = I.x1 - I.x0, H = I.y1 - I.y0;
    const C = this.C;
    const def = this.BGS[i % this.BGS.length];
    const c = this.off(W, H), g = c.getContext("2d");

    // ① 柔和渐变底
    const base = g.createLinearGradient(0, 0, 0, H);
    base.addColorStop(0.00, def.base[0]);
    base.addColorStop(0.42, def.base[1]);
    base.addColorStop(1.00, def.base[2]);
    g.fillStyle = base; g.fillRect(0, 0, W, H);

    // ② 主角背后的柔光
    const glow = g.createRadialGradient(W * 0.5, H * 0.34, 8, W * 0.5, H * 0.34, H * 0.46);
    glow.addColorStop(0.00, "rgba(200,190,255,0.26)");
    glow.addColorStop(0.55, "rgba(170,170,240,0.10)");
    glow.addColorStop(1.00, "rgba(170,170,240,0)");
    g.fillStyle = glow; g.fillRect(0, 0, W, H);

    // ③ 装饰元素（每套不同，弱化处理，确定性分布）
    const S = C.PX_SMALL;
    const decoColor = { bubble: "#cfeaff", heart: "#ff9ec4", star: "#ffe9a8",
                        cloud: "#dbe6f8", sparkle: "#ffeaa8" }[def.deco] || "#ffe9a8";
    for (let k = 0; k < 34; k++) {
      const x = this.h1(k, i * 3 + 2) * W;
      const y = this.h1(k, i * 3 + 3) * H;
      const a = 0.12 + 0.18 * this.h1(k, i * 3 + 4);
      g.globalAlpha = a;
      g.fillStyle = decoColor;
      if (def.deco === "bubble") {                       // 像素气泡环
        g.fillRect(x - S, y - S, S, S); g.fillRect(x + S, y - S, S, S);
        g.fillRect(x - S, y + S, S, S); g.fillRect(x + S, y + S, S, S);
      } else if (def.deco === "heart") {                 // 像素爱心
        this.stamp(g, ["aa.aa", "aaaaa", "aaaaa", ".aaa.", "..a.."],
                   { a: decoColor }, S, x, y, a);
      } else if (def.deco === "cloud") {                 // 像素云块
        g.fillRect(x, y, S * 3, S); g.fillRect(x + S, y - S, S * 2, S);
      } else if (def.deco === "star") {                  // 像素十字星
        g.fillRect(x, y - S, S, S); g.fillRect(x - S, y, S, S);
        g.fillRect(x + S, y, S, S); g.fillRect(x, y + S, S, S); g.fillRect(x, y, S, S);
      } else {                                           // sparkle：2×2 亮点
        g.fillRect(x, y, S, S);
      }
      g.globalAlpha = 1;
    }

    // ④ 主角点阵（居中偏上，位于钉阵背后）
    const art = this.ART[def.art];
    const px = C.PX * (def.scale || 1);
    let cols = 0;
    for (const r of art) cols = Math.max(cols, r.length);
    const aw = cols * px, ah = art.length * px;
    const ax = Math.round((W - aw) / 2);
    const ay = Math.round(H * (def.dy === undefined ? 0.24 : def.dy));
    g.globalAlpha = 0.16;                                // 像素底影
    g.fillStyle = "#12172b";
    g.fillRect(ax + px * 2, ay + ah + px * 0.5, aw - px * 4, px);
    g.globalAlpha = 1;
    this.stamp(g, art, def.pal, px, ax, ay, 0.90);

    // ⑤ 细噪点（保留像素屏颗粒感）
    for (let k = 0; k < C.SPECK; k++) {
      const x = this.h1(k, 6) * W, y = this.h1(k, 7) * H;
      const b = this.h1(k, 8);
      g.fillStyle = b > 0.5
        ? "rgba(232,236,252," + (0.05 + 0.07 * b).toFixed(3) + ")"
        : "rgba(0,0,0," + (0.06 + 0.08 * b).toFixed(3) + ")";
      g.fillRect(x, y, 1, 1);
    }

    // ⑥ 统一蒙层：压低亮度，保证钉子/钢珠/挡板对比充足
    g.fillStyle = "rgba(10,13,26," + C.SCRIM + ")";
    g.fillRect(0, 0, W, H);

    // ⑦ 边缘暗角 + 内嵌接缝
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.30, W / 2, H / 2, H * 0.78);
    vg.addColorStop(0.00, "rgba(0,0,0,0)");
    vg.addColorStop(0.65, "rgba(0,0,0,0.16)");
    vg.addColorStop(1.00, "rgba(0,0,0," + C.VIGNETTE + ")");
    g.fillStyle = vg; g.fillRect(0, 0, W, H);

    g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 5;
    g.strokeRect(2.5, 2.5, W - 5, H - 5);
    g.strokeStyle = "rgba(190,214,244,0.20)"; g.lineWidth = 1;
    g.strokeRect(5.5, 5.5, W - 11, H - 11);

    return c;
  },

  /* ---------- Z23.6 应用当前背景 ---------- */
  apply() {
    if (!this.enabled) return;
    SKIN.print = this.bake(this.idx);
  },
  next() {
    this.idx = (this.idx + 1) % this.BGS.length;
    this.apply();
    this.toast = this.C.TOAST;
  },
  currentName() { return this.BGS[this.idx % this.BGS.length].name; },

  /* ---------- Z23.7 切换提示（右下角小字，1.8 秒后消失） ---------- */
  update(dt) { if (this.toast > 0) this.toast -= dt; },
  draw(ctx) {
    if (this.toast <= 0 || !this.enabled) return;
    const a = Math.min(1, this.toast / 0.5);
    ctx.globalAlpha = a * 0.92;
    ctx.font = "12px monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(8,12,22,0.75)";
    ctx.fillRect(CFG.W - 196, 694, 188, 22);
    ctx.fillStyle = "#8ff4ff";
    ctx.fillText("背景 " + this.currentName() + "  (B 切换)", CFG.W - 12, 699);
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
  },

  /* ---------- Z23.8 初始化 ---------- */
  init() {
    this._orig = SKIN.print;
    this.idx = 0;                       // 初始固定为「像素卡通可爱鲸鱼」
    this.enabled = true;
    this.apply();

    // B 键循环切换（与 P 调试 / V 皮肤 / M 静音互不冲突）
    window.addEventListener("keydown", (e) => {
      if (e.code !== "KeyB" || e.repeat) return;
      e.preventDefault();
      this.next();
    });

    // 提示层：插在玻璃层之前
    this._drawer = (ctx) => this.draw(ctx);
    const gi = GAME.drawers.findIndex((f) => /GLASS\s*\./.test(String(f)));
    if (gi >= 0) GAME.drawers.splice(gi, 0, this._drawer);
    else GAME.drawers.push(this._drawer);
  },

  /* ---------- Z23.9 总开关：跟随盘面皮肤 ---------- */
  setEnabled(b) {
    b = !!b;
    if (b === this.enabled || !this._orig) return;
    this.enabled = b;
    if (b) this.apply();
    else SKIN.print = this._orig;
  }
};

/* ---------- Z23.10 自注册 ---------- */
if (typeof UPGRADE === "undefined" || UPGRADE.board) BACKGROUND.init();
GAME.updaters.push((dt) => BACKGROUND.update(dt));
