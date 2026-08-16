/**
 * stars.js — 动态星空背景引擎
 * 基于 Canvas 2D + requestAnimationFrame。
 * 特性：
 *   - 银河系视频绘制到背景画布，鼠标周围施加径向引力扭曲（引力透镜效果）；
 *   - 星空粒子叠加在视频之上，具备视差位移与引力聚集。
 */
(function () {
  'use strict';

  const Stars = {
    canvas: null,       // 星空粒子画布
    ctx: null,
    bgCanvas: null,     // 视频背景画布（含引力扭曲）
    bgCtx: null,
    video: null,
    stars: [],
    mouse: { x: 0, y: 0, active: false },
    width: 0,
    height: 0,
    count: 160,
    warpRadius: 150,     // 引力扭曲半径
    warpStrength: 0.12,  // 引力扭曲强度
    rafId: null,

    init(canvasId, options) {
      const opts = options || {};
      this.count = opts.count || 160;
      this.canvas = document.getElementById(canvasId);
      this.ctx = this.canvas.getContext('2d');
      this.bgCanvas = document.getElementById('bg-canvas');
      this.bgCtx = this.bgCanvas.getContext('2d');
      this.video = document.getElementById('bg-video');
      this.video.playbackRate = 1.25; // 背景视频 1.25 倍速

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
      this.bgCanvas.width = this.width;
      this.bgCanvas.height = this.height;
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
        this.drawBackground();
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
        s.x = s.baseX - mx * parallax;
        s.y = s.baseY - my * parallax;

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

    // 绘制视频背景：把视频帧画到背景画布，再对鼠标周围做引力扭曲
    drawBackground() {
      const bg = this.bgCtx;
      if (this.video && this.video.readyState >= 2) {
        const vw = this.video.videoWidth;
        const vh = this.video.videoHeight;
        if (vw && vh) {
          // cover 裁剪：等比放大填满画布并居中裁剪
          const scale = Math.max(this.width / vw, this.height / vh);
          const sw = this.width / scale;
          const sh = this.height / scale;
          const sx = (vw - sw) / 2;
          const sy = (vh - sh) / 2;
          bg.drawImage(this.video, sx, sy, sw, sh, 0, 0, this.width, this.height);
        } else {
          bg.fillStyle = '#05070f';
          bg.fillRect(0, 0, this.width, this.height);
        }
      } else {
        bg.fillStyle = '#05070f';
        bg.fillRect(0, 0, this.width, this.height);
      }

      if (this.mouse.active) {
        this.applyWarp();
      }
    },

    // 径向引力扭曲：鼠标周围图像向鼠标收缩，模拟引力透镜
    applyWarp() {
      const bg = this.bgCtx;
      const R = this.warpRadius;
      const region = R * 2;
      const mx = this.mouse.x;
      const my = this.mouse.y;

      // 计算有效区域（裁剪到画布边界）
      const sx = Math.max(0, Math.floor(mx - R));
      const sy = Math.max(0, Math.floor(my - R));
      const rw = Math.min(region, this.width - sx);
      const rh = Math.min(region, this.height - sy);
      if (rw <= 0 || rh <= 0) return;

      let imgData;
      try {
        imgData = bg.getImageData(sx, sy, rw, rh);
      } catch (e) {
        // 视频未同源（如 file:// 直接打开）时 canvas 会被污染，
        // getImageData 抛 SecurityError。此时跳过扭曲，保证背景与星空不卡死。
        return;
      }
      const data = imgData.data;
      const copy = new Uint8ClampedArray(data);

      const cx = mx - sx; // 鼠标在区域内的相对坐标
      const cy = my - sy;

      for (let y = 0; y < rh; y++) {
        for (let x = 0; x < rw; x++) {
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.hypot(dx, dy);
          if (dist < R && dist > 0) {
            // 越靠近鼠标，采样越远，图像越向鼠标收缩
            const force = (1 - dist / R) * this.warpStrength;
            const ix = x + dx * force;
            const iy = y + dy * force;
            const px = ix < 0 ? 0 : (ix >= rw ? rw - 1 : ix | 0);
            const py = iy < 0 ? 0 : (iy >= rh ? rh - 1 : iy | 0);
            const si = (py * rw + px) * 4;
            const di = (y * rw + x) * 4;
            data[di] = copy[si];
            data[di + 1] = copy[si + 1];
            data[di + 2] = copy[si + 2];
          }
        }
      }

      bg.putImageData(imgData, sx, sy);
    },

    // 绘制星空粒子（透明画布，叠加在视频背景之上）
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

    destroy() {
      cancelAnimationFrame(this.rafId);
      window.removeEventListener('resize', this.onResize);
      window.removeEventListener('mousemove', this.onMove);
      window.removeEventListener('mouseleave', this.onLeave);
    },
  };

  window.Stars = Stars;
})();
