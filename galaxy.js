/**
 * galaxy.js — 基于 Three.js 的程序化螺旋星系背景
 * GPU 渲染约 9 万粒子（移动端约 2.2 万）：中心亮核 + 2 条主旋臂 + 絮状星云/星团 + 稀疏晕。
 * 颜色暖白核 -> 橙 -> 蓝紫 -> 深蓝，絮状物为偏暗的星云色调。
 * 鼠标靠近时粒子被轻微吸引并增亮；按住空白处可绕 X/Y 轴任意翻转星系（无角度限制）。
 * 暴露 window.Galaxy.init() / destroy()。
 */
(function () {
  'use strict';

  const X_AXIS = new THREE.Vector3(1, 0, 0);
  const Y_AXIS = new THREE.Vector3(0, 1, 0);

  // 移动端：降低粒子数、禁用拖拽旋转，保证流畅
  const IS_MOBILE = window.matchMedia('(pointer: coarse)').matches || window.innerWidth <= 768;

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
    dragging: false,
    lastX: 0,
    lastY: 0,

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

      this.onResize = () => this.resize();
      this.onMove = (e) => this.setMouse(e.clientX, e.clientY);
      this.onLeave = () => this.setMouse(null);
      window.addEventListener('resize', this.onResize);
      window.addEventListener('mousemove', this.onMove);
      window.addEventListener('mouseleave', this.onLeave);

      this.onPointerDown = (e) => this.pointerDown(e);
      this.onPointerMove = (e) => this.pointerMove(e);
      this.onPointerUp = () => { this.dragging = false; };
      document.addEventListener('pointerdown', this.onPointerDown);
      document.addEventListener('pointermove', this.onPointerMove);
      document.addEventListener('pointerup', this.onPointerUp);

      this.clock = new THREE.Clock();
      this.animate();
    },

    setMouse(cx, cy) {
      if (!this.material) return;
      if (cx === null || cy === null) {
        this.material.uniforms.uMouse.value.set(10, 10);
        return;
      }
      const nx = (cx / window.innerWidth) * 2 - 1;
      const ny = -(cy / window.innerHeight) * 2 + 1;
      this.material.uniforms.uMouse.value.set(nx, ny);
    },

    // 拖拽转动：命中恒星或面板时不响应，避免影响原有交互
    pointerDown(e) {
      if (IS_MOBILE) return;
      const t = e.target;
      if (t && typeof t.closest === 'function' && (t.closest('.star-node') || t.closest('#panel-layer'))) return;
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
    },

    pointerMove(e) {
      if (IS_MOBILE || !this.dragging || !this.group) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;

      // 左右拖动绕世界 Y（偏航），上下拖动绕世界 X（俯仰），四元数累乘、无角度限制
      const qy = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, dx * 0.005);
      const qx = new THREE.Quaternion().setFromAxisAngle(X_AXIS, dy * 0.005);
      this.group.quaternion.premultiply(qy).premultiply(qx);

      // 同步让星空层产生视差位移（模拟视角转动）
      try { window.Stars && window.Stars.pan(dx, dy); } catch (err) {}
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
          brightness: 0.6 + Math.random() * 0.4,  // 更浓、明暗对比更强
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

    resize() {
      const width = window.innerWidth;
      const height = window.innerHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    },

    animate() {
      const step = () => {
        if (this.material) {
          this.material.uniforms.uTime.value += this.clock.getDelta();
        }
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
      if (this.galaxy) {
        this.galaxy.geometry.dispose();
        this.material.dispose();
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
