# 《镜玄·风起护你》

## Locked brief

- Character: 镜玄 (`materials/jingxuan`)
- Audience: 女性向国漫 / 二次元受众；高颜值男性角色、强代入感
- Duration: 16.0s, vertical 9:16
- Core promise: 镜玄从云崖落下，在观众视角前挡开危险；近距离回眸、挥袖与收势构成高燃又有距离感的男主出场。
- Visual language: 月夜云崖、白/青蓝/银配色、长发与宽袖的大幅动态、克制的银蓝能量。无第二角色；威胁始终在画外。
- Source rule: every listed source plate is generated at its final framing. The engine adds only secondary camera design; it must not make a distant plate into a close-up.

## Approved identity references

| ID | Role |
| --- | --- |
| `IMAGE_01_FRONT` | 正面身份、眼神、服装锚点 |
| `IMAGE_02_LEFT_45` | 察觉危险、左侧回眸 |
| `IMAGE_03_RIGHT_45` | 右侧转身、长发与宽袖轮廓 |
| `IMAGE_04_FULL_BODY` | 全身落地、前行、收势 |

## Shot plan

| ID | Time | Duration | Source plate to generate | Existing identity reference | Engine camera / time warp | Narrative and performance intent |
| --- | ---: | ---: | --- | --- | --- | --- |
| `s01` | 0.0–1.8 | 1.8s | `JX_LAND_001`: low-angle full body, 镜玄自云崖落地，宽袖和衣摆压出气流 | `IMAGE_04_FULL_BODY` | `HERO_CRASH_IN` / `crash` | 首秒落地，立即给出力量与完整身形。 |
| `s02` | 1.8–3.5 | 1.7s | `JX_APPROACH_001`: full/three-quarter body, 向观众走近两步，冷静直视 | `IMAGE_04_FULL_BODY`, `IMAGE_01_FRONT` | `REVERSE_PULL` / `steady` | 低机位营造压迫感；脸和衣袍都保持清晰。 |
| `s03` | 3.5–5.0 | 1.5s | `JX_NOTICE_LEFT_001`: left 45° half body, 察觉画外危险后迅速偏头 | `IMAGE_02_LEFT_45` | `FACE_CROSS_LEFT` / `accelerate` | 侧脸、眉眼和发丝是第一段颜值爆点。 |
| `s04` | 5.0–6.8 | 1.8s | `JX_WARD_001`: half/full body, 单次利落挥袖/抬手，银蓝护障在镜头前展开 | `IMAGE_01_FRONT`, `IMAGE_04_FULL_BODY` | `WHIP_RIGHT` / `whip` | “他替观众挡下攻击”；避免复杂多指手部特写。 |
| `s05` | 6.8–8.8 | 2.0s | `JX_GAZE_001`: front close-up, 能量散开后低头看向镜头，冷意稍缓 | `IMAGE_01_FRONT` | `EYE_PUSH` / `hold` | 最重要的贴脸镜头；源图直接按近景生成，engine zoom 只轻推。 |
| `s06` | 8.8–10.8 | 2.0s | `JX_TURN_RIGHT_001`: right 45° medium shot, 回身转动，长发和宽袖完整甩开 | `IMAGE_03_RIGHT_45` | `FACE_CROSS_RIGHT` / `release` | 国漫男主动态轮廓；不让镜头裁切掉长发和衣袖运动。 |
| `s07` | 10.8–12.8 | 2.0s | `JX_SLEEVE_PASS_001`: medium/full body, 向前一步，衣袖/银蓝能量从镜头侧掠过 | `IMAGE_01_FRONT`, `IMAGE_04_FULL_BODY` | `WHIP_RIGHT` / `whip` | 全片速度高潮；画面可被衣袖短暂遮挡，但不做复杂战斗。 |
| `s08` | 12.8–14.4 | 1.6s | `JX_SETTLE_001`: front three-quarter medium shot, 动作结束站定，衣袍与长发回落 | `IMAGE_04_FULL_BODY`, `IMAGE_01_FRONT` | `REVERSE_ORBIT` / `settle` | 让观众重新看清脸、服装和力量余韵。 |
| `s09` | 14.4–16.0 | 1.6s | `JX_FINAL_LOOK_001`: front extreme close-up, 微抬眼，银蓝微光从衣纹熄灭 | `IMAGE_01_FRONT` | `EYE_PUSH` / `hold` | 干净、可循环、适合截帧传播的最终定格。 |

## Generation batch order

1. `JX_LAND_001`, `JX_APPROACH_001`, `JX_NOTICE_LEFT_001`
2. `JX_WARD_001`, `JX_GAZE_001`, `JX_TURN_RIGHT_001`
3. `JX_SLEEVE_PASS_001`, `JX_SETTLE_001`, `JX_FINAL_LOOK_001`

Before each Kling job: use the matching identity reference(s), state the source plate's final framing in the prompt, select the current high-resolution model from `kling who_am_i`, and record the request before submission. Generated clips remain `pending-human` until reviewed and explicitly approved.
