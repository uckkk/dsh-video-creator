# dsh-video-creator · 视频号创作助手

内置主流短视频创作模板，调用**中国境内大模型**（OpenAI 兼容）一键生成完整内容包，并为 **抖音 / 视频号 / B站 / 快手 / 小红书 / 微博 / 西瓜视频** 生成可发布文案与分步发布方案。用户只需填自己的 API Key，最少输入、最少折腾。

## 核心能力

1. **内置创作模板**：口播观点、带货种草、教程教学、科普讲解、剧情短剧、Vlog 日常、新闻快讯、采访访谈、测评开箱、励志治愈。
2. **一键生成内容包**：主标题 + 备选标题 + 开头钩子 + 分镜脚本 + 发布简介 + 话题标签 + 封面文案 + 字幕全文。
3. **可选 AI 视频生成**：调用视频模型（如硅基流动）把提示词生成视频。
4. **平台适配发布**：按各平台规范生成标题/简介/标签/封面文案，并给出分步发布指引。

## 第一步：填 API（只需一次）

```bash
dsh plugin add dsh-video-creator
```

安装后在 profile 的 `package.json` 的 `dsh.profile.bundles` 中加入 `"dsh-video-creator"`。

然后在对话里对 Agent 说：

```
帮我配置视频号创作助手：
textApiBase=https://api.deepseek.com
textApiKey=你的DeepSeek密钥
textModel=deepseek-chat
```

Agent 会调用 `configure` 工具保存配置（保存在 `~/.dsh/storages/video-creator/config.json`）。

### 支持的中国境内模型（OpenAI 兼容，填你自己的 Key 即可）

| 提供商 | textApiBase | textModel 示例 |
|---|---|---|
| DeepSeek 官方 | https://api.deepseek.com | deepseek-chat |
| 硅基流动 | https://api.siliconflow.cn/v1 | deepseek-ai/DeepSeek-V3 |
| 通义千问 | https://dashscope.aliyuncs.com/compatible-mode/v1 | qwen-plus |
| 智谱 GLM | https://open.bigmodel.cn/api/paas/v4 | glm-4-flash |
| 字节豆包 | https://ark.cn-beijing.volces.com/api/v3 | doubao-1-5-pro-32k-250115 |
| Kimi | https://api.moonshot.cn/v1 | moonshot-v1-8k |
| 腾讯混元 | https://api.hunyuan.cloud.tencent.com/v1 | hunyuan-turbos-latest |
| MiniMax | https://api.minimax.chat/v1 | MiniMax-Text-01 |

## 使用示例

```
帮我写一个「职场新人如何拒绝无效加班」的口播脚本，发抖音，60 秒
→ script_generate(topic="职场新人如何拒绝无效加班", template="opinion", platform="douyin", duration=60)

把上面内容打包成发布文件，发抖音和 B站
→ publish_package(content=<上一步结果>, platforms=["douyin","bilibili"])

帮我生成发布方案（B站）
→ publish(content=<内容包>, platform="bilibili")
```

## 说明

- **发布机制**：抖音、视频号、快手、小红书、微博、西瓜视频的个人发布接口不开放，插件会为你生成「待复制文案 + 分步步骤」，复制粘贴到对应创作者后台即可（省去 90% 手工填写）；B站后续支持账号凭证一键上传。
- **AI 视频生成**为可选能力，需另配 `videoApiBase/videoApiKey/videoModel`（如硅基流动视频模型）。
- 生成的视频内容请遵守各平台内容规范与相关法律法规。

## 安装

```bash
dsh plugin add github:uckkk/dsh-video-creator
```

> 安装即在本机运行第三方代码，请自行审阅源码。

## 安装

```bash
dsh plugin add github:uckkk/dsh-video-creator
```
