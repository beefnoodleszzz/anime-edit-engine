# Anime Edit Engine V1

基于《AI Source Plate → 4K/120FPS High-Fidelity Anime Edit Engine V1 技术实施规格书》实现的确定性动漫 Source Plate 二次摄影引擎。它不生成 AI 视频，也不包含 3D 角色或 Web 编辑器。

## 已实现的 V1 核心

- `hf-seek` 绝对时间驱动；每一帧由 `Director.resolve(time)` 重建，未使用 `Date.now`、`performance.now`、rAF 累积状态或随机数。
- Source Library、Hero Range、精确 Source Video seek、Beat Timeline 与积分归一化 Time Warp。
- 数据驱动的 Edit Camera：Crash In、Face Cross、Eye Push、Whip、Reverse Pull、Reverse Orbit；含逐帧速度计算。
- WebGL 2D compositor：相机变换、多采样速度路径 blur、CAPE_WIPE 色彩桥、选择性 glow、速度驱动色差、确定性 grain、微锐化。
- DRAFT / REVIEW / MASTER 三档参数；MASTER 输出为 2160×3840、120FPS PNG sequence。
- 单元测试覆盖项目连续性、确定性 Director、Hero Range、Time Warp 单调性和镜头速度。

## 参考素材

`assets/sources/wow.mp4` 已保留原始参考；`assets/sources/wow-normalized.mp4` 是供 Chrome/WebGL 精确 seek 的高质量 H.264 Source Intermediate。配置将其切分为 7 个 demo Source。替换为正式 Kling 资产时，只需替换 `projects/001-demo/project.json` 的 Source Clip 文件与 Hero Range，不改引擎。

## 工作流

```bash
npm install
npm run test
npm run check
npm run dev
```

`npm run dev` 会启动 HyperFrames Studio；不要用普通 Vite 静态服务器直接打开 `index.html`，因为它不会分发引擎所需的 `hf-seek` 绝对时间事件。

通过 Studio 审看后再渲染：

```bash
npm run render:draft
npm run render:review
npm run render:master
```

`render:master` 输出 960 张 PNG 到 `renders/frames/`，随后以高质量 H.264 编码为 `renders/master/master-4k-120.mp4`。

## 素材工具

```bash
npm run inspect:source -- assets/sources/wow.mp4
npm run contact-sheet -- assets/sources/wow.mp4 renders/preview/contact-sheet.jpg
npm run detect-cuts -- assets/sources/wow.mp4
npm run normalize-source -- incoming/source.mov assets/sources/source-normalized.mp4
```
