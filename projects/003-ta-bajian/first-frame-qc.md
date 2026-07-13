# First Frame QC — FF01–FF10

状态：AI-assisted review 已完成；FF02、FF09 存在已知视觉风险，但用户确认保留，全部首帧可进入后续制作。

## Technical checks

- 发现首帧：10 张
- 尺寸：全部 941×1672，约 9:16
- 格式：RGB PNG
- 可见文字 / logo / 水印：未发现
- 4K workflow note：尺寸适合作为 Kling 输入参考，但不是最终 4K 视频尺寸；Kling 负责输出 4K source plate

## Results

| File | Status | Decision |
|---|---|---|
| `FF01_D01_throat_standoff.png` | Pass | 女主确实是低位跪姿，人物高度关系、男主半侧背影、剑锋抵喉、万剑和天门都成立；第一眼能读成“男人正在处决跪地女人”。 |
| `FF02_M01_male_raise_sword.png` | User-approved exception | 男主左上握住的剑柄与护手是一把剑，但画面右侧另有一段没有连接到护手的独立剑身，形成断剑/重复剑风险；用户确认保留，后续动画需避免强化该断裂关系。 |
| `FF03_F01_female_look_up.png` | Pass with note | 女主脸、黑发、暗金符印、红眼、黑红服装和 Element 一致；剑锋横向位置清楚。当前眼神已经接近直视镜头，不是完全“尚未抬眼”，但仍可作为 S03 的微动作起点，无需返工。 |
| `FF04_M02_male_slash_setup.png` | Pass with note | 男主预备落剑姿态清楚，手、护手、剑身连续可读；剑尖出画面上缘，但不影响“举剑待落”的动作起点。 |
| `FF05_P01_chain_break_insert.png` | Pass | 放大检查后，冰蓝剑刃明确插入暗金链环，未断裂、未悬空、未出现重复剑；链环受力点清楚，适合作为断链前一刻。 |
| `FF06_D02_male_turn_protect.png` | Pass with note | 男主前景、女主后下方跪姿和空中下坠万剑的关系成立；女主尺寸较小，但仍能读出“男主即将转身保护跪地女主”。 |
| `FF07_M03_male_sword_screen.png` | Pass | 男主双手横剑、完整透明剑幕、后景女主和上方金色神剑层次清楚；男主手中剑的护手到剑身连续，无多剑混淆。 |
| `FF08_M04_shield_break_wound.png` | Pass | 放大检查后，男主手中冰蓝剑、裂开的剑幕和右侧金色来剑均可区分；来剑抵达剑幕但未穿透，衣袍只有小破口，无血腥硬伤。 |
| `FF09_F02_female_awakening_close.png` | User-approved exception | 眉心封印之外，额头、鼻梁和双颊还出现多条像皮肤裂开的细线；这可能被读成脸部裂纹或受伤，但用户确认保留，后续动画需避免继续扩大裂纹。 |
| `FF10_D03_female_rise_sword_reverse.png` | Pass | 女主已站立、男主在后侧、万剑仍统一指向两人的反转前构图成立；两人身份、站位和后续调转方向的动作空间清楚。 |

## FF02 known risk (kept by user decision)

原返工约束仅作为后续动画避险参考：尽量避免让男主手中剑与右侧独立剑身发生连接、分裂或复制变化；不再重新生成本图。

## FF09 known risk (kept by user decision)

原返工约束仅作为后续动画避险参考：避免让脸部细线继续扩张或被表现为新增伤口；不再重新生成本图。
