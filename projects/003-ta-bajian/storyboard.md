# 《他拔剑，不是为了杀她》Storyboard Draft

## Production lock

- Mode: `mv + short-drama`
- Duration: 18 seconds
- Output: 2160×3840, 60FPS, 9:16
- BGM: `audio/jane-18s.wav`
- Audio: 98 BPM, 4/4; automatic accent map is a draft
- Source generation: **not started**; every planned plate must pass materials registry and human QC before integration

## Music-driven shot plan

| Shot | Time | Story beat | Audio / sync intent | Planned plate | Camera / warp |
|---|---:|---|---|---|---|
| S01 | 0.0–1.2 | 剑锋抵喉，首帧让观众误判男主要杀她 | Hold through beat 0.821; keep the 0.325 hook readable | D01 双人剑锋抵喉 | 弱 FACE_CROSS_LEFT / hold |
| S02 | 1.2–2.6 | 万剑压境，男主抬剑 | Accelerate into beat 1.433 | M01 男主抬剑 | 弱 HERO_CRASH_IN / accelerate |
| S03 | 2.6–4.2 | 女主抬眼，露出“她早知道” | Hold on accent 3.413, do not overcut | F01 女主抬眼 | EYE_PUSH / hold |
| S04 | 4.2–5.6 | 落剑斩断锁链，第一次反转 | Impact at accent 5.039; keep sword motion and chain insert separate | P01 锁链断裂特写 | WHIP_RIGHT / whip |
| S05 | 5.6–7.8 | 男主转身挡在她与万剑之间 | Reveal at accent 6.687; settle on downbeat 7.556 | D02 男主转身保护 | REVERSE_PULL / release |
| S06 | 7.8–9.8 | 男主独挡万剑 | Impact at 8.731; source plate carries the collision | M03 男主剑幕 | 弱 HERO_CRASH_IN / crash |
| S07 | 9.8–11.6 | 剑幕破裂，男主受伤，女主起身 | Impact 10.379; reveal her silhouette by 11.229 | M04 屏障破裂受伤 | FACE_CROSS_RIGHT / accelerate |
| S08 | 11.6–13.6 | 女主睁眼，万物突然静止 | Full reveal at accent 13.235; no motion blur | F02 女主觉醒近景 | EYE_PUSH / hold |
| S09 | 13.6–16.2 | 万剑倒转，真正力量属于女主 | Reveal 13.678, major turn on downbeat 14.903 | D03 女主站起万剑倒转 | REVERSE_ORBIT / settle |
| S10 | 16.2–18.0 | “你护错人了”，剑光遮屏循环 | Dialogue hold, swords launch at 16.951, cut to black at 17.964 | D03 reuse / alternate crop | 弱 FACE_CROSS_LEFT / hold→crash |

## Planned source plates

| ID | Type | Required readable action | Constraint |
|---|---|---|---|
| D01 | dual | 男主持剑抵喉，女主抬眼 | locked camera; no complex hand contact |
| M01 | male solo | 握剑、抬剑、万剑符文亮起 | one clear lift peak; no full-screen chaos |
| F01 | female solo | 眼神变化、额心微裂、锁链轻震 | face stable; no head turn |
| P01 | prop insert | 剑光斩断锁链、碎片火星 | separate plate from M01; clear impact frame |
| D02 | dual | 男主转身挡剑，女主在后景跪姿 | one turn and one guard pose; clean settle |
| M03 | male/effect | 剑幕展开并承受万剑碰撞 | shield silhouette must remain legible |
| M04 | male/effect | 剑幕破裂、擦伤、女主后景起身 | restrained injury; no gore; no awakening yet |
| F02 | female close | 睁眼、瞳孔转暗金、封印裂开 | static face; no hair or particle occlusion |
| D03 | dual/effect | 女主站到男主身侧，万剑整齐倒转 | restrained acting; woman is visual center |

## Approval gate

This is an editorial draft, not a final beat lock. Before generating paid footage, confirm:

1. the 0–18 second excerpt is the intended BGM section;
2. the impact points in `timeline-draft.json` match the audible accents;
3. the 10-shot pacing and the two reversal positions are approved.

After approval, create the formal `project.json` / `timeline.json`, then generate and QC the registry materials one plate at a time.
