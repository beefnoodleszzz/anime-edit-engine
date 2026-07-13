# 《镜玄·风起护你》— Source Plate 生成提交清单（claude-cli 执行）

> 本清单只负责“生成 9 段视频源片”这一步。Kling 的 MCP/CLI/skills 接在 **claude-cli** 环境，不在 Cowork。
> 请在 claude-cli 里、`materials-registry` skill 的约束下逐镜提交；每次计费前先跟用户确认。
> Cowork 已完成：storyboard 锁定、4 张身份参考图就位、gen-0011~0019 的 `request.json` 骨架已预建。

## 0. 执行前必做

1. ~~先查 gen-0010 丢单~~ **已解决（2026-07-12）**：用户决定不再追查 gen-0006/0008/0009/0010；9 张 source plate 已由用户在外部生成并入库 `materials/jingxuan/references/JX_*_001.png`（941×1672，manifest 已登记）。四条悬案的 request.json 已标记 `abandoned-superseded-by-external-plates`，仅留计费存档。
2. **发现连接器实际工具名**（skill 5.1）：本会话可能叫 `who_am_i` / `image_to_video` / `query_tasks`，也可能不同，先查清楚再调，不要凭记忆传参。
3. **确认当前高分辨率模型**：默认 `kling-video-v3_0`（单 `first_image`，分辨率可达 4k），不用 `_omni`（多图但限 1080p）。理由：给引擎相机的 zoom/crop 留真实像素细节。
4. **first_image 已改为逐镜 plate**：每镜直接用对应的 `JX_*_001.png` 作 first_image（不再用 IMAGE_0X 身份参考图）。plate 分辨率为 941×1672，低于 1080p——输出仍按 4k 提交，但细节上限受源图限制，QC 时留意软化。第 6 节的两步法讨论已过时（贴脸 plate 已就位）。

## 1. 生成参数（全 9 镜通用）

| 项 | 值 |
| --- | --- |
| tool | `image_to_video` |
| model | `kling-video-v3_0` |
| resolution | `4k`（who_am_i 已确认本会话支持：720p/1080p/4k） |
| aspect_ratio | 无此参数（v3_0 输出比例跟随 first_image；plate 为 9:16 竖幅） |
| duration | 动作镜头 `4`（s01/s04/s06/s07），微动作情绪镜头 `3`（s02/s03/s05/s08/s09）。who_am_i 确认 v3_0 支持 3–15s。掐头（~0.5s 起动）去尾（漂移）后按 heroRange 取用，storyboard 里的 1.5–2.0s 是成片时长 |
| prefer_multi_shots | `false`（v3_0 默认 true，必须显式关掉，要单镜头连续素材） |
| enable_audio | `false` |
| first_image | 单张逐镜 plate，见下表，取自 `materials/jingxuan/references/`（需先经 `file_upload` 上传，v3_0 不收本地路径/外链） |

> **单图约束**：`kling-video-v3_0` 只吃一张 `first_image`。storyboard 里给两个参考的镜头，这里已选“最匹配角度”的那一张；身份一致性靠 prompt 文字补足（skill 5.2）。

## 2. 身份锁定文（每条 prompt 前置，务必保留）

> 镜玄——清冷俊美东方男性面孔，灰蓝色眼睛，直眉；黑色半束长发（半束发髻、发丝垂落肩前）；浅青银色发冠与银蓝垂坠发饰；白色外袍配浅青、深青蓝分层内衬，克制银色刺绣，银色结构肩饰，银色腰封。冷色调、月夜云崖、顶级中国 3D 国漫电影质感，发丝/布料/刺绣/皮肤材质精细。严格保持身份与配色不变。

## 3. 负面词（每条 prompt 结尾附上）

> 不要其他人物、武器实体特写、复杂多指手部特写、暖色主调、现代服饰或道具、巨大头冠/角/翅膀/面具、畸形手、多余肢体、文字、水印、logo、海报排版。

## 4. 逐镜提交表

| gen | shot | 时间/时长 | source plate | first_image | 引擎相机 / 时间扭曲 |
| --- | --- | --- | --- | --- | --- |
| gen-0011 | s01 | 0.0–1.8 / 1.8s | JX_LAND_001 | `JX_LAND_001.png` | HERO_CRASH_IN / crash |
| gen-0012 | s02 | 1.8–3.5 / 1.7s | JX_APPROACH_001 | `JX_APPROACH_001.png` | REVERSE_PULL / steady |
| gen-0013 | s03 | 3.5–5.0 / 1.5s | JX_NOTICE_LEFT_001 | `JX_NOTICE_LEFT_001.png` | FACE_CROSS_LEFT / accelerate |
| gen-0014 | s04 | 5.0–6.8 / 1.8s | JX_WARD_001 | `JX_WARD_001.png` | WHIP_RIGHT / whip |
| gen-0015 | s05 | 6.8–8.8 / 2.0s | JX_GAZE_001 | `JX_GAZE_001.png` | EYE_PUSH / hold |
| gen-0016 | s06 | 8.8–10.8 / 2.0s | JX_TURN_RIGHT_001 | `JX_TURN_RIGHT_001.png` | FACE_CROSS_RIGHT / release |
| gen-0017 | s07 | 10.8–12.8 / 2.0s | JX_SLEEVE_PASS_001 | `JX_SLEEVE_PASS_001.png` | WHIP_RIGHT / whip |
| gen-0018 | s08 | 12.8–14.4 / 1.6s | JX_SETTLE_001 | `JX_SETTLE_001.png` | REVERSE_ORBIT / settle |
| gen-0019 | s09 | 14.4–16.0 / 1.6s | JX_FINAL_LOOK_001 | `JX_FINAL_LOOK_001.png` | EYE_PUSH / hold |

> first_image 均位于 `materials/jingxuan/references/`，为用户外部生成的逐镜 plate（2026-07-12 入库）。prompt 中的动作描述保持不变——plate 已给出首帧构图，prompt 负责让画面从这一帧动起来。

### 生成批次顺序（同 storyboard）

1. gen-0011, gen-0012, gen-0013
2. gen-0014, gen-0015, gen-0016
3. gen-0017, gen-0018, gen-0019

## 5. 每镜完整 prompt（身份锁定文 + 下述动作/景别 + 负面词）

**gen-0011 · JX_LAND_001（低机位全身落地）** — first_image: IMAGE_04_FULL_BODY
低机位全身镜头，镜玄刚从云崖高处落地的瞬间，双脚触地、微屈膝的落地姿态，宽袖、长袍下摆与长发被落地气流向上、向外压开，力量感强烈；从头到脚完整可见，人物约占画面高度 80–85%。背景：月夜云崖边缘、薄雾云海、冷月边光。开场首秒即有明确出场动作。

**gen-0012 · JX_APPROACH_001（全身/3/4 身走近）** — first_image: IMAGE_04_FULL_BODY
略低机位全身或四分之三身，镜玄向镜头方向沉稳走近两步，冷静直视前方，衣袍与长发随步伐轻微摆动，低机位带出压迫感；脸与服装始终清晰，人物约占画面高度 75–85%。背景同为月夜云崖薄雾。

**gen-0013 · JX_NOTICE_LEFT_001（左 45 度半身察觉）** — first_image: IMAGE_02_LEFT_45
左 45 度半身，镜玄本面向左方，察觉画外危险后头部迅速向镜头方向偏转约 15 度，眼神锐利而克制；侧脸、眉眼与发丝是重点，仅靠左几缕发丝与宽袖边缘轻微后拖，其余保持稳定，给后续挥袖留动作空间。人物约占画面高度 65%，脸位于画面右侧三分之一，左侧留干净负空间。

**gen-0014 · JX_WARD_001（半身/全身挥袖挡开）** — first_image: IMAGE_04_FULL_BODY
正面半身或全身，镜玄单次利落地挥袖/抬手向镜头前方挡开，一层薄而克制的银蓝色能量护障在镜头前短暂展开（非爆炸粒子），宽袖大幅甩动，动作干脆；传达“他替你挡下攻击”的代入感。避免复杂多指手部特写与繁杂战斗。

**gen-0015 · JX_GAZE_001（正面近景凝视）** — first_image: IMAGE_01_FRONT
正面近景（胸像至半脸），能量散开后镜玄微微低头看向镜头，眼神从冷冽转为略缓，发丝、发冠与肩饰清晰锐利；这是全片最重要的贴脸段落，直接按近景生成，脸部占画面主要区域。冷月边光分离发丝与肩部。

**gen-0016 · JX_TURN_RIGHT_001（右 45 度中景转身）** — first_image: IMAGE_03_RIGHT_45
右 45 度中景，镜玄回身向右转动，长发与宽袖大幅甩开、完整划过画面，是国漫男主最有效的动态轮廓；不要裁切掉长发与衣袖的运动。人物约占画面高度 70%。

**gen-0017 · JX_SLEEVE_PASS_001（中景/全身衣袖掠镜）** — first_image: IMAGE_04_FULL_BODY
中景或全身，镜玄向前一步，宽袖与银蓝能量残光从镜头侧后方掠过前景，画面可被衣袖短暂遮挡，速度感强，是全片速度高潮；保持动作简洁，不做复杂战斗。

**gen-0018 · JX_SETTLE_001（正面 3/4 中景收势站定）** — first_image: IMAGE_01_FRONT
正面四分之三中景，动作结束后镜玄站定，衣袍与长发仍在缓缓回落，让观众重新看清脸、服装与力量余韵，气质沉稳克制。人物约占画面高度 70%。

**gen-0019 · JX_FINAL_LOOK_001（正面极近景最终定格）** — first_image: IMAGE_01_FRONT
正面极近景（脸部特写），镜玄微微抬眼、嘴角极轻地松开，衣纹上的银蓝微光缓缓熄灭；干净、可循环、适合截帧传播的最终定格，脸部充满画面。

## 6. 关于极近景（s05 / s09）的取舍提示

`IMAGE_01_FRONT` 是竖幅正面半身/肖像。用它作 first_image 直接生成“近景/极近景”，Kling 可能推近不足或裁切生硬。两条路，执行时择一并告诉用户：

- **单步（本清单默认，便宜，9 个计费任务）**：直接 image_to_video，prompt 里强写“近景/极近景、脸部充满画面”。先出片看效果。
- **两步（更贵，贴脸更稳）**：先 `image_to_image` 从 IMAGE_01_FRONT 生成一张“脸部特写第一帧板”，再以它作 first_image 做 image_to_video。会多 2 个计费任务，且要各占一个新的 gen-id（如 gen-0020、gen-0021），不复用。

## 7. 每镜落地流程（skill 6–12，claude-cli 内执行）

1. 计费前 4 项确认给用户：model、prompt、first_image、时长/分辨率与本批计费任务数（skill 5.4）。
2. 提交前把真实 `submittedAt` 与返回的 `providerTaskId` 补回对应 `gen-NNNN/request.json`。
3. Kling 输出 URL 24h 过期——尽快下载 `output.mp4`（优先 `urlWithoutWatermark`），`ffprobe` + 算 sha256 后写 `result.json`。
4. AI 辅助 QC（contact sheet / 水印 / 一致性 / 提议结构化 `heroRanges`），写 `qc.status: "pending-human"`、`reviewedBy: "ai-assisted"`。**AI 不得自批 approved / human**。
5. 用户逐条 approve 后，`output.mp4` → `materials/jingxuan/clips/<PLATE>.mp4`，写 `clips.json`。
6. 接入 `002-jingxuan` 的 project.json / timeline.json / 合成源声明，`npm run materials:sync` 再 `materials:validate`，最后 `render:validation` 真渲染验证。

## 8. gen-id 台账

jingxuan 现有 gen-0001~gen-0010（全是身份参考图 image_to_image/text_to_image）。本次视频源片占用 **gen-0011~gen-0019**。任何失败也不得复用这些 id（skill 红线）。
