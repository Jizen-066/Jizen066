/**
 * main.js — 页面编排与交互
 * 开屏动画流程、音效/动效事件绑定、模块初始化。
 */
(function () {
  'use strict';

  let startupPlayed = false;

  function playStartupSafe() {
    try {
      window.AudioEngine.playStartup();
      startupPlayed = true;
    } catch (e) { /* 忽略音频异常 */ }
  }

  // 浏览器自动播放策略：首次用户交互后解锁 AudioContext 并补播启动音
  function unlockAudioOnFirstInteraction() {
    const unlock = () => {
      try { window.AudioEngine.ensureCtx(); } catch (e) {}
      if (!startupPlayed) playStartupSafe();
      document.removeEventListener('pointerdown', unlock);
    };
    document.addEventListener('pointerdown', unlock);
  }

  // 开屏流程：load 后播启动音 -> 淡出 loader -> 淡入正文 -> 移除 loader
  function initLoader() {
    const loader = document.getElementById('loader');
    const content = document.getElementById('content');

    window.addEventListener('load', () => {
      playStartupSafe();
      setTimeout(() => {
        loader.classList.add('opacity-0');
        content.classList.remove('opacity-0');
        setTimeout(() => loader.remove(), 1100);
      }, 800);
    });
  }

  // 音效事件绑定
  function bindSoundEffects() {
    document.querySelectorAll('[data-sound="hover"]').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        try { window.AudioEngine.playHover(); } catch (e) {}
      });
    });
    document.querySelectorAll('[data-sound="click"]').forEach((el) => {
      el.addEventListener('click', () => {
        try { window.AudioEngine.playClick(); } catch (e) {}
      });
    });
  }

  // 背景音乐：循环播放，静音按钮切换
  function initBGM() {
    const bgm = document.getElementById('bgm');
    const btn = document.getElementById('mute-btn');
    if (!bgm || !btn) return;

    bgm.volume = 0.6;
    bgm.loop = true;

    let started = false;
    const tryPlay = () => {
      const p = bgm.play();
      if (p && p.then) p.then(() => { started = true; }).catch(() => {});
    };

    // 音频数据可播放后尝试播放
    bgm.addEventListener('canplay', () => { if (!started) tryPlay(); });

    // 尝试自动播放；被浏览器拦截时，首次交互后再播
    tryPlay();
    document.addEventListener('pointerdown', () => { if (!started) tryPlay(); }, { once: true });

    // 静音切换
    const iconOn = document.getElementById('mute-icon-on');
    const iconOff = document.getElementById('mute-icon-off');
    btn.addEventListener('click', () => {
      bgm.muted = !bgm.muted;
      if (iconOn && iconOff) {
        iconOn.classList.toggle('hidden', bgm.muted);
        iconOff.classList.toggle('hidden', !bgm.muted);
      }
    });
  }

  // 文章：点击标题展开/收起正文
  function bindBlogToggle() {
    document.querySelectorAll('.blog-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const body = btn.parentElement.querySelector('.blog-body');
        if (body) body.classList.toggle('hidden');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.Stars.init('stars', { count: 160 });
    initLoader();
    bindSoundEffects();
    initBGM();
    bindBlogToggle();
    unlockAudioOnFirstInteraction();
  });
})();
