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

  document.addEventListener('DOMContentLoaded', () => {
    window.Stars.init('stars', { count: 160 });
    initLoader();
    bindSoundEffects();
    unlockAudioOnFirstInteraction();
  });
})();
