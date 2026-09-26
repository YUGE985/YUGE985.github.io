# Nebula Drift — 星云漂移

一个基于 **Three.js** 的沉浸式 3D 宇宙艺术装置。中心是一颗由 Simplex 噪声实时变形的发光几何体，周围环绕着粒子星云、旋转光环与漂浮晶体，配合 Bloom 辉光后处理和鼠标视差交互。

## 在线预览

访问 [https://YUGE985.github.io/](https://YUGE985.github.io/) 即可体验。

## 技术栈

- **Three.js r160** — 3D 渲染引擎（通过 importmap 从 CDN 加载，零构建）
- **EffectComposer + UnrealBloomPass** — 辉光后处理
- **GLSL ShaderMaterial** — 自定义顶点变形与粒子渲染
- **Simplex Noise 3D** — 几何体实时形变

## 视觉特性

- 中心几何体：64 级细分二十面体，双层噪声驱动顶点位移，颜色随形变动态混合
- 粒子星云：6000 颗彩色粒子分布于球壳，加性混合发光
- 三重粒子光环：不同倾角、颜色与旋转速度
- 背景星空：2500 颗远景星点
- 漂浮晶体：14 个线框/实体八面体与四面体，缓慢自转浮动
- 呼吸式 Bloom 辉光，强度随时间正弦变化
- 鼠标/触摸视差：相机随指针平滑偏移

## 本地运行

由于使用了 ES Module，需要通过 HTTP 服务器打开：

```bash
python3 -m http.server 8080
```

然后访问 `http://localhost:8080`。

## 文件结构

```
.
├── index.html   # 页面入口 + importmap
├── style.css    # 样式与加载动画
├── main.js      # Three.js 场景、着色器、动画逻辑
└── README.md
```

## 许可

MIT
