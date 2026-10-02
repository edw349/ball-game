"use strict";
/* =========================================================
 * 冒烟测试（Node 环境，不依赖浏览器）
 * 做法：抽出 index.html 的内联脚本 + 5 个模块，在 vm 沙箱里
 *       用桩对象顶掉 canvas/window/documen，然后按 1/60 固定步长
 *       真实推演物理，检查：① 球能否入袋 ② 计分是否正确
 *       ③ 相同输入是否得到完全相同的轨迹（可复现性）
 * 用法：node smoke-test.js
 * ========================================================= */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DIR = __dirname;
const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");

// 取出 index.html 中唯一的那个内联 <script> ... </script>
const inline = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const gradStub = { addColorStop: () => {} };
const ctxStub = new Proxy({}, {
  // 未定义的成员一律当作"返回渐变对象"的空方法，兼容离屏渲染层
  get: (t, k) => (k in t ? t[k] : (() => gradStub)),
  set: (t, k, v) => { t[k] = v; return true; }
});
const canvasStub = {
  style: {},
  getContext: () => ctxStub,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 720 }),
  addEventListener: () => {}
};

const sandbox = {
  window: {
    devicePixelRatio: 1, innerWidth: 1200, innerHeight: 900,
    addEventListener: () => {}
  },
  document: {
    getElementById: () => canvasStub,
    createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub }),
    addEventListener: () => {}
  },
  performance: { now: () => 0 },
  requestAnimationFrame: () => {},
  // localStorage 桩：验证最高分读写路径（不污染真实浏览器存储）
  localStorage: (() => {
    const m = {};
    return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, __store: m };
  })(),
  console
};
sandbox.globalThis = sandbox;

// 严格按 index.html 里的 <script src> 顺序纳入模块，验证真实加载时序
const ordered = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
const extra = fs.readdirSync(DIR)
  .filter(f => f.endsWith(".js") && f !== "smoke-test.js" && !ordered.includes(f));
const modules = ordered.concat(extra).filter(f => fs.existsSync(path.join(DIR, f)));
console.log("加载顺序: " + modules.join(" → "));
const baseSrc = [inline, ...modules.map(f => fs.readFileSync(path.join(DIR, f), "utf8"))].join("\n;\n");
const src = baseSrc;

const driver = `
/* ---- 测试驱动 ---- */
function runGame(charge, shots, maxSteps) {
  PLAY.reset(); STATE.cur = "idle"; STATE.snap = null;
  let steps = 0;
  for (let s = 0; s < shots; s++) {
    // 每颗球：先推进到盘面清空，再发射下一颗
    let guard = 0;
    while ((BALLS.list.length > 0) && guard++ < maxSteps) { update(1/60); steps++; }
    update(1/60); steps++;               // 多跑一帧，让状态机把"局终"判定出来
    PLAY.charge = charge; PLAY.charging = true; PLAY.fire();
    guard = 0;
    while ((BALLS.list.length > 0) && guard++ < maxSteps) { update(1/60); steps++; }
    update(1/60); steps++;
  }
  return { score: GAME.score, stats: PLAY.stats.slice(), steps,
           state: STATE.cur, snapScore: STATE.snap ? STATE.snap.score : null };
}
const t0 = Date.now();
const runA = runGame(1.0, 50, 4000);   // 满力度 50 颗
const runB = runGame(1.0, 50, 4000);   // 重复一次，验证可复现
const runC = runGame(0.0, 50, 4000);   // 最低力度 50 颗
const out = {
  full: runA, again: runB, min: runC,
  reproducible: JSON.stringify(runA) === JSON.stringify(runB),
  totalBalls: runA.stats.reduce((a,b)=>a+b,0),
  ms: Date.now() - t0,
  ballCountAfter: BALLS.list.length
};

/* 力度扫描：每个力度单独打一颗，看落袋分布 */
function sweep(charge) {
  PLAY.reset(); STATE.cur = "idle"; STATE.snap = null;
  PLAY.charge = charge; PLAY.charging = true; PLAY.fire();
  let g = 0;
  while (BALLS.list.length > 0 && g++ < 4000) update(1/60);
  return PLAY.stats.findIndex(v => v > 0);
}
out.sweep = [];
for (let c = 0; c <= 1.0001; c += 0.1) out.sweep.push({ c: +c.toFixed(2), p: sweep(c) });

/* ---- 奖励靶检查：落位净间隙 + 命中数 + 卡球检测 ---- */
out.reward = {
  spots: REWARD.spots.map((s, i) => {
    let mp = 1e9, mr = 1e9;
    for (const p of BOARD.pegs) mp = Math.min(mp, Math.hypot(s.x - p.x, s.y - p.y) - p.r - REWARD.C.R);
    for (const r of BOARD.rails) {
      const cp = (r.type === "line") ? BALLS.closestOnLine(s.x, s.y, r) : BALLS.closestOnArc(s.x, s.y, r);
      mr = Math.min(mr, Math.hypot(s.x - cp.x, s.y - cp.y) - r.r - REWARD.C.R);
    }
    return { name: s.name || ("靶" + i), x: s.x, y: s.y,
             peg: +mp.toFixed(1), rail: +mr.toFixed(1) };
  })
};
/* 混合力度 50 颗：统计卡球（触顶 1500 步）与靶命中 */
PLAY.reset(); STATE.cur = "idle"; REWARD.resetMult(); REWARD.hits = 0;
const charges = [1.0, 0.3, 0.6, 0.9, 0.4, 0.7, 0.2, 1.0, 0.5, 0.8];
let stuckN = 0, stepsAll = 0;
for (let s = 0; s < 50; s++) {
  let g = 0; while (BALLS.list.length && g++ < 1500) update(1/60);
  if (g >= 1500) stuckN++; stepsAll += g;
  PLAY.charge = charges[s % charges.length]; PLAY.charging = true; PLAY.fire();
  g = 0; while (BALLS.list.length && g++ < 1500) update(1/60);
  if (g >= 1500) stuckN++; stepsAll += g;
}
out.mixed = { score: GAME.score, stats: PLAY.stats.slice(), hits: REWARD.hits,
  stuck: stuckN, avg: Math.round(stepsAll / 100), mult: REWARD.mult,
  risk: (typeof RISK !== "undefined") ? RISK.hitsL + RISK.hitsR : 0,
  riskL: (typeof RISK !== "undefined") ? RISK.hitsL : 0,
  riskR: (typeof RISK !== "undefined") ? RISK.hitsR : 0,
  riskLost: (typeof RISK !== "undefined") ? RISK.lost : 0,
  comboBest: (typeof COMBO !== "undefined") ? COMBO.best : 0,
  hitBySpot: (typeof LAYOUT !== "undefined") ? LAYOUT.hitBySpot.slice() : [] };
/* 最高分读写与重开复位检查 */
/* 连击验证：不等落袋连续发射（模拟真实玩家连打，0.9s 一发） */
PLAY.reset(); STATE.cur = "idle"; REWARD.resetMult(); REWARD.hits = 0;
COMBO.resetRound(); COMBO.best = 0;
for (let s = 0; s < 10; s++) {
  PLAY.charge = 1.0; PLAY.charging = true; PLAY.fire();
  for (let i = 0; i < 54; i++) update(1/60);      // 0.9 秒间隔
}
let gc = 0; while (BALLS.list.length && gc++ < 20000) update(1/60);
out.comboFast = { best: COMBO.best, n: COMBO.n, done: BALLS.list.length === 0 };

out.judge = [out.mixed.score, out.full.score].map((sc) => {
  const j = RANK.judge(sc);
  return { score: sc, g: j.cur.g, next: j.next ? j.next.g : null, need: j.need, ratio: +(j.ratio * 100).toFixed(1) };
});
out.mech = {
  list: TRIGGERS.list.map((m) => ({ t: m.t, gap: m.gap })),
  dropped: TRIGGERS.dropped,
  hits: TRIGGERS.hits
};
out.life = {
  best: LIFE.best,
  stored: (typeof localStorage !== "undefined") ? localStorage.getItem("play_pachinko_best") : null,
  multAfterRestart: (PLAY.reset(), REWARD.mult),
  cooldownAfterRestart: REWARD.spots.reduce((a, s) => a + s.cool, 0)
};
globalThis.__out = out;
`;

vm.createContext(sandbox);
vm.runInContext(src + driver, sandbox, { filename: "combined.js" });

/* ---- 回退开关验证：把 UPGRADE 四个开关全关，物理结果必须逐位一致 ---- */
const offSrc = src.replace(
  "const UPGRADE = { bg: true, board: true, hud: true, audio: true, on: true };",
  "const UPGRADE = { bg: false, board: false, hud: false, audio: false, on: false };");
const offSandbox = JSON.parse(JSON.stringify({}));
Object.assign(offSandbox, sandbox, { __out: undefined });
offSandbox.window = sandbox.window; offSandbox.document = sandbox.document;
offSandbox.performance = sandbox.performance;
offSandbox.requestAnimationFrame = sandbox.requestAnimationFrame;
offSandbox.console = console;
offSandbox.globalThis = offSandbox;
vm.createContext(offSandbox);
vm.runInContext(offSrc + driver, offSandbox, { filename: "legacy.js" });
const off = offSandbox.__out;

const o = sandbox.__out;
const pct = (n) => (n / 50 * 100).toFixed(0) + "%";
console.log("满力度 50 颗  : 积分 " + o.full.score + "  命中分布 " + o.full.stats.join("/")
  + "  入袋 " + o.totalBalls + " 颗 (" + pct(o.totalBalls) + ")  步数 " + o.full.steps
  + "  末态 " + o.full.state);
console.log("最低力度 50 颗: 积分 " + o.min.score + "  命中分布 " + o.min.stats.join("/")
  + "  入袋 " + o.min.stats.reduce((a,b)=>a+b,0) + " 颗");
console.log("可复现        : " + o.reproducible + "   (两次满力度结果完全一致)");
console.log("结算快照积分  : " + o.full.snapScore + "  盘面残留球 " + o.ballCountAfter
  + "  耗时 " + o.ms + "ms");
console.log("力度扫描      : " + o.sweep.map(s => (s.c * 100) + "%→P" + s.p).join("  "));
const same = JSON.stringify(o.sweep) === JSON.stringify(off.sweep)
  && o.full.score === off.full.score && o.min.score === off.min.score;
console.log("回退开关(V键) : 升级开/关两模式物理结果 " + (same ? "完全一致 ✓" : "不一致 ✗")
  + "  (升级关: 满分 " + off.full.score + " / 最低分 " + off.min.score + ")");
const R = o.reward.spots;
const rOk = R.every(s => s.peg >= 6 && s.rail >= 6);
console.log("奖励靶落位    : " + R.map(s => s.name + "(" + s.x + "," + s.y + ")离钉" + s.peg).join("  ")
  + "  " + (rOk ? "✓ 无冲突" : "✗ 与钉子/导轨冲突"));
console.log("混合力度50颗  : " + o.mixed.score + " 分  分布 " + o.mixed.stats.join("/")
  + "  靶命中 " + o.mixed.hits + "  末倍率 ×" + o.mixed.mult
  + "  卡球 " + o.mixed.stuck + " 次  平均落袋 " + o.mixed.avg + " 步");
console.log("奖励靶命中分布: " + o.mixed.hitBySpot.join(" / ") + "  (顺序同上方落位)");
console.log("风险通道      : 触发 " + o.mixed.risk + " 次 (左 " + o.mixed.riskL + " / 右 " + o.mixed.riskR
  + ")  扣球 " + o.mixed.riskLost + " 颗");
// 评级系统自检：用实测分数验证分档、得分率与差值
console.log("评级判定      : " + o.judge.map((j) => j.score + "分(" + j.ratio + "%)→" + j.g
  + " 差" + (j.next ? j.next + " " + j.need + "分" : "已满级")).join("   "));
console.log("连击系统      : 单球串行最高 " + o.mixed.comboBest + " 连；"
  + "交叠连打(0.9s/发)最高 " + o.comboFast.best + " 连  "
  + (o.comboFast.best >= 2 ? "✓ 机制生效" : "✗ 未触发"));
console.log("最高分/重开   : 内存 " + o.life.best + "  localStorage " + o.life.stored
  + "  重开后倍率 ×" + o.life.multAfterRestart + "  靶冷却合计 " + o.life.cooldownAfterRestart
  + "  " + (o.life.best === Number(o.life.stored) && o.life.multAfterRestart === 1
            && o.life.cooldownAfterRestart === 0 ? "✓ 读写与复位正常" : "✗ 异常"));
// 被动机关：落位校验与命中统计
console.log("被动机关      : 生效 " + o.mech.list.length + " / 冲突剔除 " + o.mech.dropped
  + "  命中 " + o.mech.hits + " 次");
console.log("机关净间隙    : " + o.mech.list.map((m) => m.t + m.gap).join(" "));
