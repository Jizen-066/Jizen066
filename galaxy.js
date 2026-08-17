/**
 * galaxy.js — 基于 Three.js 的程序化螺旋星系背景
 * GPU 渲染约 9 万粒子（移动端约 2.2 万）：中心亮核 + 2 条主旋臂 + 絮状星云/星团 + 稀疏晕。
 * 颜色暖白核 -> 橙 -> 蓝紫 -> 深蓝，絮状物为偏暗的星云色调。
 * 鼠标靠近时粒子被轻微吸引并增亮；按住空白处可绕 X/Y 轴任意翻转星系（无角度限制）。
 * 附带一个绕主星系公转的伴星系（更小、粒子更少），悬停显示"伴星系"、点击传送视角；
 * 伴星系周围有 4 个可悬停/点击的友链粒子，点击跳转对应网站。
 * 暴露 window.Galaxy.init() / destroy()。
 */
(function () {
  'use strict';

  const X_AXIS = new THREE.Vector3(1, 0, 0);
  const Y_AXIS = new THREE.Vector3(0, 1, 0);

  // 移动端：降低粒子数、禁用拖拽旋转，保证流畅
  const IS_MOBILE = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 768;

  // 伴星系周围的友链粒子（各有独立颜色）
  const FRIEND_LINKS = [
    { name: 'YN', url: 'https://www.continueyn.site', color: 0x4fd1ff },
    { name: 'YYR', url: 'https://d2e27556a0604eea89cda8bffaefb020.sh2.agentos-app.net', color: 0xa78bfa },
    { name: 'QQ', url: 'https://qqhamburger.top', color: 0x34d399 },
    { name: 'PresentBox', url: 'https://mypresentboxes.com', color: 0xfbbf24 },
  ];

  const VERT = /* glsl */ `
    uniform float uTime;
    uniform vec2 uMouse;      // NDC 坐标（-1..1），初始为远点表示未激活
    uniform float uSize;

    attribute float aScale;
    attribute vec3 aColor;

    varying vec3 vColor;
    varying float vGlow;

    void main() {
      vec3 pos = position;

      // 星系自身绕 Y 轴缓慢自转
      float ang = uTime * 0.12;
      float c = cos(ang);
      float s = sin(ang);
      vec3 p;
      p.x = c * pos.x - s * pos.z;
      p.z = s * pos.x + c * pos.z;
      p.y = pos.y;

      vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
      vec4 clip = projectionMatrix * mvPosition;
      vec2 ndc = clip.xy / clip.w;

      // 鼠标引力：范围小、强度弱
      vec2 delta = uMouse - ndc;
      float dist = length(delta);
      float influence = smoothstep(0.25, 0.0, dist);
      ndc += delta * influence * 0.15;

      clip.xy = ndc * clip.w;
      gl_Position = clip;

      gl_PointSize = aScale * uSize / -mvPosition.z;

      vColor = aColor;
      vGlow = influence;
    }
  `;

  const FRAG = /* glsl */ `
    uniform float uExposure;
    varying vec3 vColor;
    varying float vGlow;

    void main() {
      float d = length(gl_PointCoord - vec2(0.5));
      if (d > 0.5) discard;

      float alpha = smoothstep(0.5, 0.0, d);
      alpha = alpha * alpha;

      float core = smoothstep(0.2, 0.0, d);
      vec3 col = vColor + vec3(core * 0.9);
      col += vGlow * 0.25;

      gl_FragColor = vec4(col * uExposure, alpha);
    }
  `;

  function gaussian() {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  // 生成柔和光点纹理（用于友链粒子 Sprite）
  function makeGlowTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.4)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }

  const Galaxy = {
    renderer: null,
    scene: null,
    camera: null,
    group: null,
    galaxy: null,
    material: null,
    clock: null,
    rafId: null,
    onResize: null,
    onMove: null,
    onLeave: null,
    onPointerDown: null,
    onPointerMove: null,
    onPointerUp: null,
    onClick: null,
    dragging: false,
    lastX: 0,
    lastY: 0,
    downX: 0,
    downY: 0,

    // 伴星系与友链
    companionPivot: null,
    companion: null,
    linkGroup: null,
    linkAnchors: null,
    linkLabels: null,
    view: 'main',          // 'main' | 'companion'
    hovered: null,         // 'companion' | 'main' | {name,url,color,anchor,sprite} | null
    tooltip: null,
    companionMaterial: null,
    orbitQuat: new THREE.Quaternion().setFromAxisAngle(X_AXIS, -0.35), // 伴星系视角相机轨道旋转（四元数，无万向锁、无角度限制）
    orbitDist: 9,
    onAvatarClick: null,
    toggleBtn: null,
    toggleGalaxyIcon: null,
    toggleBackIcon: null,
    paused: false,          // 暂停公转与自转
    pauseBtn: null,
    pauseIcon: null,
    playIcon: null,

    init() {
      const width = window.innerWidth;
      const height = window.innerHeight;

      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x000008);

      this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 150);
      this.camera.position.set(0, 12, 26);
      this.camera.lookAt(0, 0, 0);

      this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(1);
      this.renderer.domElement.id = 'galaxy-canvas';
      document.body.appendChild(this.renderer.domElement);

      this.buildGalaxy();
      this.buildCompanion();
      this.buildTooltip();

      this.onResize = () => this.resize();
      this.onMove = (e) => {
        this.setMouse(e.clientX, e.clientY);
        this.updateHover(e.clientX, e.clientY);
      };
      this.onLeave = () => {
        this.setMouse(null);
        this.hovered = null;
        if (this.tooltip) this.tooltip.style.opacity = '0';
      };
      window.addEventListener('resize', this.onResize);
      window.addEventListener('mousemove', this.onMove);
      window.addEventListener('mouseleave', this.onLeave);

      this.onPointerDown = (e) => this.pointerDown(e);
      this.onPointerMove = (e) => this.pointerMove(e);
      this.onPointerUp = (e) => this.pointerUp(e);
      this.onClick = (e) => this.handleClick(e);
      document.addEventListener('pointerdown', this.onPointerDown);
      document.addEventListener('pointermove', this.onPointerMove);
      document.addEventListener('pointerup', this.onPointerUp);
      document.addEventListener('click', this.onClick);

      // 点击右上角头像返回主星系视角
      this.onAvatarClick = (e) => {
        e.preventDefault();
        e.stopPropagation(); // 阻止冒泡到 document 的 handleClick，避免移动端误触发
        if (this.view === 'companion') this.resetView();
      };
      const avatar = document.getElementById('avatar');
      if (avatar) avatar.addEventListener('click', this.onAvatarClick);

      // 手机端：伴星系 / 返回 切换按钮
      this.toggleBtn = document.getElementById('companion-toggle');
      this.toggleGalaxyIcon = document.getElementById('toggle-galaxy-icon');
      this.toggleBackIcon = document.getElementById('toggle-back-icon');
      if (this.toggleBtn) {
        this.toggleBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation(); // 阻止冒泡到 document 的 handleClick，避免移动端误触发
          if (this.view === 'companion') this.resetView();
          else this.focusCompanion();
        });
      }

      // 右下角：暂停/恢复 星系公转与自转
      this.pauseBtn = document.getElementById('pause-btn');
      this.pauseIcon = document.getElementById('pause-icon');
      this.playIcon = document.getElementById('play-icon');
      if (this.pauseBtn) {
        this.pauseBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.paused = !this.paused;
          this.syncPauseButton();
        });
      }

      this.clock = new THREE.Clock();
      this.animate();
    },

    setMouse(cx, cy) {
      const apply = (m) => {
        if (!m) return;
        if (cx === null || cy === null) {
          m.uniforms.uMouse.value.set(10, 10);
        } else {
          const nx = (cx / window.innerWidth) * 2 - 1;
          const ny = -(cy / window.innerHeight) * 2 + 1;
          m.uniforms.uMouse.value.set(nx, ny);
        }
      };
      apply(this.material);
      apply(this.companionMaterial);
    },

    // 拖拽转动：命中恒星或面板时不响应，避免影响原有交互
    pointerDown(e) {
      this.downX = e.clientX;
      this.downY = e.clientY;
      if (IS_MOBILE) return;
      const t = e.target;
      if (t && typeof t.closest === 'function' && (t.closest('.star-node') || t.closest('#panel-layer'))) return;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    },

    pointerMove(e) {
      if (IS_MOBILE || !this.dragging) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;

      if (this.view === 'companion') {
        // 伴星系视角：绕「当前屏幕」的垂直/水平轴旋转，翻转后拖拽方向保持一致
        const wp = new THREE.Vector3();
        this.companion.getWorldPosition(wp);
        const radialQuat = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, Math.atan2(wp.x, wp.z));
        const orient = radialQuat.clone().multiply(this.orbitQuat);

        // 屏幕垂直轴 = 相机 up，屏幕水平轴 = 相机 right
        const upAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(orient).normalize();
        const rightAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(orient).normalize();

        const qYaw = new THREE.Quaternion().setFromAxisAngle(upAxis, -dx * 0.005);
        const qPitch = new THREE.Quaternion().setFromAxisAngle(rightAxis, dy * 0.005);
        this.orbitQuat.premultiply(qYaw).premultiply(qPitch);
      } else {
        // 主视角：左右绕世界 Y（偏航），上下绕世界 X（俯仰），四元数累乘、无角度限制
        const qy = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, dx * 0.005);
        const qx = new THREE.Quaternion().setFromAxisAngle(X_AXIS, dy * 0.005);
        this.group.quaternion.premultiply(qy).premultiply(qx);

        // 同步让星空层产生视差位移（模拟视角转动）
        try { window.Stars && window.Stars.pan(dx, dy); } catch (err) {}
      }
    },

    pointerUp(e) {
      const moved = Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > 5;
      this.dragging = false;
      if (!IS_MOBILE && !moved && this.hovered) this.activateHovered();
    },

    // 移动端：用 click 命中检测友链/伴星系
    handleClick(e) {
      if (!IS_MOBILE) return;
      this.updateHover(e.clientX, e.clientY);
      if (this.hovered) this.activateHovered();
    },

    buildGalaxy() {
      const count = IS_MOBILE ? 22000 : 90000;
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const scales = new Float32Array(count);

      const cCore = new THREE.Color(0xffd9a0);
      const cInside = new THREE.Color(0xff6030);
      const cMid = new THREE.Color(0x9a7bff);     // 亮蓝紫（旋臂中段）
      const cArmOut = new THREE.Color(0x4a5fd0); // 中蓝（旋臂外圈）
      const cHalo = new THREE.Color(0x162a5a);   // 暗深蓝（背景晕）
      const tmp = new THREE.Color();

      // 絮状星云/星团：预先在盘面上撒一批团块中心
      const nebulaColors = [0x6a5fd0, 0x9a6a9a, 0x4a7ab5, 0x7a5a8a, 0x3a6a8a, 0x8a5a7a, 0x5a4a9a];
      const clusters = [];
      const clusterCount = 36;
      for (let k = 0; k < clusterCount; k++) {
        const r = 3 + Math.random() * 14;
        const ang = Math.random() * Math.PI * 2;
        clusters.push({
          x: Math.cos(ang) * r,
          z: Math.sin(ang) * r,
          y: gaussian() * 1.5,
          radius: 1.5 + Math.random() * 3.5,
          color: new THREE.Color(nebulaColors[(Math.random() * nebulaColors.length) | 0]),
          brightness: 0.6 + Math.random() * 0.4,
        });
      }

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const type = Math.random();
        let x, y, z;

        if (type < 0.12) {
          // 中心亮核：压扁高斯球，控制亮度避免过曝盖住文字
          const r = Math.abs(gaussian()) * 3.5;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          x = Math.sin(phi) * Math.cos(theta) * r;
          y = Math.sin(phi) * Math.sin(theta) * r * 0.35;
          z = Math.cos(phi) * r;

          const t = r / 3.5;
          if (t < 0.5) tmp.copy(cCore).lerp(cInside, t * 2);
          else tmp.copy(cInside).lerp(cMid, (t - 0.5) * 2);
          scales[i] = 0.5 + Math.random() * 0.7;
        } else if (type < 0.57) {
          // 旋臂：仅 2 条主臂、更细更舒展，密度更连续，便于辨认
          let radius;
          do {
            radius = 4 + Math.random() * 14;
          } while (Math.random() > 0.65 + 0.35 * Math.sin(radius * 1.2));

          const spinAngle = radius * 0.7;
          const branchAngle = (i % 2) / 2 * Math.PI * 2;
          const angle = branchAngle + spinAngle;
          const nx = -Math.sin(angle);
          const nz = Math.cos(angle);
          const armWidth = 0.35 + radius * 0.08;
          const radialJitter = gaussian() * (0.25 + radius * 0.06);

          const rx = Math.cos(angle) * (radius + radialJitter);
          const rz = Math.sin(angle) * (radius + radialJitter);
          x = rx + nx * gaussian() * armWidth;
          z = rz + nz * gaussian() * armWidth;
          y = gaussian() * (0.15 + radius * 0.05);

          const t = (radius - 4) / 14;
          if (t < 0.5) tmp.copy(cInside).lerp(cMid, t / 0.5);
          else tmp.copy(cMid).lerp(cArmOut, (t - 0.5) / 0.5);
          scales[i] = 1.0 + Math.random() * 1.3;
        } else if (type < 0.90) {
          // 絮状星云/星团：偏暗柔和的雾状
          const cl = clusters[(Math.random() * clusters.length) | 0];
          const rr = Math.abs(gaussian()) * cl.radius;
          const th = Math.random() * Math.PI * 2;
          x = cl.x + Math.cos(th) * rr;
          z = cl.z + Math.sin(th) * rr;
          y = cl.y + gaussian() * cl.radius * 0.4;
          tmp.copy(cl.color).multiplyScalar(cl.brightness);
          scales[i] = 0.4 + Math.random() * 0.9;
        } else {
          // 稀疏晕：最暗，作为远处背景尘埃
          const r = Math.random() * 18;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          x = Math.sin(phi) * Math.cos(theta) * r;
          y = Math.sin(phi) * Math.sin(theta) * r * 0.25;
          z = Math.cos(phi) * r;
          tmp.copy(cHalo).multiplyScalar(0.55 + Math.random() * 0.5);
          scales[i] = 0.25 + Math.random() * 0.45;
        }

        positions[i3] = x;
        positions[i3 + 1] = y;
        positions[i3 + 2] = z;
        colors[i3] = tmp.r;
        colors[i3 + 1] = tmp.g;
        colors[i3 + 2] = tmp.b;
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
      geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));

      this.material = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uMouse: { value: new THREE.Vector2(10, 10) },
          uSize: { value: 90 },
          uExposure: { value: 0.34 },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      this.galaxy = new THREE.Points(geometry, this.material);

      // group 承载星系：默认轻微倾斜，之后可被拖拽任意翻转
      this.group = new THREE.Group();
      this.group.quaternion.setFromEuler(new THREE.Euler(0.3, 0, 0.08));
      this.group.add(this.galaxy);
      this.scene.add(this.group);
    },

    // 伴星系：更小、粒子更少，绕主星系公转（与主星系同样的多颜色 + 絮状星云）
    buildCompanion() {
      const count = IS_MOBILE ? 4000 : 15000;
      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const scales = new Float32Array(count);

      const cCore = new THREE.Color(0xfff0d0);
      const cInside = new THREE.Color(0xffb050);
      const cMid = new THREE.Color(0x9a7bff);
      const cArmOut = new THREE.Color(0x4a5fd0);
      const cHalo = new THREE.Color(0x162a5a);
      const tmp = new THREE.Color();

      // 絮状星云团块
      const nebulaColors = [0x6a5fd0, 0x9a6a9a, 0x4a7ab5, 0x7a5a8a, 0x3a6a8a, 0x8a5a7a, 0x5a4a9a];
      const clusters = [];
      for (let k = 0; k < 8; k++) {
        const r = 1 + Math.random() * 4.5;
        const ang = Math.random() * Math.PI * 2;
        clusters.push({
          x: Math.cos(ang) * r,
          z: Math.sin(ang) * r,
          y: gaussian() * 0.6,
          radius: 0.6 + Math.random() * 1.5,
          color: new THREE.Color(nebulaColors[(Math.random() * nebulaColors.length) | 0]),
          brightness: 0.5 + Math.random() * 0.5,
        });
      }

      for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const type = Math.random();
        let x, y, z;

        if (type < 0.12) {
          // 中心亮核
          const r = Math.abs(gaussian()) * 1.5;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          x = Math.sin(phi) * Math.cos(theta) * r;
          y = Math.sin(phi) * Math.sin(theta) * r * 0.35;
          z = Math.cos(phi) * r;
          tmp.copy(cCore).lerp(cInside, r / 1.5);
          scales[i] = 0.4 + Math.random() * 0.6;
        } else if (type < 0.5) {
          // 旋臂（2 条）
          const radius = 1.5 + Math.random() * 4.5;
          const branch = (i % 2) / 2 * Math.PI * 2;
          const angle = branch + radius * 0.8;
          const nx = -Math.sin(angle);
          const nz = Math.cos(angle);
          const armWidth = 0.2 + radius * 0.06;
          const rr = radius + gaussian() * 0.3;
          x = Math.cos(angle) * rr + nx * gaussian() * armWidth;
          z = Math.sin(angle) * rr + nz * gaussian() * armWidth;
          y = gaussian() * (0.08 + radius * 0.03);
          const t = (radius - 1.5) / 4.5;
          if (t < 0.5) tmp.copy(cInside).lerp(cMid, t / 0.5);
          else tmp.copy(cMid).lerp(cArmOut, (t - 0.5) / 0.5);
          scales[i] = 0.7 + Math.random() * 1.1;
        } else if (type < 0.85) {
          // 絮状星云
          const cl = clusters[(Math.random() * clusters.length) | 0];
          const rr = Math.abs(gaussian()) * cl.radius;
          const th = Math.random() * Math.PI * 2;
          x = cl.x + Math.cos(th) * rr;
          z = cl.z + Math.sin(th) * rr;
          y = cl.y + gaussian() * cl.radius * 0.4;
          tmp.copy(cl.color).multiplyScalar(cl.brightness);
          scales[i] = 0.3 + Math.random() * 0.7;
        } else {
          // 稀疏晕
          const r = Math.random() * 6;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);
          x = Math.sin(phi) * Math.cos(theta) * r;
          y = Math.sin(phi) * Math.sin(theta) * r * 0.25;
          z = Math.cos(phi) * r;
          tmp.copy(cHalo).multiplyScalar(0.4 + Math.random() * 0.5);
          scales[i] = 0.2 + Math.random() * 0.35;
        }

        positions[i3] = x;
        positions[i3 + 1] = y;
        positions[i3 + 2] = z;
        colors[i3] = tmp.r;
        colors[i3 + 1] = tmp.g;
        colors[i3 + 2] = tmp.b;
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
      geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));

      // 复用主星系 shader：软边圆形光点 + 多颜色
      this.companionMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uMouse: { value: new THREE.Vector2(10, 10) },
          uSize: { value: 70 },
          uExposure: { value: 0.4 },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      this.companionPivot = new THREE.Group();
      this.companion = new THREE.Points(geometry, this.companionMaterial);
      this.companion.position.set(40, 0, 0); // 公转半径，离主星系更远
      this.companionPivot.add(this.companion);
      this.group.add(this.companionPivot);

      this.buildLinks();
    },

    // 伴星系内部的友链粒子（可悬停/点击，各有独立颜色）
    buildLinks() {
      const texture = makeGlowTexture();
      this.linkGroup = new THREE.Group();
      this.linkGroup.position.set(40, 0, 0);
      this.companionPivot.add(this.linkGroup);

      const offsets = [
        { x: 3.2, y: 0.8, z: 0.4 },
        { x: -2.4, y: -0.6, z: 1.6 },
        { x: 1.2, y: 0.9, z: -2.8 },
        { x: -1.6, y: 0.3, z: -2.0 },
      ];

      this.linkAnchors = FRIEND_LINKS.map((link, i) => {
        const off = offsets[i] || offsets[0];
        const anchor = new THREE.Object3D();
        anchor.position.set(off.x, off.y, off.z);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: texture,
          color: new THREE.Color(link.color).multiplyScalar(1.8),
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          depthTest: false,
          transparent: true,
        }));
        sprite.scale.set(0.8, 0.8, 1);
        anchor.add(sprite);
        this.linkGroup.add(anchor);
        return { name: link.name, url: link.url, color: link.color, anchor, sprite };
      });

      // 常态显示的名称标签（不依赖悬停）
      this.linkLabels = this.linkAnchors.map((link) => {
        const el = document.createElement('div');
        el.className = 'friend-label';
        el.textContent = link.name;
        el.style.color = '#' + new THREE.Color(link.color).getHexString();
        el.style.display = 'none';
        document.body.appendChild(el);
        return el;
      });
    },

    // 悬停提示框
    buildTooltip() {
      this.tooltip = document.createElement('div');
      this.tooltip.id = 'space-tooltip';
      document.body.appendChild(this.tooltip);
    },

    // 3D 世界坐标投影到屏幕坐标（返回 {x,y,z}，z 为 NDC 深度）
    projectToScreen(v) {
      const p = v.clone().project(this.camera);
      return {
        x: (p.x + 1) / 2 * window.innerWidth,
        y: (-p.y + 1) / 2 * window.innerHeight,
        z: p.z,
      };
    },

    updateHover(mx, my) {
      let hit = null;
      const wp = new THREE.Vector3();

      if (this.view === 'companion') {
        // 伴星系视角：友链优先，其次伴星系（用于返回）
        if (this.linkAnchors) {
          for (const link of this.linkAnchors) {
            link.anchor.getWorldPosition(wp);
            const s = this.projectToScreen(wp);
            if (s.z < 1 && Math.hypot(mx - s.x, my - s.y) < 26) { hit = link; break; }
          }
        }
        if (!hit) {
          // 主星系中心（原点）：点击返回主视角
          const s = this.projectToScreen(new THREE.Vector3(0, 0, 0));
          if (s.z < 1 && Math.hypot(mx - s.x, my - s.y) < 90) hit = 'main';
        }
      } else {
        // 主视角：只检测伴星系，避免公转时友链投影遮挡伴星系导致误触
        if (this.companion) {
          this.companion.getWorldPosition(wp);
          const s = this.projectToScreen(wp);
          if (s.z < 1 && Math.hypot(mx - s.x, my - s.y) < 45) hit = 'companion';
        }
      }

      this.hovered = hit;
      this.updateTooltip(mx, my, hit);
    },

    updateTooltip(mx, my, hit) {
      if (!this.tooltip) return;
      if (hit) {
        this.tooltip.textContent = hit === 'companion' ? '伴星系' : hit === 'main' ? '主星系' : hit.name;
        this.tooltip.style.opacity = '1';
        this.tooltip.style.left = (mx + 16) + 'px';
        this.tooltip.style.top = (my + 16) + 'px';
      } else {
        this.tooltip.style.opacity = '0';
      }
    },

    activateHovered() {
      if (this.hovered === 'companion') {
        if (this.view === 'main') this.focusCompanion();
      } else if (this.hovered === 'main') {
        this.resetView();
      } else if (this.hovered && this.hovered.url) {
        window.open(this.hovered.url, '_blank', 'noopener');
      }
    },

    // 传送到伴星系：隐藏恒星栏目与首页文字
    focusCompanion() {
      this.view = 'companion';
      const orbit = document.getElementById('orbit');
      const center = document.getElementById('center-view');
      const particles = document.getElementById('star-particles');
      if (orbit) orbit.classList.add('hidden');
      if (center) center.classList.add('hidden');
      if (particles) particles.classList.add('hidden');
      this.syncToggleButton();
    },

    // 返回主星系
    resetView() {
      this.view = 'main';
      const orbit = document.getElementById('orbit');
      const center = document.getElementById('center-view');
      const particles = document.getElementById('star-particles');
      if (orbit) orbit.classList.remove('hidden');
      if (center) center.classList.remove('hidden');
      if (particles) particles.classList.remove('hidden');
      this.syncToggleButton();
    },

    // 同步手机端切换按钮图标（伴星系 -> 返回箭头）
    syncToggleButton() {
      if (!this.toggleGalaxyIcon || !this.toggleBackIcon) return;
      const inCompanion = this.view === 'companion';
      // 用内联 display 而非依赖 Tailwind 的 hidden 类，确保移动端一定生效
      this.toggleGalaxyIcon.style.display = inCompanion ? 'none' : '';
      this.toggleBackIcon.style.display = inCompanion ? '' : 'none';
      if (this.toggleBtn) {
        this.toggleBtn.setAttribute('aria-label', inCompanion ? '返回主星系' : '切换到伴星系');
      }
    },

    // 同步暂停按钮图标（播放中 -> 暂停竖条；已暂停 -> 播放三角）
    syncPauseButton() {
      if (!this.pauseIcon || !this.playIcon) return;
      this.pauseIcon.style.display = this.paused ? 'none' : '';
      this.playIcon.style.display = this.paused ? '' : 'none';
      if (this.pauseBtn) {
        this.pauseBtn.setAttribute('aria-label', this.paused ? '恢复星系旋转' : '暂停星系旋转');
      }
    },

    updateCamera(dt) {
      const k = Math.min(1, dt * 3.5);
      if (this.view === 'companion' && this.companion) {
        const wp = new THREE.Vector3();
        this.companion.getWorldPosition(wp);

        // 相机从伴星系"外侧"围绕其旋转（跟随公转），叠加用户四元数轨道旋转，无万向锁、可任意连续翻转
        const radialYaw = Math.atan2(wp.x, wp.z);
        const radialQuat = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, radialYaw);
        const baseOff = new THREE.Vector3(0, 0, this.orbitDist);
        const off = baseOff.clone().applyQuaternion(this.orbitQuat).applyQuaternion(radialQuat);

        this.camera.position.lerp(wp.clone().add(off), k);

        // 朝向直接用四元数决定（避免 lookAt 在极点处的万向锁翻转）
        const orient = radialQuat.clone().multiply(this.orbitQuat);
        this.camera.quaternion.slerp(orient, k);
      } else {
        this.camera.position.lerp(new THREE.Vector3(0, 12, 26), k);
        this.camera.lookAt(0, 0, 0);
      }
    },

    resize() {
      const width = window.innerWidth;
      const height = window.innerHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    },

    animate() {
      const step = () => {
        const dt = this.clock.getDelta();
        if (!this.paused) {
          if (this.material) {
            this.material.uniforms.uTime.value += dt;
          }
          // 伴星系公转 + 自转，友链粒子绕伴星系自转（与伴星系自转速度相当）
          if (this.companionPivot) this.companionPivot.rotation.y += dt * 0.12;
          if (this.companion) this.companion.rotation.y += dt * 0.15;
          if (this.linkGroup) this.linkGroup.rotation.y += dt * 0.15;
        }
        // 友链粒子轻微脉动，更显眼（体积更小、更亮）
        if (this.linkAnchors && this.material) {
          const pulse = 1 + 0.15 * Math.sin(this.material.uniforms.uTime.value * 3);
          for (const link of this.linkAnchors) {
            link.sprite.scale.set(0.8 * pulse, 0.8 * pulse, 1);
          }
        }

        // 常态显示友链名称标签（仅伴星系视角，跟随投影位置）
        if (this.linkAnchors && this.linkLabels) {
          const show = this.view === 'companion';
          for (let i = 0; i < this.linkAnchors.length; i++) {
            const label = this.linkLabels[i];
            if (!label) continue;
            if (!show) { label.style.display = 'none'; continue; }
            const s = this.projectToScreen(this.linkAnchors[i].anchor.getWorldPosition(new THREE.Vector3()));
            if (s.z < 1) {
              label.style.display = 'block';
              label.style.left = s.x + 'px';
              label.style.top = (s.y - 22) + 'px';
            } else {
              label.style.display = 'none';
            }
          }
        }
        this.updateCamera(dt);
        this.renderer.render(this.scene, this.camera);
        this.rafId = requestAnimationFrame(step);
      };
      this.rafId = requestAnimationFrame(step);
    },

    destroy() {
      cancelAnimationFrame(this.rafId);
      window.removeEventListener('resize', this.onResize);
      window.removeEventListener('mousemove', this.onMove);
      window.removeEventListener('mouseleave', this.onLeave);
      document.removeEventListener('pointerdown', this.onPointerDown);
      document.removeEventListener('pointermove', this.onPointerMove);
      document.removeEventListener('pointerup', this.onPointerUp);
      document.removeEventListener('click', this.onClick);
      if (this.galaxy) {
        this.galaxy.geometry.dispose();
        this.material.dispose();
      }
      if (this.companion) {
        this.companion.geometry.dispose();
        this.companion.material.dispose();
      }
      if (this.linkAnchors) {
        for (const link of this.linkAnchors) {
          if (link.sprite) {
            if (link.sprite.material.map) link.sprite.material.map.dispose();
            link.sprite.material.dispose();
          }
        }
      }
      if (this.linkLabels) {
        for (const el of this.linkLabels) {
          if (el.parentNode) el.parentNode.removeChild(el);
        }
        this.linkLabels = null;
      }
      if (this.tooltip && this.tooltip.parentNode) {
        this.tooltip.parentNode.removeChild(this.tooltip);
      }
      if (this.renderer) {
        this.renderer.dispose();
        if (this.renderer.domElement && this.renderer.domElement.parentNode) {
          this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
      }
    },
  };

  window.Galaxy = Galaxy;
})();