你需要的不是“给视频加音乐”，而是 音乐驱动剪辑

wow.mp4 卡点好，通常不是因为每个镜头都刚好一样长，而是同时对齐了四件事：

切镜点对齐音乐重拍或段落变化。
人物动作峰值对齐鼓点、Drop、音效瞬态。
相机速度峰值在重拍前加速，并在重拍瞬间落稳。
剑鸣、撞击、锁链断裂等 SFX强化视觉动作。

只把镜头边界放在 BPM 网格上，只完成了第一层。

当前引擎为什么还做不到 wow 那种卡点

现在 timeline.json 虽然有：

{
  "bpm": 100,
  "beats": [0, 0.6, 1.2, 1.8]
}

但 Director 实际只根据 Shot、Camera、TimeWarp 计算画面，没有读取 beats 来控制动作或转场。也就是说，当前的 beats 基本只是记录数据。

第二部时间线也能看出这个问题：BPM 是 100，每拍 0.6 秒，但很多切点是 3.5、5.0、6.8、8.8、10.8，并没有落在 0.6 秒网格上。

此外：

analyze-audio.ts 目前只读取编码、采样率、声道和时长，不分析 BPM、鼓点或强拍。
render-master.ts 只编码 PNG 画面，没有把 BGM、台词和音效混入最终 MP4。

所以必须补一个完整的 Audio Sync Pipeline。

正确工作流
第一步：先定音乐，再设计分镜

不能先把十个视频全部生成出来，最后再找一首音乐硬贴。

正确顺序：

确定 BGM 高潮段
→ 分析节拍和重音
→ 设计 18 秒音乐结构
→ 决定镜头切点和动作落点
→ 再生成视频素材
→ 根据真实动作时刻重新映射速度
→ 添加 SFX
→ 混音输出

对于第三部，音乐至少要提供这几个关键节点：

0.00s    开场低压
第一次强拍    男主介入 / 剑锋停下
第二次强拍    剑幕撞上屏障
短暂抽空      女主抬眼或台词
Drop 前蓄力   锁链断裂
最大 Drop     万剑倒转
尾部余韵      “你护错人了”或关系揭示

重点不是每拍都切，而是选出 主要重音 Accent。

第二步：分析 wow.mp4 的音频结构

本地先提取音频：

ffmpeg \
  -i assets/sources/wow.mp4 \
  -vn \
  -ac 2 \
  -ar 48000 \
  -c:a pcm_s16le \
  cache/audio/wow.wav

之后不要只检测 BPM，需要生成三类时间点：

{
  "bpm": 100,
  "downbeats": [0, 2.4, 4.8, 7.2],
  "beats": [0, 0.6, 1.2, 1.8],
  "accents": [
    {
      "time": 3.584,
      "strength": 0.91,
      "type": "impact"
    },
    {
      "time": 7.216,
      "strength": 1,
      "type": "drop"
    }
  ],
  "sections": [
    {
      "start": 0,
      "end": 4.8,
      "type": "build"
    },
    {
      "start": 4.8,
      "end": 7.2,
      "type": "break"
    },
    {
      "start": 7.2,
      "end": 18,
      "type": "drop"
    }
  ]
}

自动检测只能提供初稿，最后还要看波形人工确认。电影感音乐经常存在：

拍前吸气
延迟鼓点
Reverse 音效
无鼓的高潮
不规则停顿

只用 BPM 算术会卡得机械。

第三步：每个镜头不能只有开始和结束时间

当前 Shot 结构只有：

{
  "start": 5,
  "end": 6.8,
  "camera": "WARD_PUSH",
  "timeWarp": "whip"
}

这不够，因为真正需要对齐的是镜头内部的动作峰值。

应增加：

{
  "id": "s04",
  "start": 5.0,
  "end": 6.8,

  "syncPoints": [
    {
      "kind": "gesture-start",
      "outputTime": 5.18,
      "sourceTime": 1.42
    },
    {
      "kind": "impact",
      "outputTime": 6.0,
      "sourceTime": 2.36
    },
    {
      "kind": "settle",
      "outputTime": 6.32,
      "sourceTime": 2.72
    }
  ]
}

含义是：

源视频中 2.36s 的剑幕撞击帧；
必须映射到最终音乐 6.00s 的强拍；
撞击后的稳定画面落在 6.32s。

这才是真正的卡点。

第四步：TimeWarp 要升级为“锚点式时间映射”

当前每个 Shot 只能选择固定模板：

crash
steady
hold
accelerate
whip
release
settle

这些模板适合大致节奏，但不够精确。

需要支持自定义 Piecewise Time Map：

{
  "timeMap": [
    { "outputProgress": 0.0, "sourceProgress": 0.0 },
    { "outputProgress": 0.35, "sourceProgress": 0.18 },
    { "outputProgress": 0.55, "sourceProgress": 0.68 },
    { "outputProgress": 0.64, "sourceProgress": 0.74 },
    { "outputProgress": 1.0, "sourceProgress": 1.0 }
  ]
}

效果：

前段慢慢蓄力
→ 重拍前快速完成动作
→ 重拍瞬间撞击
→ 撞击后短暂停顿
→ 再进入下一个镜头

这比固定 accelerate 或 whip 精确得多。

第五步：动作要在鼓点前启动，而不是鼓点时才启动

常见高燃卡点结构：

重拍前 4–8 帧：动作启动
重拍前 1–3 帧：速度达到最高
重拍瞬间：剑撞击 / 转身完成 / 睁眼 / 画面切换
重拍后 2–6 帧：短暂清晰停顿

按 60FPS 计算：

4 帧 ≈ 67ms
6 帧 ≈ 100ms
8 帧 ≈ 133ms

例如音乐重拍是 7.200s：

7.083s  万剑开始急速改变方向
7.167s  运动模糊达到峰值
7.200s  万剑完全倒转 + 鼓点 + 撞击音
7.250s  画面清晰定住

不能在 7.200s 才让万剑开始转，否则观众感觉动作慢半拍。

第六步：Kling 素材要生成“可卡点动作”，而不是普通动态视频

生成提示词里必须明确动作结构：

动作开始前短暂稳定
动作清晰启动
单一明确的动作峰值
动作完成后保持稳定姿势
不要连续随机运动
不要全程高速
不要反复挥剑
不要全程镜头摇晃

因为后期最怕：

整条视频一直乱动；
找不到唯一的动作峰值；
角色在撞击后继续乱飘；
镜头自带高速摇动，无法再卡相机节奏。

理想 Source Plate：

0–25%    稳定蓄力
25–65%   单一动作
65–75%   动作峰值
75–100%  结果保持

然后再通过 TimeWarp 把 65%–75% 映射到音乐重拍。

第七步：视觉卡点需要三种镜头策略
1. Cut Sync

鼓点瞬间直接切镜：

剑锋落下
→ 重拍
→ 男主挡在女主前

适合反转和人物登场。

2. Motion Sync

不切镜，但让动作峰值对齐：

女主缓慢抬眼
→ 鼓点瞬间睁眼完成

适合角色压迫感。

3. Transition Sync

重拍前开始遮挡，重拍瞬间完成切换：

袖摆扫过画面
→ 重拍
→ 下一镜头出现

转场开始时间不在重拍上，转场完成时间才在重拍上。

第八步：必须加音效，纯 BGM 不够

wow.mp4 听起来“卡得重”，很可能不是只有 BGM，而是 BGM 上叠了动作音效。

第三部至少需要：

画面	音效
剑从天而降	高频剑鸣 + 空气切割
男主抬手	低频能量启动
剑幕撞屏障	金属群撞击 + 低频冲击
锁链断裂	金属断裂 + 细碎坠落
女主睁眼	极短高频闪光
万剑倒转	Reverse Whoosh
万剑飞出	群体破空 + 低频尾音

结构建议：

音乐负责节奏
SFX 负责动作重量
低频 Impact 负责爽感
短暂静音负责反差

特别是万剑倒转前，可以把 BGM 瞬间压低 100–200ms，再在倒转完成时恢复，会比持续轰鸣更有冲击。

第九步：项目中增加音频配置

建议新增：

projects/003-xxx/
  project.json
  timeline.json
  audio.json
  audio-map.json

audio.json：

{
  "music": {
    "file": "assets/audio/bgm.wav",
    "trimStart": 32.4,
    "duration": 18,
    "gainDb": -3,
    "fadeIn": 0.08,
    "fadeOut": 0.25
  },
  "voice": [
    {
      "file": "assets/audio/voice-you-protected-the-wrong-person.wav",
      "start": 15.2,
      "gainDb": -1
    }
  ],
  "sfx": [
    {
      "file": "assets/audio/sword-impact.wav",
      "start": 6.0,
      "gainDb": -2
    },
    {
      "file": "assets/audio/chains-break.wav",
      "start": 10.8,
      "gainDb": -3
    }
  ]
}
第十步：最终由 FFmpeg 混音和封装

渲染引擎先输出无声画面：

master-video-only.mp4

再执行混音：

ffmpeg \
  -i master-video-only.mp4 \
  -ss 32.4 -t 18 -i bgm.wav \
  -i sword-impact.wav \
  -i chains-break.wav \
  -filter_complex "
    [1:a]volume=-3dB,afade=t=in:st=0:d=0.08,afade=t=out:st=17.75:d=0.25[bgm];
    [2:a]adelay=6000|6000,volume=-2dB[sword];
    [3:a]adelay=10800|10800,volume=-3dB[chain];
    [bgm][sword][chain]amix=inputs=3:duration=longest:normalize=0,
    alimiter=limit=0.89[aout]
  " \
  -map 0:v:0 \
  -map "[aout]" \
  -c:v copy \
  -c:a aac \
  -b:a 320k \
  -ar 48000 \
  -ac 2 \
  -t 18 \
  -movflags +faststart \
  final-master.mp4

最终 Validation 还应检查：

视频时长 = 音频时长
AAC
48kHz
双声道
没有削波
首尾没有音频空洞
最适合当前项目的落地方案

不用立刻把引擎改成完整 DAW，但至少补这五项：

P0-1  tools/analyze-beats
      输出 BPM、Beat、Accent、Section

P0-2  timeline.syncPoints / timeMap
      将源动作峰值精确映射到音乐重拍

P0-3  audio.json
      管理 BGM、台词、SFX、时间和增益

P0-4  render-master 自动混音
      生成真正带声音的 4K60 MP4

P0-5  Audio Validation
      校验音频流、时长、峰值和声道
最重要的一条

不要先把十条视频全部生成完，再尝试把它们塞进音乐。

应先把音乐高潮段切出来，标出 18 秒内所有重要重拍，再让每条 Kling 素材提供一个清晰动作峰值，最后通过锚点式 TimeWarp 把动作峰值逐帧压到鼓点上。

这样才能做到 wow.mp4 那种真正的卡点，而不是“镜头大概跟着音乐切”