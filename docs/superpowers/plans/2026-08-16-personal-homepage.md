# 极客风格个人主页 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建一个纯静态、极具极客风格的个人主页，包含开屏动画、动态星空背景、项目/文章展示与 Web Audio 音效系统。

**Architecture:** 零构建、零依赖（除 Tailwind CDN）。三个 JS 文件各司其职，通过全局命名空间 `window.Stars` / `window.AudioEngine` 通信：`stars.js` 只做 Canvas 星空渲染，`audio.js` 只做音效合成，`main.js` 负责编排开屏流程与 DOM 事件绑定。HTML 用 Tailwind utility class 布局，自定义视觉特效集中在 `style.css`。

**Tech Stack:** 原生 HTML5 / CSS3 / JavaScript (ES6+)，Tailwind CSS（CDN），Canvas 2D + requestAnimationFrame，Web Audio API，CSS @keyframes。

## Global Constraints

- 纯静态项目：不引入构建工具、包管理器或测试框架；浏览器验证清单为唯一验收方式。
- Tailwind 通过 Play CDN 引入：`<script src="https://cdn.tailwindcss.com"></script>`（仅用于快速开发）。
- 星空背景用原生 Canvas 2D 实现，不使用 particles.js（避免额外依赖，保证性能可控）。
- 音效不生成任何音频文件，全部由 Web Audio API 实时合成，并预留 `playStartup / playHover / playClick` 接口。
- 所有代码注释使用中文；文件采用扁平结构。
- 本地预览必须通过 HTTP 服务器访问（避免 ES 模块/file:// 限制，虽然本项目用普通 script 标签，但 Tailwind CDN 在 file:// 下更稳妥以 http 访问）。
- 占位头像用几何 SVG，后续可替换为真实照片。

---

## File Structure

```
Web/
├── index.html          # 页面骨架与内容（Hero/About/Projects/Blog/Footer）
├── style.css           # 自定义样式 + @keyframes 动画（开屏、卡片抖动、按钮流光、粒子扩散）
├── stars.js            # Canvas 星空引擎（视差、鼠标引力聚集、拖尾）
├── audio.js            # Web Audio 音效系统（预留接口）
├── main.js             # 开屏动画流程、音效/动效事件绑定、模块初始化
├── assets/
│   ├── avatar.svg      # 占位头像（几何风）
│   └── favicon.svg     # 站点图标
└── docs/superpowers/plans/2026-08-16-personal-homepage.md  # 本计划
```

### 模块接口约定（跨任务契约）

- `window.Stars.init(canvasId, { count })` — 初始化星空，`canvasId` 为 canvas 元素 id。
- `window.Stars.destroy()` — 销毁星空（取消 rAF、解绑事件）。
- `window.AudioEngine.ensureCtx()` — 懒初始化/恢复 AudioContext。
- `window.AudioEngine.playStartup()` / `playHover()` / `playClick()` — 三类音效。
- DOM 约定：`#loader`（开屏层）、`#content`（正文，初始 `opacity-0`）、`#stars`（canvas）、`.project-card` 携带 `data-sound="hover"`、按钮携带 `data-sound="click"`、footer 社交链接携带 `data-sound="hover"`。

---

## Task 0: 初始化项目与静态资源

**Files:**
- Create: `index.html`（空骨架占位，Task 1 补全内容）
- Create: `assets/avatar.svg`
- Create: `assets/favicon.svg`
- Create: `.gitignore`

**Interfaces:**
- Produces: `assets/avatar.svg`、`assets/favicon.svg` 供 `index.html` 引用。

- [ ] **Step 1: 初始化 git 仓库**

Run: `git init`
Expected: 输出 `Initialized empty Git repository...`

- [ ] **Step 2: 创建 .gitignore**

```gitignore
.DS_Store
Thumbs.db
node_modules/
*.log
```

- [ ] **Step 3: 创建占位头像 assets/avatar.svg**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" fill="#0f172a"/>
  <circle cx="64" cy="52" r="22" fill="#22d3ee" opacity="0.85"/>
  <path d="M28 118c4-24 18-36 36-36s32 12 36 36" fill="#22d3ee" opacity="0.85"/>
</svg>
```

- [ ] **Step 4: 创建站点图标 assets/favicon.svg**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="20" fill="#05070f"/>
  <circle cx="50" cy="50" r="22" fill="none" stroke="#22d3ee" stroke-width="4"/>
  <circle cx="50" cy="50" r="6" fill="#22d3ee"/>
  <line x1="50" y1="14" x2="50" y2="28" stroke="#22d3ee" stroke-width="3"/>
  <line x1="50" y1="72" x2="50" y2="86" stroke="#22d3ee" stroke-width="3"/>
  <line x1="14" y1="50" x2="28" y2="50" stroke="#22d3ee" stroke-width="3"/>
  <line x1="72" y1="50" x2="86" y2="50" stroke="#22d3ee" stroke-width="3"/>
</svg>
```

- [ ] **Step 5: 提交**

```bash
git add .gitignore assets/
git commit -m "chore: init project with static assets"
```

---

## Task 1: HTML 骨架与页面内容

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `assets/avatar.svg`、`assets/favicon.svg`、`style.css`、`stars.js`、`audio.js`、`main.js`。
- Produces: `#loader`、`#content`、`#stars` 及所有带 `data-sound` 属性的交互元素，供 `main.js` 绑定。

- [ ] **Step 1: 写入完整 HTML**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>你的名字 · 极客个人主页</title>
  <meta name="description" content="个人技术主页，展示项目与技术文章" />
  <link rel="icon" href="assets/favicon.svg" type="image/svg+xml" />
  <!-- Tailwind CSS Play CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="style.css" />
</head>
<body class="bg-[#05070f] text-slate-200 font-mono antialiased overflow-x-hidden">

  <!-- 开屏加载动画层（半透明，透出背后星空画布） -->
  <div id="loader" class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#05070f]/90 transition-opacity duration-1000">
    <div class="loader-starfield"></div>
    <div class="mt-6 text-cyan-400 tracking-[0.3em] text-sm animate-pulse">INITIALIZING...</div>
  </div>

  <!-- 动态星空背景画布 -->
  <canvas id="stars" class="fixed inset-0 -z-10"></canvas>

  <!-- 正文内容（初始隐藏，加载后淡入） -->
  <main id="content" class="opacity-0 transition-opacity duration-1000">
    <!-- Hero -->
    <section id="hero" class="min-h-screen flex flex-col items-center justify-center px-6 text-center">
      <p class="text-cyan-400 tracking-[0.4em] text-sm mb-4">&gt; hello world, i am</p>
      <h1 class="text-5xl md:text-8xl font-black tracking-tight text-white">你的名字</h1>
      <p class="mt-6 max-w-xl text-slate-400 text-lg">用代码构建有趣的东西。前端 / 全栈 / 极客。</p>
      <div class="mt-10 flex gap-4">
        <button class="btn-primary" data-sound="click">查看项目</button>
        <button class="btn-secondary" data-sound="click">联系我</button>
      </div>
    </section>

    <!-- About -->
    <section id="about" class="max-w-4xl mx-auto px-6 py-24">
      <h2 class="section-title">关于我</h2>
      <div class="flex flex-col md:flex-row items-center gap-8">
        <img src="assets/avatar.svg" alt="头像" class="w-32 h-32 rounded-full ring-2 ring-cyan-400/60" />
        <p class="text-slate-400 leading-relaxed">这里写一段个人介绍：你的技术栈、关注方向、以及你在做的事情。保持简洁真诚。</p>
      </div>
    </section>

    <!-- Projects -->
    <section id="projects" class="max-w-6xl mx-auto px-6 py-24">
      <h2 class="section-title">项目展示</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <article class="project-card" data-sound="hover">
          <h3 class="text-xl font-bold text-white">项目名称</h3>
          <p class="mt-3 text-slate-400 text-sm">项目简介：一句话说明它解决了什么问题、用了什么技术。</p>
          <div class="mt-5 flex gap-3">
            <a href="https://github.com/yourname" class="text-cyan-400 hover:text-cyan-300">GitHub →</a>
            <a href="https://example.com" class="text-cyan-400 hover:text-cyan-300">演示 →</a>
          </div>
        </article>
        <article class="project-card" data-sound="hover">
          <h3 class="text-xl font-bold text-white">项目名称</h3>
          <p class="mt-3 text-slate-400 text-sm">项目简介：一句话说明它解决了什么问题、用了什么技术。</p>
          <div class="mt-5 flex gap-3">
            <a href="https://github.com/yourname" class="text-cyan-400 hover:text-cyan-300">GitHub →</a>
            <a href="https://example.com" class="text-cyan-400 hover:text-cyan-300">演示 →</a>
          </div>
        </article>
        <article class="project-card" data-sound="hover">
          <h3 class="text-xl font-bold text-white">项目名称</h3>
          <p class="mt-3 text-slate-400 text-sm">项目简介：一句话说明它解决了什么问题、用了什么技术。</p>
          <div class="mt-5 flex gap-3">
            <a href="https://github.com/yourname" class="text-cyan-400 hover:text-cyan-300">GitHub →</a>
            <a href="https://example.com" class="text-cyan-400 hover:text-cyan-300">演示 →</a>
          </div>
        </article>
      </div>
    </section>

    <!-- Blog -->
    <section id="blog" class="max-w-4xl mx-auto px-6 py-24">
      <h2 class="section-title">技术文章</h2>
      <ul class="divide-y divide-slate-800">
        <li class="py-5">
          <a href="#" class="text-lg font-semibold text-white hover:text-cyan-400">文章标题</a>
          <p class="mt-1 text-slate-400 text-sm">文章摘要：一两句概括本文核心内容与结论。</p>
        </li>
        <li class="py-5">
          <a href="#" class="text-lg font-semibold text-white hover:text-cyan-400">文章标题</a>
          <p class="mt-1 text-slate-400 text-sm">文章摘要：一两句概括本文核心内容与结论。</p>
        </li>
        <li class="py-5">
          <a href="#" class="text-lg font-semibold text-white hover:text-cyan-400">文章标题</a>
          <p class="mt-1 text-slate-400 text-sm">文章摘要：一两句概括本文核心内容与结论。</p>
        </li>
      </ul>
    </section>

    <!-- Footer -->
    <footer class="border-t border-slate-800 py-12 text-center">
      <div class="flex justify-center gap-6">
        <a href="https://github.com/yourname" aria-label="GitHub" data-sound="hover">
          <svg class="w-6 h-6 fill-current text-slate-400 hover:text-white transition-colors" viewBox="0 0 24 24">
            <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.72-1.54-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.9 10.9 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.73.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.78 1.05.78 2.12 0 1.53-.01 2.76-.01 3.14 0 .31.21.67.8.56A10.52 10.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z"/>
          </svg>
        </a>
        <a href="mailto:you@example.com" aria-label="Email" data-sound="hover" class="text-slate-400 hover:text-white transition-colors">Email</a>
        <a href="https://twitter.com/yourname" aria-label="X" data-sound="hover" class="text-slate-400 hover:text-white transition-colors">X</a>
        <a href="https://blog.example.com" aria-label="Blog" data-sound="hover" class="text-slate-400 hover:text-white transition-colors">Blog</a>
      </div>
      <p class="mt-6 text-slate-600 text-sm">© 2026 你的名字 · Built with HTML/CSS/JS</p>
    </footer>
  </main>

  <script src="stars.js"></script>
  <script src="audio.js"></script>
  <script src="main.js"></script>
</body>
</html>
```

- [ ] **Step 2: 本地预览验证**

Run: `python -m http.server 8000`（如无 Python 则 `npx serve .`）
打开浏览器访问 http://localhost:8000
Expected: 页面展示 Hero/About/Projects/Blog/Footer 五个区块；控制台无报错；开屏层与 canvas 已存在，但尚无星空动效（等待 Task 2）。

- [ ] **Step 3: 提交**

```bash
git add index.html
git commit -m "feat: add homepage HTML skeleton"
```

---

## Task 2: 星空背景引擎（stars.js）

**Files:**
- Create: `stars.js`

**Interfaces:**
- Consumes: `#stars` canvas 元素（由 Task 1 提供）。
- Produces: `window.Stars.init(canvasId, options)`、`window.Stars.destroy()`。

- [ ] **Step 1: 写入星空引擎**

```js
/**
 * stars.js — 动态星空背景引擎
 * 基于 Canvas 2D + requestAnimationFrame。
 * 特性：鼠标视差位移、鼠标周围引力聚集、星光拖尾（残影）。
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
      // 铺一层不透明深色底，保证拖尾残影叠加在正确背景上
      this.ctx.fillStyle = '#05070f';
      this.ctx.fillRect(0, 0, this.width, this.height);
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
        this.draw();
        this.rafId = requestAnimationFrame(step);
      };
      this.rafId = requestAnimationFrame(step);
    },

    update() {
      const cx = this.width / 2;
      const cy = this.height / 2;
      for (const s of this.stars) {
        // 视差：鼠标相对屏幕中心的偏移，深度越大位移越大，方向相反
        const mx = this.mouse.active ? (this.mouse.x - cx) : 0;
        const my = this.mouse.active ? (this.mouse.y - cy) : 0;
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

    draw() {
      const ctx = this.ctx;
      // 拖尾：半透明覆盖产生残影（不清空画布）
      ctx.fillStyle = 'rgba(5, 7, 15, 0.2)';
      ctx.fillRect(0, 0, this.width, this.height);

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
```

- [ ] **Step 2: 本地预览验证**

Run: `python -m http.server 8000`（如无 Python 则 `npx serve .`）
打开 http://localhost:8000
Expected: 页面出现全屏星空，星星闪烁；移动鼠标时星星整体产生视差位移；鼠标附近星星聚集并出现光晕，快速移动鼠标有拖尾残影。

- [ ] **Step 3: 提交**

```bash
git add stars.js
git commit -m "feat: add canvas starfield with parallax and attraction"
```

---

## Task 3: CSS 样式与动画（style.css）

**Files:**
- Create: `style.css`

**Interfaces:**
- Consumes: `index.html` 中的类名 `.section-title`、`.btn-primary`、`.btn-secondary`、`.project-card`、`.loader-starfield`。
- Produces: 上述类对应的视觉样式与 `@keyframes` 动画。

- [ ] **Step 1: 写入样式与动画**

```css
/* style.css — 自定义样式与动画 */

/* 基础 */
html { scroll-behavior: smooth; }
body { background: #05070f; }

/* 区块标题：前缀 > 高亮 */
.section-title {
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #fff;
  margin-bottom: 2rem;
}
.section-title::before {
  content: '> ';
  color: #22d3ee;
}

/* ===== 按钮：流光扫过效果 ===== */
.btn-primary,
.btn-secondary {
  position: relative;
  overflow: hidden;
  padding: 0.75rem 1.75rem;
  border-radius: 0.5rem;
  font-weight: 600;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.btn-primary {
  background: linear-gradient(135deg, #0891b2, #22d3ee);
  color: #05070f;
}
.btn-secondary {
  border: 1px solid #22d3ee;
  color: #22d3ee;
}
/* 流光条（伪元素） */
.btn-primary::before,
.btn-secondary::before {
  content: '';
  position: absolute;
  top: 0;
  left: -120%;
  width: 60%;
  height: 100%;
  background: linear-gradient(120deg, transparent, rgba(255, 255, 255, 0.5), transparent);
  transform: skewX(-20deg);
}
.btn-primary:hover::before,
.btn-secondary:hover::before {
  animation: shine 0.6s ease forwards;
}
.btn-primary:hover,
.btn-secondary:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 20px rgba(34, 211, 238, 0.5);
}
@keyframes shine {
  from { left: -120%; }
  to { left: 160%; }
}

/* ===== 项目卡片：抖动 + 高斯模糊背景 ===== */
.project-card {
  position: relative;
  padding: 1.5rem;
  border-radius: 1rem;
  border: 1px solid #1e293b;
  background: rgba(15, 23, 42, 0.4);
  backdrop-filter: blur(0px);
  transition: border-color 0.2s ease, backdrop-filter 0.3s ease;
}
.project-card:hover {
  border-color: #22d3ee;
  backdrop-filter: blur(6px);
  animation: card-shake 0.3s ease;
}
@keyframes card-shake {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  25% { transform: translate(-2px, 1px) rotate(-0.5deg); }
  50% { transform: translate(2px, -1px) rotate(0.5deg); }
  75% { transform: translate(-1px, -1px) rotate(-0.3deg); }
}

/* ===== 开屏星空旋转动画层 ===== */
.loader-starfield {
  width: 200px;
  height: 200px;
  background:
    radial-gradient(1px 1px at 20px 30px, #fff, transparent),
    radial-gradient(1px 1px at 120px 80px, #fff, transparent),
    radial-gradient(2px 2px at 60px 150px, #22d3ee, transparent),
    radial-gradient(1px 1px at 160px 140px, #fff, transparent),
    radial-gradient(1px 1px at 90px 40px, #fff, transparent),
    radial-gradient(1px 1px at 150px 30px, #fff, transparent);
  animation: spin 3s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ===== 按钮悬停粒子扩散（预留装饰） ===== */
@keyframes particle-burst {
  0% { transform: scale(0); opacity: 1; }
  100% { transform: scale(2.5); opacity: 0; }
}
```

- [ ] **Step 2: 本地预览验证**

Run: `python -m http.server 8000`（如无 Python 则 `npx serve .`）
打开 http://localhost:8000
Expected: 区块标题带 `>` 前缀；悬停按钮出现流光扫过 + 上浮 + 光晕；悬停项目卡片出现轻微抖动并产生背景模糊；开屏层星点旋转。

- [ ] **Step 3: 提交**

```bash
git add style.css
git commit -m "feat: add styles and animations"
```

---

## Task 4: 音效系统（audio.js）

**Files:**
- Create: `audio.js`

**Interfaces:**
- Consumes: 浏览器 Web Audio API（无其他模块依赖）。
- Produces: `window.AudioEngine.ensureCtx()`、`playStartup()`、`playHover()`、`playClick()`，供 `main.js` 调用。

- [ ] **Step 1: 写入音效系统**

```js
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
```

- [ ] **Step 2: 本地预览验证**

Run: `python -m http.server 8000`（如无 Python 则 `npx serve .`）
打开 http://localhost:8000，在浏览器控制台执行以下命令验证音效（需先点击页面任意处解锁音频）：
`AudioEngine.playClick()`、`AudioEngine.playHover()`、`AudioEngine.playStartup()`
Expected: 分别听到短促点击音、高频悬停音、上升启动音；控制台无报错。

- [ ] **Step 3: 提交**

```bash
git add audio.js
git commit -m "feat: add Web Audio sound effects"
```

---

## Task 5: 交互编排与集成（main.js）

**Files:**
- Create: `main.js`

**Interfaces:**
- Consumes: `window.Stars.init`、`window.AudioEngine.*`、`#loader`、`#content`、`[data-sound]`。
- Produces: 完整可交互页面（开屏流程 + 音效触发）。

- [ ] **Step 1: 写入交互逻辑**

```js
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
```

- [ ] **Step 2: 整体验收**

Run: `python -m http.server 8000`（如无 Python 则 `npx serve .`）
打开 http://localhost:8000 完整走查：
1. 开屏出现星空旋转加载动画，约 0.8s 后淡出，正文淡入，并伴随启动音效（若被浏览器拦截则在首次点击后补播）。
2. 星空持续闪烁，鼠标移动产生视差与聚集光晕。
3. 悬停项目卡片有抖动 + 背景模糊 + 悬停音。
4. 悬停按钮有流光 + 点击音。
5. 控制台无报错。

- [ ] **Step 3: 提交**

```bash
git add main.js
git commit -m "feat: wire up interactions and audio"
```

---

## Self-Review

- **规格覆盖**：Hero（Task 1）、关于我 + 头像（Task 1）、项目卡片（Task 1 + Task 3 抖动/模糊）、Blog（Task 1）、Footer（Task 1）、开屏动画（Task 1 loader + Task 3 旋转动画 + Task 5 流程）、动态星空视差/聚集/拖尾（Task 2）、卡片抖动与高斯模糊（Task 3）、按钮流光/粒子扩散（Task 3）、音效系统预留接口（Task 4）、原生技术栈与 Tailwind CDN（Global Constraints）。
- **无占位符**：所有代码步骤均含完整可运行代码。
- **接口一致性**：`Stars.init/destroy`、`AudioEngine.ensureCtx/playStartup/playHover/playClick`、DOM 约定（`#loader`/`#content`/`#stars`/`.project-card`/`[data-sound]`）在 Task 1、2、4、5 间一致。

## Execution Handoff

计划已保存到 `docs/superpowers/plans/2026-08-16-personal-homepage.md`。两种执行方式：

1. **Subagent-Driven（推荐）** — 每个任务派发一个全新子代理，任务间做两阶段审查，迭代快。
2. **Inline Execution** — 在当前会话用 executing-plans 分批执行，带检查点审查。

选择哪种方式？
