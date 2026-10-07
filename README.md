# AI 如何工作 — Kiro 自制宣传片

**成片：** `out/kiro_how_ai_works.webm`（1920×1080 · 30fps · 72s · VP9 + Opus 立体声 · 约 80 MB）
**预览图：** `out/preview_frames.png`

## 制作流程
沙箱没有外网，Remotion 和 Manim 都装不上（PyPI 和 npm 都返回 403），也没有中文字体。所以整套流程是用本机已有的 Chromium 从零写的：

| 本来要用的工具 | 实际实现 |
|---|---|
| Remotion（每一帧都由时间 `t` 计算出来，含 `interpolate` / `spring`） | `src/engine.js` 加 `src/scenes.js` |
| Manim（Create / Write / 坐标轴 / 向量） | `engine.js` 里的 `createLine`、`arrow`、`polyPartial`、`smooth`、`project` |
| 中文字体 | `src/glyphs.js`：手绘了 20 个单线字形，支持“书写”动画 |
| 配乐 | `src/audio.js`：用 OfflineAudioContext 程序化合成，120 BPM，A 小调 |
| 编码与封装 | 用 WebCodecs 编码 VP9 和 Opus，再由 `src/webm.js` 封装成 WebM（自己写的封装器） |

画面和声音共用 `src/timeline.js` 里的时间表，所以打字音效、鼓点、转场都卡在同一拍上。

## 结构（每 2 秒一小节）
0–8 打字机署名 → 8 标题落下 → 12 分词 → 20 词向量（king − man + woman ≈ queen）→ 28 注意力 → 36 网络层与参数量 → 44 预测下一个 token → 52 梯度下降 → 60 回顾词卡 → 68 结尾 KIRO

## 重新渲染
```bash
unset NODE_OPTIONS
node tools/render.cjs video                      # 输出 out/raw.webm
node tools/render.cjs sheet 9.5,27,46            # 输出检查用的拼图
node tools/render.cjs verify kiro_how_ai_works.webm
```

## 关于 Token 和费用
片中的“≈ 2,400,000 Token / 约 90 元”是估算值，不是计费数据：本次会话约 40 轮工具调用，每轮上下文都会累加。费用按 Opus 档公开价（输入 $5/M、输出 $25/M）、不计缓存、汇率约 7.1 计算。实际账单以平台为准，开了提示缓存会低很多。要改数字，编辑 `src/timeline.js` 里的 `CREDIT` 后重新渲染即可。
