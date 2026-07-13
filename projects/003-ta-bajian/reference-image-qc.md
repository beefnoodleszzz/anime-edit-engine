# Reference Image QC — A/B Element Images

状态：AI-assisted review，等待用户最终确认；本报告不等同于 Kling 视频素材批准。

## Technical checks

- 发现图片：6 张，文件名与 A/B 目录约定一致
- 格式：RGB PNG，无透明通道问题
- 尺寸：全部 941×1672，约 9:16
- 可见文字 / logo / 水印：未发现
- 用途判断：适合作为 Kling Character Element 参考图；不应直接替代 4K source plate 首帧

## A — 男主·寒渊剑修

| File | Result | Review |
|---|---|---|
| `M01_male_identity_full.png` | Pass | 全身主参考，脸、银白半束长发、冰蓝额带、银白浅灰蓝长袍、深钢灰腰封、剑鞘均清晰。 |
| `M02_male_identity_face.png` | Pass | 面部细节稳定，与 M01 的眼睛、脸型、发型和额带一致。 |
| `M03_male_guard_pose.png` | Pass | 补充动作角度有效；已拔剑、风吹长发和衣摆适合描述挡剑姿态，但应作为补充图，不作为 Element 主图。 |

### Male anchors to keep

- 银白半束长发
- 浅冰蓝眼睛
- 冰蓝色额带 / 额前饰带
- 银白、浅灰蓝长袍与深钢灰腰封
- 细长冰蓝剑与银灰剑装

## B — 女主·封印灭世者

| File | Result | Review |
|---|---|---|
| `F01_female_identity_full.png` | Pass | 全身主参考，黑暗红长裙、暗金头饰、暗金锁链、黑发和整体轮廓清楚。 |
| `F02_female_identity_face.png` | Pass | 面部、黑发、暗红眼睛和眉心符印与 F01 一致。 |
| `F03_female_awakening_face.png` | Pass | 觉醒补充图有效；暗金眼睛和裂开的眉心符印能明确区分觉醒状态。 |

### Female anchors to keep

- 极长黑发与暗红发丝反光
- 黑色、暗红、暗金服装配色
- 暗金头饰与眉心四向十字形符印
- 未觉醒：深酒红眼睛
- 觉醒：暗金琥珀眼睛、符印裂纹

## Canonicalization notes

1. 男主提示词原本写的是窄冰蓝发带，成图稳定表现为更明显的冰蓝额带；建议把“冰蓝额带”定为正式角色锚点。
2. 女主提示词原本写的是互锁符纹，成图稳定表现为暗金四向十字形符印；三张图一致，建议把这个形状定为正式角色锚点。
3. 两组图都偏高细节国漫/3D 概念设定质感，风格没有明显冲突，可以继续进入 Element 创建。

## Recommendation

建议：A/B 通过 Element 参考图初审，无需重生成。下一步可在用户确认后移动到 `materials/ta-bajian-male/references/` 与 `materials/ta-bajian-female/references/`，再运行 `materials:new-character` 建立两个角色 registry。10 张 source plate 首帧仍需另外生成，不能用这 6 张代替。
