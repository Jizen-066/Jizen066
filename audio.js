/**
 * audio.js — 音效系统
 * 使用 Web Audio API 实时合成电子音效，不依赖任何音频文件。
 * 预留接口：playStartup / playHover / playClick。
 */
(function () {
  'use strict';

  const AudioEngine = {
    ctx: null,

    // 懒初始化 AudioContext（浏览器要求用户交互后才能出声）
    ensureCtx() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },

    // 合成一个短促音：
    // freq 起始频率(Hz)、duration 时长(秒)、type 波形、volume 音量、slideTo 结束频率
    tone(freq, duration, type, volume, slideTo) {
      const ctx = this.ensureCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, now);
      if (slideTo) {
        osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
      }

      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(volume || 0.2, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + duration + 0.05);
    },

    // 启动音效：短促上升电子音
    playStartup() {
      this.tone(220, 0.5, 'sawtooth', 0.18, 880);
      this.tone(440, 0.5, 'square', 0.1, 1760);
    },

    // 悬停音效：短促高频
    playHover() {
      this.tone(1200, 0.08, 'sine', 0.08, 800);
    },

    // 点击音效
    playClick() {
      this.tone(600, 0.12, 'square', 0.15, 300);
    },
  };

  window.AudioEngine = AudioEngine;
})();
