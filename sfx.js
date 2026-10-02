"use strict";
/* =========================================================
 * 迭代阶段 Z24：蓄力与击发音效 SFX
 * 职责：① 蓄力起始"咔哒"提示音（蓄力嗡鸣本身由 audio.js 提供，
 *          会随力度升高音量与音高，二者构成完整蓄力听感）
 *       ② 钢珠击发音效：噪声爆冲 + 低频冲击 + 金属弹片，音量随力度
 *       ③ 静音兼容：M 键一键静音并写入 localStorage；音频不可用时静默降级
 * 非阻塞：全部为 Web Audio 节点现场合成，无解码 / 无网络请求；
 *         噪声缓冲仅首次生成一次（0.2s≈8820 采样，主线程 <1ms），
 *         每个节点都在 0.2s 内 stop() 自动回收，不会累积占用。
 * 零侵入：只包装 PLAY.fire 与 AUDIO.setEnabled，
 *         不改 audio.js / game.js / balls.js 任何一行。
 * 学习演示用途，仅虚拟弹珠与虚拟积分，无任何兑换功能。
 * ========================================================= */

const SFX = {
  /* ---------- Z24.1 参数 ---------- */
  C: {
    KEY: "play_pachinko_mute",   // 静音状态的存储键
    LAUNCH_NOISE: 0.16,          // 击发噪声音量上限
    LAUNCH_THUMP: 0.20,          // 击发低频冲击音量上限
    LAUNCH_CLICK: 0.10,          // 击发金属弹片音量上限
    CLICK_V: 0.09,               // 蓄力起始咔哒音量
    HIDE_Y: 700                  // 静音指示位置
  },

  muted: false,
  noise: null,          // 复用同一份噪声缓冲
  wasCharging: false,
  _drawer: null, enabled: true,

  /* ---------- Z24.2 静音状态持久化 ---------- */
  load() {
    this.muted = false;
    try {
      if (typeof localStorage === "undefined") return;
      this.muted = localStorage.getItem(this.C.KEY) === "1";
    } catch (e) { this.muted = false; }
  },
  save() {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(this.C.KEY, this.muted ? "1" : "0");
    } catch (e) { /* 存储不可用时静默降级 */ }
  },

  /* ---------- Z24.3 生效主增益：静音 或 模块总开关关闭 都归零 ---------- */
  applyGain() {
    if (!AUDIO.master) return;
    const on = AUDIO.enabled && !this.muted;
    try { AUDIO.master.gain.value = on ? AUDIO.C.MASTER : 0; } catch (e) { /* 忽略 */ }
  },
  toggleMute() {
    this.muted = !this.muted;
    this.save();
    this.applyGain();
  },

  /* ---------- Z24.4 噪声缓冲：只生成一次 ---------- */
  getNoise() {
    const ac = AUDIO.ac;
    if (!ac) return null;
    if (this.noise) return this.noise;
    const len = Math.floor(ac.sampleRate * 0.2);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    // 确定性伪随机（同一次加载内固定），避免 Math.random 带来的不可复现
    let seed = 12345;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (seed / 0x3fffffff) - 1;
    }
    this.noise = buf;
    return buf;
  },

  /* ---------- Z24.5 发声基元 ---------- */
  tone(freq, dur, vol, type, freq2) {
    const ac = AUDIO.ac;
    if (!ac || !this.enabled || this.muted) return;
    const t = ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    if (freq2) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(0.008, dur * 0.25));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(AUDIO.master);
    o.start(t); o.stop(t + dur + 0.02);     // 自动回收，不累积
  },
  noiseBurst(dur, vol, freq, q) {
    const ac = AUDIO.ac;
    const buf = this.getNoise();
    if (!ac || !buf || !this.enabled || this.muted) return;
    const t = ac.currentTime;
    const s = ac.createBufferSource();
    s.buffer = buf;
    const bp = ac.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = q || 1.2;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(bp); bp.connect(g); g.connect(AUDIO.master);
    s.start(t); s.stop(t + dur + 0.02);
  },

  /* ---------- Z24.6 蓄力起始咔哒 ---------- */
  chargeStart() {
    this.noiseBurst(0.05, this.C.CLICK_V, 2600, 1.6);
    this.tone(520, 0.06, this.C.CLICK_V * 0.8, "square", 700);
  },

  /* ---------- Z24.7 钢珠击发：音量与音色随力度 ---------- */
  launch(power) {
    const p = Math.max(0, Math.min(1, power || 0));
    const k = 0.45 + 0.55 * p;                       // 力度越大越响
    // ① 机械冲程噪声（越猛越亮）
    this.noiseBurst(0.10, this.C.LAUNCH_NOISE * k, 900 + 900 * p, 0.9);
    // ② 低频冲击（弹簧推杆的闷响）
    this.tone(120 + 40 * p, 0.13, this.C.LAUNCH_THUMP * k, "sine", 48);
    // ③ 金属弹片（发射卡扣）
    this.tone(1500 + 500 * p, 0.045, this.C.LAUNCH_CLICK * k, "triangle", 900);
  },

  /* ---------- Z24.8 逻辑帧：检测蓄力起始（上升沿） ---------- */
  update() {
    if (PLAY.charging && !this.wasCharging) this.chargeStart();
    this.wasCharging = !!PLAY.charging;
  },

  /* ---------- Z24.9 静音指示（仅静音时绘制一行小字） ---------- */
  draw(ctx) {
    if (!this.muted) return;
    ctx.font = "11px monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(255,150,120,0.9)";
    ctx.fillText("已静音 (M 恢复)", CFG.W - 12, this.C.HIDE_Y);
    ctx.textAlign = "left";
  },

  /* ---------- Z24.10 初始化 ---------- */
  init() {
    this.load();

    // 包装发射：先取力度，再放行原逻辑，然后发声
    const origFire = PLAY.fire.bind(PLAY);
    PLAY.fire = () => {
      const p = PLAY.charge;
      origFire();
      this.launch(p);
    };

    // 包装音频总开关，保证"V 关音频"与"M 静音"两个状态不互相覆盖
    const origSet = AUDIO.setEnabled.bind(AUDIO);
    AUDIO.setEnabled = (b) => { origSet(b); this.applyGain(); };

    // M 键静音切换（与 V 键皮肤切换互不干扰）
    window.addEventListener("keydown", (e) => {
      if (e.code !== "KeyM" || e.repeat) return;
      e.preventDefault();
      this.toggleMute();
    });

    // 音频就绪后再同步一次增益（用户首次手势解锁后）
    window.addEventListener("pointerdown", () => this.applyGain(), { passive: true });
    window.addEventListener("keydown", () => this.applyGain(), { passive: true });

    // 静音指示层：插在玻璃层之前
    this._drawer = (ctx) => this.draw(ctx);
    const gi = GAME.drawers.findIndex((f) => /GLASS\s*\./.test(String(f)));
    if (gi >= 0) GAME.drawers.splice(gi, 0, this._drawer);
    else GAME.drawers.push(this._drawer);

    this.enabled = true;
  }
};

/* ---------- Z24.11 自注册 ---------- */
SFX.init();
GAME.updaters.push(() => SFX.update());
