/**
 * main.js — 页面编排与交互
 * 开屏动画流程、恒星导航（拖拽/惯性/碰撞/粒子）、音效/音乐、模块初始化。
 */
(function () {
  'use strict';

  // 移动端：禁用恒星拖拽，改为点击直接打开面板
  const IS_MOBILE = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 768;

  // ===== 全局状态 =====
  let startupPlayed = false;
  let currentPanel = null;

  // 恒星物理状态
  let starBodies = [];
  let dragging = null;
  let dragOffset = { dx: 0, dy: 0 };
  let dragMoved = false;
  let dragStart = { x: 0, y: 0 };
  let lastX = 0;
  let lastY = 0;
  let W = window.innerWidth;
  let H = window.innerHeight;
  let focusOrigin = { x: 0, y: 0 };

  // 恒星颜色映射（粒子用）
  const STAR_COLORS = {
    about: '34,211,238',
    projects: '96,165,250',
    blog: '250,204,21',
    contact: '255,255,255'
  };

  // ===== 音效 =====
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

  // ===== 开屏流程 =====
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

  // ===== 音效事件绑定（悬停等） =====
  function bindSoundEffects() {
    document.querySelectorAll('[data-sound="hover"]').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        try { window.AudioEngine.playHover(); } catch (e) {}
      });
    });
  }

  // ===== 背景音乐：播放/暂停按钮 =====
  function initBGM() {
    const bgm = document.getElementById('bgm');
    const btn = document.getElementById('mute-btn');
    if (!bgm || !btn) return;

    bgm.volume = 0.6;
    bgm.loop = true;

    const iconOn = document.getElementById('mute-icon-on');   // 有声音
    const iconOff = document.getElementById('mute-icon-off'); // 静音

    let playing = false;
    function setPlaying(state) {
      playing = state;
      if (iconOn) iconOn.classList.toggle('hidden', !state);
      if (iconOff) iconOff.classList.toggle('hidden', state);
    }

    function play() {
      const p = bgm.play();
      if (p && p.then) {
        p.then(() => { setPlaying(true); })
         .catch((e) => { setPlaying(false); });
      } else {
        setPlaying(true);
      }
    }

    function pause() {
      bgm.pause();
      setPlaying(false);
    }

    setPlaying(false);

    // 尝试自动播放；被浏览器拦截时，音频就绪后或首次交互再试
    play();
    bgm.addEventListener('canplay', () => { if (!playing) play(); });
    document.addEventListener('pointerdown', (e) => {
      // 跳过音乐按钮自身：否则 pointerdown 先触发 play()，紧接着按钮 click 又因 playing 已为 true 而 pause()，造成"闪一下"
      if (e.target && typeof e.target.closest === 'function' && e.target.closest('#mute-btn')) return;
      if (!playing) play();
    }, { once: true });

    // 按钮：播放/暂停切换
    btn.addEventListener('click', () => {
      if (playing) pause();
      else play();
    });
  }

  // ===== 文章：点击标题展开/收起正文 =====
  function bindBlogToggle() {
    document.querySelectorAll('.blog-toggle').forEach((btn) => {
      btn.addEventListener('click', () => {
        const li = btn.closest('li');
        const body = li ? li.querySelector('.blog-body') : null;
        if (body) body.classList.toggle('hidden');
      });
    });
  }

  // ===== 面板开关（点击恒星：移动到中心并放大铺满窗口） =====
  function focusOverlay() {
    return document.getElementById('star-focus');
  }

  function openPanel(target) {
    const panel = document.getElementById('panel-' + target);
    const layer = document.getElementById('panel-layer');
    const center = document.getElementById('center-view');
    const focus = focusOverlay();
    const bgBlur = document.getElementById('bg-blur');
    if (!panel || !layer) return;

    const body = starBodies.find((b) => b.target === target);

    center.classList.add('hidden');
    layer.classList.add('active');
    if (bgBlur) bgBlur.classList.add('active');

    // 聚焦光斑用恒星自己的颜色（柔和一点，避免盖住背景），并让它从恒星位置放大铺满窗口
    if (focus && body) {
      const c = STAR_COLORS[target] || '139,92,246';
      focus.style.background = 'radial-gradient(circle, rgba(' + c + ',0.5) 0%, rgba(' + c + ',0.22) 45%, rgba(' + c + ',0.07) 72%, transparent 100%)';
      focusOrigin = { x: body.x, y: body.y };

      const r = 46; // 光斑半径（92px 的一半）
      const from = 'translate(' + (body.x - r) + 'px, ' + (body.y - r) + 'px) scale(1)';
      const to = 'translate(' + (W / 2 - r) + 'px, ' + (H / 2 - r) + 'px) scale(' +
        Math.max(Math.hypot(W, H) / 92, 1) + ')';

      focus.style.transition = 'none';
      focus.style.transform = from;
      focus.style.opacity = '1';
      void focus.offsetWidth; // 强制回流，确保起始状态生效
      focus.style.transition = '';
      focus.style.transform = to;
    }

    currentPanel = panel;

    // 光斑展开到一半左右再淡入内容
    setTimeout(() => {
      panel.classList.remove('hidden');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => panel.classList.add('active'));
      });
    }, 260);
  }

  function closePanel() {
    if (!currentPanel) return;
    const panel = currentPanel;
    const layer = document.getElementById('panel-layer');
    const center = document.getElementById('center-view');
    const focus = focusOverlay();
    const bgBlur = document.getElementById('bg-blur');
    currentPanel = null;

    panel.classList.remove('active');
    layer.classList.remove('active');
    if (bgBlur) bgBlur.classList.remove('active');

    // 光斑缩回恒星原来的位置并淡出
    if (focus) {
      const r = 46;
      focus.style.transform = 'translate(' + (focusOrigin.x - r) + 'px, ' + (focusOrigin.y - r) + 'px) scale(1)';
      focus.style.opacity = '0';
    }

    setTimeout(() => {
      panel.classList.add('hidden');
      center.classList.remove('hidden');
    }, 600);
  }

  // ===== 恒星物理 =====
  function applyPosition(b) {
    b.el.style.left = b.x + 'px';
    b.el.style.top = b.y + 'px';
  }

  function hitTest(mx, my) {
    for (const b of starBodies) {
      if (Math.hypot(mx - b.x, my - b.y) <= b.r + 10) return b;
    }
    return null;
  }

  // 两球弹性碰撞 + 位置分离
  function collide(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const minDist = a.r + b.r;
    if (dist >= minDist || dist === 0) return;

    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = minDist - dist;
    a.x -= nx * overlap / 2;
    a.y -= ny * overlap / 2;
    b.x += nx * overlap / 2;
    b.y += ny * overlap / 2;

    const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rel < 0) {
      const e = 0.9; // 恢复系数
      const j = -(1 + e) * rel / 2; // 质量相等
      a.vx -= j * nx;
      a.vy -= j * ny;
      b.vx += j * nx;
      b.vy += j * ny;
    }
  }

  function physicsLoop(pctx) {
    const inCompanion = window.Galaxy && window.Galaxy.view === 'companion';

    if (!inCompanion) {
      // 更新位置与速度
      for (const b of starBodies) {
        if (b !== dragging) {
          b.x += b.vx;
          b.y += b.vy;
          b.vx *= 0.98; // 摩擦
          b.vy *= 0.98;
          if (Math.abs(b.vx) < 0.05) b.vx = 0;
          if (Math.abs(b.vy) < 0.05) b.vy = 0;
        }
        // 边界回弹
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.7; }
        if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.7; }
        if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.7; }
        if (b.y > H - b.r) { b.y = H - b.r; b.vy = -Math.abs(b.vy) * 0.7; }
        applyPosition(b);
      }

      // 恒星两两碰撞
      for (let i = 0; i < starBodies.length; i++) {
        for (let j = i + 1; j < starBodies.length; j++) {
          collide(starBodies[i], starBodies[j]);
        }
      }
    }

    // 粒子渲染（伴星系视角下清空，粒子效果消失）
    if (pctx) {
      pctx.clearRect(0, 0, W, H);
      if (!inCompanion) {
        for (const b of starBodies) {
          for (const p of b.particles) {
            p.angle += p.speed;
            const px = b.x + Math.cos(p.angle) * p.orbit;
            const py = b.y + Math.sin(p.angle) * p.orbit;
            const alpha = 0.45 + 0.55 * Math.abs(Math.sin(p.angle * 2 + p.phase));
            pctx.fillStyle = 'rgba(' + b.color + ',' + alpha.toFixed(3) + ')';
            pctx.beginPath();
            pctx.arc(px, py, p.size, 0, Math.PI * 2);
            pctx.fill();
          }
        }
      }
    }

    requestAnimationFrame(() => physicsLoop(pctx));
  }

  // ===== 恒星导航初始化 =====
  function initOrbit() {
    const orbit = document.getElementById('orbit');
    const ring = orbit ? orbit.querySelector('.orbit-ring') : null;
    const nodes = orbit ? Array.from(orbit.querySelectorAll('.star-node')) : [];
    if (!orbit || !nodes.length) return;

    const pc = document.getElementById('star-particles');
    const pctx = pc ? pc.getContext('2d') : null;
    function resizeCanvas() {
      W = window.innerWidth;
      H = window.innerHeight;
      if (pc) { pc.width = W; pc.height = H; }
    }
    resizeCanvas();

    // 初始化恒星：圆形轨道分布
    const cx = W / 2;
    const cy = H / 2;
    const radius = Math.min(W, H) * 0.34;
    if (ring) {
      ring.style.width = (radius * 2) + 'px';
      ring.style.height = (radius * 2) + 'px';
    }

    starBodies = nodes.map((node, i) => {
      const angle = (i / nodes.length) * Math.PI * 2 - Math.PI / 2;
      const target = node.getAttribute('data-target');
      return {
        el: node,
        target,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        vx: 0,
        vy: 0,
        r: 40,
        color: STAR_COLORS[target] || '200,200,200',
        particles: Array.from({ length: 16 }, () => ({
          orbit: 46 + Math.random() * 60,
          angle: Math.random() * Math.PI * 2,
          speed: 0.01 + Math.random() * 0.03,
          size: 1 + Math.random() * 2.6,
          phase: Math.random() * Math.PI * 2
        }))
      };
    });
    starBodies.forEach(applyPosition);

    // 启动物理循环
    physicsLoop(pctx);

    // 拖拽 / 点击
    document.addEventListener('pointerdown', (e) => {
      if (IS_MOBILE || currentPanel) return; // 移动端/面板打开时不响应恒星拖拽
      if (window.Galaxy && window.Galaxy.view === 'companion') return; // 伴星系视角：恒星不可交互
      const b = hitTest(e.clientX, e.clientY);
      if (!b) return;
      dragging = b;
      dragOffset.dx = b.x - e.clientX;
      dragOffset.dy = b.y - e.clientY;
      dragMoved = false;
      dragStart.x = e.clientX;
      dragStart.y = e.clientY;
      lastX = e.clientX;
      lastY = e.clientY;
      b.vx = 0;
      b.vy = 0;
      try { window.AudioEngine.playHover(); } catch (err) {}
    });

    document.addEventListener('pointermove', (e) => {
      if (IS_MOBILE || !dragging) return;
      if (window.Galaxy && window.Galaxy.view === 'companion') return;
      dragging.x = e.clientX + dragOffset.dx;
      dragging.y = e.clientY + dragOffset.dy;
      dragging.vx = e.clientX - lastX; // 惯性速度
      dragging.vy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      if (!dragMoved && Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y) > 5) {
        dragMoved = true;
      }
    });

    document.addEventListener('pointerup', () => {
      if (!dragging) return;
      const b = dragging;
      dragging = null;
      if (!dragMoved) {
        // 视为点击
        try { window.AudioEngine.playClick(); } catch (err) {}
        if (b.target) openPanel(b.target);
      }
    });

    // 移动端：禁用拖拽，改为点击直接打开面板
    if (IS_MOBILE) {
      nodes.forEach((node) => {
        node.addEventListener('click', () => {
          if (currentPanel) return;
          if (window.Galaxy && window.Galaxy.view === 'companion') return;
          const target = node.getAttribute('data-target');
          if (target) {
            try { window.AudioEngine.playClick(); } catch (err) {}
            openPanel(target);
          }
        });
      });
    }

    // 点击面板层空白处关闭
    const layer = document.getElementById('panel-layer');
    layer.addEventListener('click', (e) => {
      if (e.target === layer) closePanel();
    });

    document.querySelectorAll('[data-close]').forEach((btn) => {
      btn.addEventListener('click', closePanel);
    });

    window.addEventListener('resize', resizeCanvas);
  }

  // ===== 启动 =====
  document.addEventListener('DOMContentLoaded', () => {
    window.Galaxy.init();
    window.Stars.init('stars', { count: 160 });
    initLoader();
    bindSoundEffects();
    initBGM();
    bindBlogToggle();
    initOrbit();
    unlockAudioOnFirstInteraction();
  });
})();
