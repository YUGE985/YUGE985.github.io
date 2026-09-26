import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ============================================================
   GLSL: Simplex Noise 3D
   ============================================================ */
const noiseGLSL = `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(
    i.z+vec4(0.0,i1.z,i2.z,1.0))
    +i.y+vec4(0.0,i1.y,i2.y,1.0))
    +i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;

/* ============================================================
   中心变形几何体 — 着色器
   ============================================================ */
const coreVertex = `
${noiseGLSL}
uniform float uTime;
uniform float uNoiseScale;
uniform float uNoiseStrength;
varying float vDisplacement;
varying vec3 vNormalW;
varying vec3 vViewPos;

void main(){
  float n1=snoise(position*uNoiseScale+uTime*0.25);
  float n2=snoise(position*uNoiseScale*2.3+uTime*0.4)*0.5;
  float n3=snoise(position*uNoiseScale*0.5+uTime*0.15)*0.7;
  float displacement=(n1+n2+n3)*uNoiseStrength;
  vDisplacement=displacement;

  vec3 newPos=position+normal*displacement;
  vec4 mvPos=modelViewMatrix*vec4(newPos,1.0);
  vViewPos=-mvPos.xyz;
  vNormalW=normalize(normalMatrix*normal);
  gl_Position=projectionMatrix*mvPos;
}
`;

const coreFragment = `
uniform float uTime;
varying float vDisplacement;
varying vec3 vNormalW;
varying vec3 vViewPos;

void main(){
  float t=vDisplacement*1.8+0.5;

  vec3 cPurple =vec3(0.62,0.50,0.98);
  vec3 cPink   =vec3(0.96,0.42,0.68);
  vec3 cBlue   =vec3(0.35,0.60,0.98);
  vec3 cCyan   =vec3(0.18,0.82,0.68);

  vec3 col=mix(cPurple,cPink,smoothstep(-0.25,0.25,t));
  col=mix(col,cBlue,smoothstep(0.0,0.55,t+sin(uTime*0.4)*0.15));
  col=mix(col,cCyan,smoothstep(0.25,0.75,t*0.5+0.3));

  // Fresnel edge glow
  vec3 V=normalize(vViewPos);
  float fres=pow(1.0-max(dot(V,vNormalW),0.0),2.2);
  col+=fres*vec3(0.45,0.65,1.0)*1.1;

  // Inner glow from displacement
  float glow=0.55+vDisplacement*1.6;
  col*=glow;

  gl_FragColor=vec4(col,1.0);
}
`;

/* ============================================================
   粒子着色器（星云 / 光环 / 星空通用）
   ============================================================ */
const particleVertex = `
attribute float aSize;
attribute vec3 aColor;
attribute float aOffset;
uniform float uTime;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vAlpha;

void main(){
  vColor=aColor;
  vec3 pos=position;
  pos.y+=sin(uTime*0.5+aOffset*6.28)*0.15;
  vec4 mvPos=modelViewMatrix*vec4(pos,1.0);
  gl_Position=projectionMatrix*mvPos;
  gl_PointSize=aSize*uPixelRatio*(300.0/-mvPos.z);
  vAlpha=0.5+0.5*sin(uTime*1.2+aOffset*12.0);
}
`;

const particleFragment = `
varying vec3 vColor;
varying float vAlpha;
void main(){
  float d=length(gl_PointCoord-0.5);
  if(d>0.5)discard;
  float alpha=smoothstep(0.5,0.0,d)*vAlpha;
  gl_FragColor=vec4(vColor,alpha);
}
`;

/* ============================================================
   初始化
   ============================================================ */
const canvas = document.getElementById('scene');
const loader = document.getElementById('loader');

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x020108, 0.018);

const camera = new THREE.PerspectiveCamera(
  60, window.innerWidth / window.innerHeight, 0.1, 200
);
camera.position.set(0, 0.5, 11);

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false
  });
} catch (err) {
  loader.classList.add('hidden');
  const fallback = document.createElement('div');
  fallback.style.cssText = 'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#c4b5fd;font-size:18px;line-height:1.8;text-align:center;padding:24px;z-index:50;';
  fallback.innerHTML = '<div style="font-size:22px;margin-bottom:12px;">当前浏览器不支持 WebGL</div>无法渲染 3D 星云<br><br>请使用最新版 Chrome / Safari / Edge<br>或开启硬件加速后重试';
  document.body.appendChild(fallback);
  throw err;
}
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

/* ============================================================
   后处理 — Bloom
   ============================================================ */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.1,   // strength
  0.7,   // radius
  0.0    // threshold
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

/* ============================================================
   中心变形几何体
   ============================================================ */
const coreGeo = new THREE.IcosahedronGeometry(2.2, 64);
const coreMat = new THREE.ShaderMaterial({
  vertexShader: coreVertex,
  fragmentShader: coreFragment,
  uniforms: {
    uTime:          { value: 0 },
    uNoiseScale:    { value: 0.55 },
    uNoiseStrength: { value: 0.55 }
  }
});
const core = new THREE.Mesh(coreGeo, coreMat);
scene.add(core);

// 内核外的线框层
const wireGeo = new THREE.IcosahedronGeometry(2.25, 2);
const wireMat = new THREE.MeshBasicMaterial({
  color: 0x8b7cf6, wireframe: true, transparent: true, opacity: 0.08
});
const wireframe = new THREE.Mesh(wireGeo, wireMat);
scene.add(wireframe);

/* ============================================================
   粒子星云
   ============================================================ */
function createNebula(count, innerR, outerR) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors    = new Float32Array(count * 3);
  const sizes     = new Float32Array(count);
  const offsets   = new Float32Array(count);

  const palette = [
    new THREE.Color(0xa78bfa),
    new THREE.Color(0xf472b6),
    new THREE.Color(0x60a5fa),
    new THREE.Color(0x34d399),
    new THREE.Color(0xfbbf24)
  ];

  for (let i = 0; i < count; i++) {
    // 球壳分布
    const r = innerR + Math.random() * (outerR - innerR);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i*3+2] = r * Math.cos(phi);

    const c = palette[Math.floor(Math.random() * palette.length)];
    colors[i*3]   = c.r;
    colors[i*3+1] = c.g;
    colors[i*3+2] = c.b;

    sizes[i]   = Math.random() * 2.5 + 0.8;
    offsets[i] = Math.random();
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor',   new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aOffset',  new THREE.BufferAttribute(offsets, 1));

  const mat = new THREE.ShaderMaterial({
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    uniforms: {
      uTime:       { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  return new THREE.Points(geo, mat);
}

const nebula = createNebula(6000, 4, 14);
scene.add(nebula);

/* ============================================================
   粒子光环（3 个不同角度）
   ============================================================ */
function createRing(count, radius, width, colorHex, tiltX, tiltZ) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors    = new Float32Array(count * 3);
  const sizes     = new Float32Array(count);
  const offsets   = new Float32Array(count);
  const baseColor = new THREE.Color(colorHex);

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = radius + (Math.random() - 0.5) * width;
    positions[i*3]   = Math.cos(angle) * r;
    positions[i*3+1] = (Math.random() - 0.5) * width * 0.3;
    positions[i*3+2] = Math.sin(angle) * r;

    const variation = 0.7 + Math.random() * 0.6;
    colors[i*3]   = baseColor.r * variation;
    colors[i*3+1] = baseColor.g * variation;
    colors[i*3+2] = baseColor.b * variation;

    sizes[i]   = Math.random() * 2 + 0.6;
    offsets[i] = Math.random();
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor',   new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aOffset',  new THREE.BufferAttribute(offsets, 1));

  const mat = new THREE.ShaderMaterial({
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    uniforms: {
      uTime:       { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  const points = new THREE.Points(geo, mat);
  points.rotation.x = tiltX;
  points.rotation.z = tiltZ;
  return points;
}

const ring1 = createRing(2500, 5.5, 1.2, 0xa78bfa, 0.5, 0.2);
const ring2 = createRing(2000, 7.0, 0.8, 0xf472b6, -0.3, 0.6);
const ring3 = createRing(1800, 8.5, 1.5, 0x60a5fa, 0.8, -0.4);
scene.add(ring1, ring2, ring3);

/* ============================================================
   背景星空
   ============================================================ */
function createStarfield(count) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors    = new Float32Array(count * 3);
  const sizes     = new Float32Array(count);
  const offsets   = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const r = 40 + Math.random() * 60;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i*3+2] = r * Math.cos(phi);

    const c = new THREE.Color().setHSL(0.6 + Math.random() * 0.15, 0.3, 0.7 + Math.random() * 0.3);
    colors[i*3]   = c.r;
    colors[i*3+1] = c.g;
    colors[i*3+2] = c.b;

    sizes[i]   = Math.random() * 1.5 + 0.3;
    offsets[i] = Math.random();
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor',   new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize',    new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aOffset',  new THREE.BufferAttribute(offsets, 1));

  const mat = new THREE.ShaderMaterial({
    vertexShader: particleVertex,
    fragmentShader: particleFragment,
    uniforms: {
      uTime:       { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) }
    },
    transparent: true,
    depthWrite: false
  });

  return new THREE.Points(geo, mat);
}

const starfield = createStarfield(2500);
scene.add(starfield);

/* ============================================================
   漂浮几何体（小八面体 / 四面体）
   ============================================================ */
const floaters = [];
const floaterColors = [0xa78bfa, 0xf472b6, 0x60a5fa, 0x34d399];
for (let i = 0; i < 14; i++) {
  const size = 0.12 + Math.random() * 0.25;
  const geo = Math.random() > 0.5
    ? new THREE.OctahedronGeometry(size, 0)
    : new THREE.TetrahedronGeometry(size, 0);
  const mat = new THREE.MeshBasicMaterial({
    color: floaterColors[i % floaterColors.length],
    transparent: true,
    opacity: 0.5 + Math.random() * 0.3,
    wireframe: Math.random() > 0.5
  });
  const mesh = new THREE.Mesh(geo, mat);

  const r = 5 + Math.random() * 8;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  mesh.position.set(
    r * Math.sin(phi) * Math.cos(theta),
    r * Math.sin(phi) * Math.sin(theta),
    r * Math.cos(phi)
  );
  mesh.userData = {
    rotSpeed: new THREE.Vector3(
      (Math.random()-0.5)*0.02,
      (Math.random()-0.5)*0.02,
      (Math.random()-0.5)*0.02
    ),
    floatSpeed: 0.3 + Math.random() * 0.5,
    floatOffset: Math.random() * Math.PI * 2,
    baseY: mesh.position.y
  };
  scene.add(mesh);
  floaters.push(mesh);
}

/* ============================================================
   鼠标交互
   ============================================================ */
const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
window.addEventListener('pointermove', (e) => {
  mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
  mouse.ty = -(e.clientY / window.innerHeight) * 2 + 1;
});

// 触摸支持
window.addEventListener('touchmove', (e) => {
  if (e.touches.length > 0) {
    mouse.tx = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
    mouse.ty = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
  }
}, { passive: true });

/* ============================================================
   动画循环
   ============================================================ */
const clock = new THREE.Clock();
let frameId;

function animate() {
  frameId = requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  // 平滑鼠标
  mouse.x += (mouse.tx - mouse.x) * 0.04;
  mouse.y += (mouse.ty - mouse.y) * 0.04;

  // 相机视差
  camera.position.x = mouse.x * 2.5;
  camera.position.y = 0.5 + mouse.y * 1.8;
  camera.lookAt(0, 0, 0);

  // 中心几何体
  coreMat.uniforms.uTime.value = t;
  core.rotation.y = t * 0.08;
  core.rotation.x = Math.sin(t * 0.15) * 0.15;

  // 线框层反向旋转
  wireframe.rotation.y = -t * 0.05;
  wireframe.rotation.x = t * 0.03;

  // 星云缓慢旋转
  nebula.rotation.y = t * 0.02;
  nebula.rotation.x = t * 0.008;
  nebula.material.uniforms.uTime.value = t;

  // 光环旋转（不同速度）
  ring1.rotation.y = t * 0.06;
  ring2.rotation.y = -t * 0.04;
  ring3.rotation.y = t * 0.03;
  ring1.material.uniforms.uTime.value = t;
  ring2.material.uniforms.uTime.value = t;
  ring3.material.uniforms.uTime.value = t;

  // 星空
  starfield.rotation.y = t * 0.005;
  starfield.material.uniforms.uTime.value = t;

  // 漂浮几何体
  for (const f of floaters) {
    f.rotation.x += f.userData.rotSpeed.x;
    f.rotation.y += f.userData.rotSpeed.y;
    f.rotation.z += f.userData.rotSpeed.z;
    f.position.y = f.userData.baseY + Math.sin(t * f.userData.floatSpeed + f.userData.floatOffset) * 0.5;
  }

  // Bloom 强度呼吸
  bloomPass.strength = 1.0 + Math.sin(t * 0.6) * 0.15;

  composer.render();
}

/* ============================================================
   响应式
   ============================================================ */
window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.setSize(w, h);

  const pr = Math.min(window.devicePixelRatio, 2);
  nebula.material.uniforms.uPixelRatio.value = pr;
  ring1.material.uniforms.uPixelRatio.value = pr;
  ring2.material.uniforms.uPixelRatio.value = pr;
  ring3.material.uniforms.uPixelRatio.value = pr;
  starfield.material.uniforms.uPixelRatio.value = pr;
});

/* ============================================================
   启动
   ============================================================ */
// 隐藏加载层
setTimeout(() => {
  loader.classList.add('hidden');
}, 600);

animate();
