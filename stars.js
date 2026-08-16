/**
 * stars.js — 动态星空粒子层
 * 基于 Canvas 2D + requestAnimationFrame。
 * 在星系背景之上叠加一层可交互的星空粒子（视差位移、引力聚集、闪烁）。
 */
(function () {
  'use strict';

  const Stars = {
    canvas: null,
    ctx: null,
    stars: [],
    mouse: { x: 0, y: 0, active: false },
    width: 0,
    height: 0,
    count: 160,
    rafId: null,
    dragOffset: { x: 0, y: 0 },

    init(canvasId, options) {
      const opts = options || {};
      this.count = opts.count || 160;
      this.canvas = document.getElementById(canvasId);
      this.ctx = this.canvas.getContext('2d');

      this.onResize = () => this.resize();
      this.onMove = (e) => {
        this.mouse.x = e.clientX;
        this.mouse.y = e.clientY;
        this.mouse.active = true;
      };
      this.onLeave = () => { this.mouse.active = false; };

      window.addEventListener('resize', this.onResize);
      window.addEventListener('mousemove', this.onMove);
      window.addEventListener('mouseleave', this.onLeave);

      this.resize();
      this.spawn();
      this.loop();
    },

    resize() {
      this.width = this.canvas.width = window.innerWidth;
      this.height = this.canvas.height = window.innerHeight;
    },

    spawn() {
      this.stars = [];
      for (let i = 0; i < this.count; i++) {
        this.stars.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          baseX: Math.random() * this.width,
          baseY: Math.random() * this.height,
          z: Math.random(),                          // 0~1 深度，决定视差强度
          r: Math.random() * 1.4 + 0.2,              // 星星半径
          twinkle: Math.random() * Math.PI * 2,      // 闪烁相位
          twinkleSpeed: Math.random() * 0.02 + 0.005,
        });
      }
    },

    loop() {
      const step = () => {
        this.update();
        this.drawStars();
        this.rafId = requestAnimationFrame(step);
      };
      this.rafId = requestAnimationFrame(step);
    },

    update() {
      const cx = this.width / 2;
      const cy = this.height / 2;
      const mx = this.mouse.active ? (this.mouse.x - cx) : 0;
      const my = this.mouse.active ? (this.mouse.y - cy) : 0;

      for (const s of this.stars) {
        // 视差：鼠标相对屏幕中心的偏移，深度越大位移越大，方向相反
        const parallax = 0.05 + s.z * 0.15;
        s.x = s.baseX - mx * parallax + this.dragOffset.x;
        s.y = s.baseY - my * parallax + this.dragOffset.y;

        // 拖拽产生的整体位移超出屏幕时循环回绕，保证星空连续
        s.x = ((s.x % this.width) + this.width) % this.width;
        s.y = ((s.y % this.height) + this.height) % this.height;

        // 引力聚集：鼠标附近星星向鼠标靠拢
        if (this.mouse.active) {
          const dx = this.mouse.x - s.x;
          const dy = this.mouse.y - s.y;
          const dist = Math.hypot(dx, dy);
          const radius = 140;
          if (dist < radius) {
            const force = (1 - dist / radius) * 0.4;
            s.x += dx * force;
            s.y += dy * force;
          }
        }

        s.twinkle += s.twinkleSpeed;
      }
    },

    // 绘制星空粒子（透明画布，叠加在星系背景之上）
    drawStars() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.width, this.height);

      for (const s of this.stars) {
        const alpha = 0.4 + Math.abs(Math.sin(s.twinkle)) * 0.6;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255,' + alpha.toFixed(3) + ')';
        ctx.fill();
      }

      // 鼠标处星光聚集光晕
      if (this.mouse.active) {
        const g = ctx.createRadialGradient(
          this.mouse.x, this.mouse.y, 0,
          this.mouse.x, this.mouse.y, 90
        );
        g.addColorStop(0, 'rgba(120, 200, 255, 0.35)');
        g.addColorStop(1, 'rgba(120, 200, 255, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(this.mouse.x, this.mouse.y, 90, 0, Math.PI * 2);
        ctx.fill();
      }
    },

    // 拖拽转动星空（由 galaxy.js 调用）：累积整体位移，模拟视角转动
    pan(dx, dy) {
      this.dragOffset.x += dx * 0.4;
      this.dragOffset.y += dy * 0.4;
    },

    destroy() {
      cancelAnimationFrame(this.rafId);
      window.removeEventListener('resize', this.onResize);
      window.removeEventListener('mousemove', this.onMove);
      window.removeEventListener('mouseleave', this.onLeave);
    },
  };

  window.Stars = Stars;
})();
