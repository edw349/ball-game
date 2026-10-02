"use strict";
/* =========================================================
 * 视觉/音频升级 阶段 V1：音频模块 AUDIO
 * 职责：WebAudio 现场合成全部音效，不引入任何外部音频文件。
 * 挂接方式：只包装 BALLS.bounce / BALLS.onEnterPocket，
 *           不修改物理、计分、状态机任何一行逻辑。
 * 学习演示用途，仅虚拟弹珠与虚拟积分，无任何兑换功能。
 * ========================================================= */

const AUDIO = {
  /* ---------- V1.1 参数 ---------- */
  C: {
    MASTER: 0.30,      // 总音量（保护听力，别调太大）
    HUM_F1: 56,        // 蓄力嗡鸣基频
    HUM_F2: 56.6,      // 轻微失谐 → 产生慢拍频，听感更"蓄力"
    HUM_MIN: 0.05,     // 最小力度时的嗡鸣音量
    HUM_MAX: 0.55,     // 满力度音量
    PEG_F0: 1500,      // 撞击叮声最低频
    PEG_F1: 3200,      // 撞击叮声最高频
    PEG_COOL: 0.018,   // 撞击音最小间隔，防密集爆音
    PEG_VOICES: 6,     // 同时发声上限
    PK_COOL: 0.06      // 入袋音最小间隔
  },

  ac: null, master: null, hum: null, humGain: null,
  pegCool: 0, pkCool: 0, voices: 0,
  lastOver: false, enabled: true,

  /* ---------- V1.11 总开关：热切换（V 键调用） ---------- */
  setEnabled(b) {
    this.enabled = !!b;
    if (!b) this.humStop();
    if (this.master) this.master.gain.value = b ? this.C.MASTER : 0;
  },

  /* ---------- V1.2 初始化：必须由用户手势触发（浏览器自动播放策略） ---------- */
  init() {
    if (this.ac) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;                       // 环境不支持则静默降级，不影响游戏
    try { this.ac = new AC(); } catch (e) { return; }
    this.master = this.ac.createGain();
    this.master.gain.value = this.C.MASTER;
    this.master.connect(this.ac.destination);
    if (this.ac.state === "suspended") this.ac.resume();
    this.wrap();
  },

  /* ---------- V1.3 包装物理层：拿到撞击与入袋事件（不改原文件） ---------- */
  wrap() {
    if (this.wrapped) return;
    this.wrapped = true;

    const origBounce = BALLS.bounce.bind(BALLS);
    BALLS.bounce = (b, nx, ny, dist, minD, e, dt) => {
      const applied = origBounce(b, nx, ny, dist, minD, e, dt);
      if (applied) this.onCollide(b);      // 仅在真正施加了冲量时发声
      return applied;
    };

    const prevPocket = BALLS.onEnterPocket; // 再包一层，保留 PLAY 计分与 FX 特效
    BALLS.onEnterPocket = (b, id) => {
      if (prevPocket) prevPocket(b, id);
      this.onPocket(id);
    };
  },

  /* ---------- V1.4 基础发声基元：一个带包络的振荡器 ---------- */
  note(freq, delay, dur, vol, type) {
    const ac = this.ac;
    if (!ac) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || "triangle";
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.006, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },

  /* ---------- V1.5 撞击钉：音高与音量都由速度决定（确定性映射） ---------- */
  onCollide(b) {
    if (!this.enabled) return;
    if (this.pegCool > 0 || this.voices >= this.C.PEG_VOICES) return;
    // 判定这次碰撞是不是撞钉：反弹后球心到某枚钉的距离恰为 球半径+钉半径
    let isPeg = false;
    for (const p of BOARD.pegs) {
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (Math.abs(d - (b.r + p.r)) < 0.6) { isPeg = true; break; }
    }
    if (!isPeg) return;                    // 导轨/隔板不发声

    const sp = Math.hypot(b.vx, b.vy);
    const k = Math.min(1, Math.max(0, (sp - 120) / 900));   // 速度归一 0~1
    const vol = 0.05 + 0.22 * k;
    const freq = this.C.PEG_F0 + (this.C.PEG_F1 - this.C.PEG_F0) * k;
    this.pegCool = this.C.PEG_COOL;
    this.voices++;
    const ac = this.ac, t = ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.86, t + 0.08); // 下滑，像金属撞击
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.11);
    o.onended = () => { this.voices--; };
  },

  /* ---------- V1.6 入袋：普通袋短促，P2 高分袋欢快长音 ---------- */
  onPocket(id) {
    if (!this.enabled || id < 0 || this.pkCool > 0) return;
    this.pkCool = this.C.PK_COOL;
    if (id === 2) {
      // 高分袋：四音上行琶音 + 尾音，时长约 0.6s
      const seq = [523.25, 659.25, 783.99, 1046.50];
      seq.forEach((f, i) => this.note(f, i * 0.085, 0.34, 0.20, "square"));
      this.note(1567.98, 0.34, 0.30, 0.14, "triangle");
    } else {
      this.note(660, 0, 0.10, 0.16, "square");   // 普通袋：短促回报音
      this.note(990, 0.06, 0.12, 0.13, "square");
    }
  },

  /* ---------- V1.7 局终提示音 ---------- */
  over() {
    const seq = [440, 349.23, 261.63];
    seq.forEach((f, i) => this.note(f, i * 0.16, 0.42, 0.20, "triangle"));
  },

  /* ---------- V1.8 蓄力嗡鸣：开/关与音量随力度 ---------- */
  humStart() {
    if (!this.ac || this.hum) return;
    const ac = this.ac;
    this.humGain = ac.createGain();
    this.humGain.gain.value = 0.0001;
    const lp = ac.createBiquadFilter();     // 低通，压掉高频毛刺
    lp.type = "lowpass"; lp.frequency.value = 320;
    const o1 = ac.createOscillator(), o2 = ac.createOscillator();
    o1.type = "sawtooth"; o2.type = "sawtooth";
    o1.frequency.value = this.C.HUM_F1;
    o2.frequency.value = this.C.HUM_F2;
    o1.connect(lp); o2.connect(lp);
    lp.connect(this.humGain); this.humGain.connect(this.master);
    o1.start(); o2.start();
    this.hum = { o1, o2 };
  },
  humSet(p) {
    if (!this.ac) return;
    if (this.hum) {
      const C = this.C;
      const v = C.HUM_MIN + (C.HUM_MAX - C.HUM_MIN) * p;
      this.humGain.gain.setTargetAtTime(v, this.ac.currentTime, 0.03);
      // 顺便让音高随力度轻微上滑，听感更有"充能"
      this.hum.o1.frequency.setTargetAtTime(C.HUM_F1 * (1 + 0.35 * p), this.ac.currentTime, 0.05);
      this.hum.o2.frequency.setTargetAtTime(C.HUM_F2 * (1 + 0.35 * p), this.ac.currentTime, 0.05);
    }
  },
  humStop() {
    if (!this.ac || !this.hum) return;
    const h = this.hum;
    this.hum = null;
    h.o1.stop(this.ac.currentTime + 0.08);
    h.o2.stop(this.ac.currentTime + 0.08);
  },

  /* ---------- V1.9 每逻辑帧：轮询状态（不需要任何回调注入） ---------- */
  update(dt) {
    if (this.pegCool > 0) this.pegCool -= dt;
    if (this.pkCool > 0) this.pkCool -= dt;
    if (!this.ac || !this.enabled) { if (this.hum) this.humStop(); return; }

    if (PLAY.charging) {
      if (!this.hum) this.humStart();
      this.humSet(PLAY.charge);
    } else if (this.hum) {
      this.humStop();
    }

    const over = (STATE.cur === "over");
    if (over && !this.lastOver) this.over();
    this.lastOver = over;
  }
};

/* ---------- V1.10 自注册：首次用户手势时才创建 AudioContext ---------- */
AUDIO.enabled = (typeof UPGRADE !== "undefined") ? !!UPGRADE.audio : true;
["keydown", "pointerdown", "touchstart"].forEach((ev) => {
  window.addEventListener(ev, () => AUDIO.init(), { passive: true });
});
GAME.updaters.push((dt) => AUDIO.update(dt));
