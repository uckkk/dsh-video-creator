// dsh-video-creator — 视频号创作助手（DeepSeek Harness）。
// 内置主流短视频创作模板；调用中国境内大模型（OpenAI 兼容：DeepSeek 官方 / 硅基流动 /
// 通义千问 / 智谱 / 豆包 / Kimi / 讯飞 / 腾讯混元 / MiniMax）一键生成完整内容包；
// 支持 AI 视频生成（硅基流动等视频模型），并为抖音 / 视频号 / B站 / 快手 / 小红书 /
// 微博 / 西瓜视频 生成可发布文案与分步发布方案。用户只需填自己的 API Key。
import { defineTool } from "@deepseek-ai/dsh-tools";
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const ffmpegPath = ffmpegInstaller.path;
const execFileAsync = promisify(execFile);

const name = "视频号创作助手";
const inject = ["tools"];

const DSH_HOME = process.env.DSH_HOME || join(homedir(), ".dsh");
const CONFIG_DIR = join(DSH_HOME, "storages", "video-creator");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

// ── 内置创作模板 ─────────────────────────────────────────────────────────
const TEMPLATES = [
  { id: "opinion", name: "口播观点", desc: "单人口播输出观点/金句，适合职场、情感、成长类", structure: "钩子 → 观点 → 论据/案例 → 金句收尾 → 互动引导" },
  { id: "product", name: "带货种草", desc: "产品种草/带货，突出卖点与使用场景", structure: "痛点钩子 → 产品引入 → 3 个卖点 → 使用场景 → 优惠/行动号召" },
  { id: "tutorial", name: "教程教学", desc: "步骤式教学，适合软件/手工/知识类", structure: "成果预览 → 分步讲解 → 关键点强调 → 总结 → 关注引导" },
  { id: "science", name: "科普讲解", desc: "把复杂知识讲通俗，适合科普/冷知识", structure: "反常识钩子 → 通俗类比 → 原理拆解 → 记忆点 → 互动提问" },
  { id: "story", name: "剧情短剧", desc: "短剧/剧情，强冲突反转", structure: "冲突开场 → 铺垫 → 反转 → 情绪落点 → 追更引导" },
  { id: "vlog", name: "Vlog 日常", desc: "生活记录，真实感与氛围", structure: "场景开场 → 事件推进 → 情绪/感悟 → 收尾" },
  { id: "news", name: "新闻快讯", desc: "资讯快报，信息密度高", structure: "一句话结论 → 关键信息 → 背景 → 影响 → 关注引导" },
  { id: "interview", name: "采访访谈", desc: "问答式访谈/街采", structure: "引入嘉宾/话题 → 提问与回应 → 金句提炼 → 总结" },
  { id: "review", name: "测评开箱", desc: "产品测评/开箱，客观对比", structure: "上手第一印象 → 核心参数实测 → 优缺点对比 → 购买建议" },
  { id: "motivation", name: "励志治愈", desc: "励志/治愈文案，情绪价值", structure: "共鸣钩子 → 故事/画面 → 情绪升华 → 鼓励收尾" },
];

// ── 平台规范 ─────────────────────────────────────────────────────────────
const PLATFORMS = [
  { id: "douyin", name: "抖音", titleMax: 55, tagStyle: "#话题", note: "个人发布需在抖音创作者中心手动上传；本插件为你备好标题/简介/话题。" },
  { id: "channels", name: "视频号", titleMax: 60, tagStyle: "#话题", note: "在微信视频号助手/公众号后台手动上传；文案已按视频号规范生成。" },
  { id: "bilibili", name: "B站", titleMax: 80, tagStyle: "tags", note: "可在创作者中心手动上传，或提供账号凭证后由本插件尝试自动上传。" },
  { id: "kuaishou", name: "快手", titleMax: 30, tagStyle: "#话题", note: "在快手创作者中心手动上传；文案已按快手规范生成。" },
  { id: "xiaohongshu", name: "小红书", titleMax: 20, tagStyle: "#话题", note: "在小红书发布笔记；标题较短、话题更生活化。" },
  { id: "weibo", name: "微博", titleMax: 100, tagStyle: "#话题#", note: "在微博视频发布；话题用双 # 包裹。" },
  { id: "xigua", name: "西瓜视频", titleMax: 30, tagStyle: "#话题", note: "在西瓜视频创作者平台手动上传。" },
];

// ── 提供商预设（中国境内，OpenAI 兼容）──────────────────────────────────
const PROVIDERS = [
  { id: "deepseek", name: "DeepSeek 官方", base: "https://api.deepseek.com", model: "deepseek-chat", note: "文本模型，价格低、中文强。" },
  { id: "siliconflow", name: "硅基流动", base: "https://api.siliconflow.cn/v1", model: "deepseek-ai/DeepSeek-V3", note: "聚合多家中外模型，一个 key 同时可用文本+视频模型。" },
  { id: "qwen", name: "通义千问", base: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus", note: "阿里云，OpenAI 兼容。" },
  { id: "zhipu", name: "智谱 GLM", base: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash", note: "智谱 AI。" },
  { id: "doubao", name: "字节豆包", base: "https://ark.cn-beijing.volces.com/api/v3", model: "doubao-1-5-pro-32k-250115", note: "火山引擎方舟。" },
  { id: "kimi", name: "Kimi（月之暗面）", base: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k", note: "月之暗面。" },
  { id: "hunyuan", name: "腾讯混元", base: "https://api.hunyuan.cloud.tencent.com/v1", model: "hunyuan-turbos-latest", note: "腾讯云混元。" },
  { id: "minimax", name: "MiniMax", base: "https://api.minimax.chat/v1", model: "MiniMax-Text-01", note: "MiniMax，同时支持海螺视频。" },
];

// ── 配置读写 ─────────────────────────────────────────────────────────────
async function readLocalConfig() {
  try { return JSON.parse(await readFile(CONFIG_FILE, "utf8")); } catch { return {}; }
}

async function writeLocalConfig(cfg) {
  await mkdir(CONFIG_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf8");
}

function redact(cfg) {
  const out = { ...cfg };
  if (out.textApiKey) out.textApiKey = "••••" + out.textApiKey.slice(-4);
  if (out.videoApiKey) out.videoApiKey = "••••" + out.videoApiKey.slice(-4);
  if (out.bilibiliSessdata) out.bilibiliSessdata = "••••••••";
  return out;
}

// ── 模型调用（OpenAI 兼容）──────────────────────────────────────────────
function extractJson(text) {
  const s = (text || "").trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(s);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch {} }
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try { return JSON.parse(s.slice(first, last + 1)); } catch {}
  }
  throw new Error("模型返回内容不是有效 JSON，请重试或换一个文本模型");
}

async function chatCompletion(cfg, messages) {
  const base = (cfg.textApiBase || "").replace(/\/+$/, "");
  if (!base || !cfg.textApiKey || !cfg.textModel) {
    throw new Error("尚未配置文本模型。请先调用 configure 工具填写 textApiBase / textApiKey / textModel（中国境内 OpenAI 兼容接口，如 DeepSeek、硅基流动、通义千问、智谱、豆包、Kimi、腾讯混元、MiniMax）。");
  }
  const url = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.textApiKey}` },
    body: JSON.stringify({ model: cfg.textModel, messages, temperature: 0.8 }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`文本模型调用失败（HTTP ${res.status}）：${body.slice(0, 400)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

// ── 内容包生成 ───────────────────────────────────────────────────────────
function buildPrompt(topic, template, platform, duration, extra) {
  return [
    { role: "system", content: "你是一位资深短视频策划与编导，擅长为中国主流短视频平台（抖音、视频号、B站、快手、小红书、微博、西瓜视频）创作高传播率内容。只输出一个合法 JSON 对象，不要输出 markdown 代码块，不要输出任何解释文字。" },
    { role: "user", content: `请根据以下信息生成一个可直接用于拍摄和发布的完整内容包，严格按指定 JSON 字段输出：

【主题/一句话想法】${topic}
【创作模板】${template.name}：${template.desc}（结构：${template.structure}）
【目标平台】${platform.name}（标题建议 ≤${platform.titleMax} 字）
【预计时长】约 ${duration || 60} 秒${extra ? `\n【额外要求】${extra}` : ""}

JSON 字段（全部为字符串或字符串数组）：
{
  "title": "主标题（含吸引力，符合平台字数规范）",
  "titles": ["3 个备选标题"],
  "hook": "开头 3 秒钩子文案",
  "script": [{"part": "口播|画面|字幕|音效|镜头", "text": "具体内容"}],
  "description": "发布简介/文案",
  "tags": ["5-10 个话题标签，不带 # 号"],
  "coverText": "封面大字文案（不超过 10 字）",
  "subtitles": ["字幕全文，按句分行"]
}` },
  ];
}

function pickTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
}

function pickPlatform(id) {
  return PLATFORMS.find((p) => p.id === id) || PLATFORMS[0];
}

function formatTags(content, platform) {
  const tags = (content.tags || []).slice(0, 10);
  if (platform.tagStyle === "tags") return tags.join(", ");
  if (platform.tagStyle === "#话题#") return tags.map((t) => `#${t}#`).join(" ");
  return tags.map((t) => `#${t}`).join(" ");
}

function platformCopy(content, platform) {
  const title = (content.title || "").slice(0, platform.titleMax);
  const tags = formatTags(content, platform);
  return {
    platform: platform.name,
    title,
    description: content.description || "",
    tags,
    coverText: content.coverText || "",
    publishNote: platform.note,
  };
}

// ── 成片合成辅助（macOS say 配音 + ffmpeg-static 合成）──────────────────
async function detectChineseVoice() {
  try {
    const { stdout } = await execFileAsync("say", ["-v", "?"]);
    const lines = (stdout || "").split("\n");
    for (const candidate of ["Ting-Ting", "Meijia", "Sin-ji"]) {
      if (lines.some((l) => l.trim().startsWith(candidate))) return candidate;
    }
  } catch {}
  return "Ting-Ting";
}

async function ttsToFile(text, voice, outPath) {
  const args = ["-o", outPath];
  if (voice) args.push("-v", voice);
  args.push(text);
  await execFileAsync("say", args);
}

async function probeDuration(file) {
  try {
    await execFileAsync(ffmpegPath, ["-i", file]);
  } catch (e) {
    const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(e.stderr || "");
    if (m) return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  return 0;
}

function fmtTime(sec) {
  const pad = (n) => String(n).padStart(2, "0");
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = (sec % 60).toFixed(3);
  return `${pad(h)}:${pad(m)}:${s.length < 6 ? "0".repeat(6 - s.length) + s : s}`;
}

function buildSrt(lines, totalSec) {
  const weights = lines.map((l) => Math.max(1, [...l].length));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let t = 0;
  const out = [];
  lines.forEach((l, i) => {
    const dur = Math.max(0.5, totalSec * weights[i] / total);
    out.push(`${i + 1}\n${fmtTime(t)} --> ${fmtTime(t + dur)}\n${l}\n`);
    t += dur;
  });
  return out.join("\n");
}

async function apply(ctx, patchConfig) {
  const baseConfig = patchConfig || {};
  const getConfig = async () => ({ ...baseConfig, ...(await readLocalConfig()) });

  ctx.tools.register(defineTool({
    name: "template_list",
    description:
      "列出内置的主流短视频创作模板（口播观点、带货种草、教程教学、科普讲解、剧情短剧、Vlog 日常、新闻快讯、采访访谈、测评开箱、励志治愈），每个模板含结构说明。用于给用户选择创作方向，或在生成脚本前指定模板。",
    parameters: {},
    output: {
      schema: {
        type: "object", additionalProperties: false,
        properties: {
          templates: {
            type: "array", required: true,
            items: {
              type: "object", additionalProperties: false,
              properties: {
                id: { type: "string", required: true },
                name: { type: "string", required: true },
                desc: { type: "string", required: true },
                structure: { type: "string", required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: "text",
        text: "内置创作模板：\n" + value.templates.map((t) => `  - ${t.name}（${t.id}）：${t.desc}；结构：${t.structure}`).join("\n"),
      }],
    },
    execute: async () => ({
      templates: TEMPLATES.map(({ id, name: n, desc, structure }) => ({ id, name: n, desc, structure })),
    }),
  }));

  ctx.tools.register(defineTool({
    name: "configure",
    description:
      "配置视频号创作助手所用的中国境内模型 API（OpenAI 兼容）。只需填写你已有的 API 信息即可，配置会保存到本地。至少填 textApiBase / textApiKey / textModel 三个文本模型字段即可开始生成内容；如需 AI 生成视频，再填 videoApiBase / videoApiKey / videoModel（如硅基流动的视频模型）。所有参数均可选，只填你要更新的项。可用预设（textApiBase / textModel）：DeepSeek 官方 https://api.deepseek.com + deepseek-chat；硅基流动 https://api.siliconflow.cn/v1 + deepseek-ai/DeepSeek-V3；通义千问 https://dashscope.aliyuncs.com/compatible-mode/v1 + qwen-plus；智谱 https://open.bigmodel.cn/api/paas/v4 + glm-4-flash。",
    parameters: {
      textApiBase: { type: "string", description: "文本模型 API 地址（OpenAI 兼容），如 https://api.deepseek.com" },
      textApiKey: { type: "string", description: "文本模型 API Key" },
      textModel: { type: "string", description: "文本模型名称，如 deepseek-chat" },
      videoApiBase: { type: "string", description: "（可选）视频模型 API 地址，如 https://api.siliconflow.cn/v1" },
      videoApiKey: { type: "string", description: "（可选）视频模型 API Key" },
      videoModel: { type: "string", description: "（可选）视频模型名称" },
      bilibiliSessdata: { type: "string", description: "（预留）B站账号 SESSDATA，供后续自动上传使用（当前版本尚未接入自动上传）" },
    },
    output: {
      schema: {
        type: "object", additionalProperties: false,
        properties: {
          saved: { type: "boolean", required: true },
          path: { type: "string", required: true },
          config: {
            type: "object", additionalProperties: true, required: true,
            properties: {},
          },
        },
      },
      render: (_args, value) => [{ type: "text", text: `配置已保存到 ${value.path}。当前配置：${JSON.stringify(value.config)}` }],
    },
    execute: async (args) => {
      const existing = await readLocalConfig();
      const next = { ...existing };
      for (const k of ["textApiBase", "textApiKey", "textModel", "videoApiBase", "videoApiKey", "videoModel", "bilibiliSessdata"]) {
        if (args[k] != null && args[k] !== "") next[k] = args[k];
      }
      await writeLocalConfig(next);
      return { saved: true, path: CONFIG_FILE, config: redact(next) };
    },
  }));

  ctx.tools.register(defineTool({
    name: "script_generate",
    description:
      "调用中国境内大模型，根据「主题 + 模板 + 平台 + 时长」一键生成完整内容包：主标题、备选标题、开头钩子、分镜脚本、发布简介、话题标签、封面文案、字幕全文。用于快速产出高质量、可直接拍摄/发布的脚本，用户只需给一句主题即可。首次使用前请先调用 configure 填写文本模型 API。",
    parameters: {
      topic: { type: "string", required: true, description: "主题或一句话想法，例如「职场新人如何拒绝无效加班」。" },
      template: { type: "string", enum: TEMPLATES.map((t) => t.id), description: "创作模板 id（见 template_list），默认 opinion。" },
      platform: { type: "string", enum: PLATFORMS.map((p) => p.id), description: "目标平台，默认 douyin。" },
      duration: { type: "integer", description: "预计时长（秒），默认 60。" },
      extra: { type: "string", description: "额外要求，如「口吻轻松」「面向宝妈」「含产品卖点 XXX」。" },
    },
    output: {
      schema: {
        type: "object", additionalProperties: false,
        properties: {
          title: { type: "string", required: true },
          titles: { type: "array", required: true, items: { type: "string" } },
          hook: { type: "string", required: true },
          script: {
            type: "array", required: true,
            items: {
              type: "object", additionalProperties: false,
              properties: { part: { type: "string", required: true }, text: { type: "string", required: true } },
            },
          },
          description: { type: "string", required: true },
          tags: { type: "array", required: true, items: { type: "string" } },
          coverText: { type: "string", required: true },
          subtitles: { type: "array", required: true, items: { type: "string" } },
        },
      },
      render: (_args, value) => [{
        type: "text",
        text: `标题：${value.title}\n钩子：${value.hook}\n标签：${value.tags.map((t) => "#" + t).join(" ")}\n封面：${value.coverText}\n\n脚本：\n${value.script.map((s) => `[${s.part}] ${s.text}`).join("\n")}`,
      }],
    },
    execute: async (args) => {
      const cfg = await getConfig();
      const template = pickTemplate(args.template);
      const platform = pickPlatform(args.platform);
      const messages = buildPrompt(args.topic, template, platform, args.duration, args.extra);
      const text = await chatCompletion(cfg, messages);
      const content = extractJson(text);
      // 归一化
      return {
        title: content.title || "",
        titles: Array.isArray(content.titles) ? content.titles : [],
        hook: content.hook || "",
        script: Array.isArray(content.script) ? content.script.map((s) => ({ part: String(s.part || "口播"), text: String(s.text || "") })) : [],
        description: content.description || "",
        tags: Array.isArray(content.tags) ? content.tags.map(String) : [],
        coverText: content.coverText || "",
        subtitles: Array.isArray(content.subtitles) ? content.subtitles.map(String) : [],
      };
    },
  }));

  ctx.tools.register(defineTool({
    name: "video_generate",
    description:
      "（可选）调用中国境内视频生成模型，把一句提示词生成一段视频。采用硅基流动等 OpenAI 兼容的视频提交/轮询接口（POST /v1/video/submissions）。需先 configure 填 videoApiBase / videoApiKey / videoModel。视频生成耗时较长，工具会轮询最多 90 秒；超时则返回任务 id 供稍后查询。",
    parameters: {
      prompt: { type: "string", required: true, description: "视频画面提示词（中文描述画面内容）。" },
    },
    output: {
      schema: {
        type: "object", additionalProperties: false,
        properties: {
          status: { type: "string", required: true },
          videoUrl: { type: "string", required: true },
          taskId: { type: "string", required: true },
          note: { type: "string", required: true },
        },
      },
      render: (_args, value) => [{ type: "text", text: value.status === "success" ? `视频已生成：${value.videoUrl}` : `视频生成状态：${value.status}，任务 id：${value.taskId}。${value.note}` }],
    },
    execute: async (args) => {
      const cfg = await getConfig();
      const base = (cfg.videoApiBase || "").replace(/\/+$/, "");
      if (!base || !cfg.videoApiKey || !cfg.videoModel) {
        throw new Error("尚未配置视频模型。请先 configure 填 videoApiBase / videoApiKey / videoModel（如硅基流动 https://api.siliconflow.cn/v1）。");
      }
      const submitUrl = `${base}/v1/video/submissions`;
      const res = await fetch(submitUrl, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${cfg.videoApiKey}` },
        body: JSON.stringify({ model: cfg.videoModel, prompt: args.prompt }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`视频生成提交失败（HTTP ${res.status}）：${body.slice(0, 400)}`);
      }
      const data = await res.json();
      const taskId = data.id || data.taskId || data.task_id || "";
      // 轮询
      const deadline = Date.now() + 90000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 5000));
        const poll = await fetch(`${submitUrl}/${taskId}`, { headers: { authorization: `Bearer ${cfg.videoApiKey}` } });
        if (poll.ok) {
          const p = await poll.json();
          const status = p.status || p.task_status || "";
          if (status === "Succeed" || status === "succeeded" || status === "SUCCESS") {
            const url = p.results?.videos?.[0]?.url || p.url || p.video_url || "";
            return { status: "success", videoUrl: url, taskId, note: "" };
          }
          if (status === "Failed" || status === "failed" || status === "FAILED") {
            return { status: "failed", videoUrl: "", taskId, note: "生成失败，请检查提示词或模型。" };
          }
        }
      }
      return { status: "pending", videoUrl: "", taskId, note: "轮询超时，可稍后用任务 id 查询结果。" };
    },
  }));

  ctx.tools.register(defineTool({
    name: "publish_package",
    description:
      "把已生成的内容包（脚本、标题、简介、标签、封面文案、字幕）落盘为一个发布包目录，并按指定平台生成适配的发布文案（标题字数、标签格式均按平台规范）。用于发布前整理素材。`content` 传 script_generate 的结果（可整体传入）；`platforms` 传要发布的平台 id 列表，默认全部主流平台；`outDir` 默认 ./发布包。",
    parameters: {
      content: { type: "json", required: true, description: "script_generate 返回的内容包对象。" },
      platforms: { type: "array", items: { type: "string" }, description: "平台 id 列表，如 [\"douyin\",\"bilibili\"]；默认全部。" },
      outDir: { type: "string", description: "输出目录，默认 ./发布包。" },
    },
    output: {
      schema: {
        type: "object", additionalProperties: false,
        properties: {
          outDir: { type: "string", required: true },
          files: { type: "array", required: true, items: { type: "string" } },
          copies: {
            type: "array", required: true,
            items: {
              type: "object", additionalProperties: false,
              properties: {
                platform: { type: "string", required: true },
                title: { type: "string", required: true },
                description: { type: "string", required: true },
                tags: { type: "string", required: true },
                coverText: { type: "string", required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{
        type: "text",
        text: `已生成发布包到 ${value.outDir}：${value.files.join("、")}。\n各平台发布文案：\n${value.copies.map((c) => `【${c.platform}】标题：${c.title}\n  简介：${c.description}\n  标签：${c.tags}`).join("\n")}`,
      }],
    },
    execute: async (args) => {
      const content = args.content || {};
      const platformIds = (args.platforms && args.platforms.length ? args.platforms : PLATFORMS.map((p) => p.id));
      const outDir = args.outDir || "./发布包";
      await mkdir(outDir, { recursive: true });
      const scriptText = (content.script || []).map((s) => `[${s.part}] ${s.text}`).join("\n\n");
      const files = [];
      await writeFile(join(outDir, "脚本.md"), `# 脚本\n\n标题：${content.title || ""}\n钩子：${content.hook || ""}\n\n${scriptText}\n`, "utf8"); files.push("脚本.md");
      await writeFile(join(outDir, "标题.md"), `# 标题\n\n${content.title || ""}\n\n备选：\n${(content.titles || []).map((t) => "- " + t).join("\n")}\n`, "utf8"); files.push("标题.md");
      await writeFile(join(outDir, "标签.txt"), (content.tags || []).map((t) => "#" + t).join(" "), "utf8"); files.push("标签.txt");
      await writeFile(join(outDir, "封面文案.md"), `# 封面文案\n\n${content.coverText || ""}\n`, "utf8"); files.push("封面文案.md");
      await writeFile(join(outDir, "字幕.txt"), (content.subtitles || []).join("\n"), "utf8"); files.push("字幕.txt");
      const copies = platformIds.map((id) => platformCopy(content, pickPlatform(id)));
      return { outDir, files, copies };
    },
  }));

  ctx.tools.register(defineTool({
    name: "publish",
    description:
      "为每个目标平台生成「发布方案」：把内容包适配为该平台的标题/简介/标签/封面文案，并给出分步发布指引。当前版本不做自动上传——抖音/视频号/快手/小红书/微博/西瓜视频的个人发布接口不开放，B站上传也暂未接入——插件返回「待复制文案 + 分步步骤」，由用户在对应创作者后台手动发布。",
    parameters: {
      content: { type: "json", required: true, description: "script_generate 返回的内容包对象。" },
      platform: { type: "string", enum: PLATFORMS.map((p) => p.id), description: "目标平台 id，如 bilibili 或 douyin。" },
    },
    output: {
      schema: {
        type: "object", additionalProperties: false,
        properties: {
          platform: { type: "string", required: true },
          autoUpload: { type: "boolean", required: true },
          result: { type: "string", required: true },
          title: { type: "string", required: true },
          description: { type: "string", required: true },
          tags: { type: "string", required: true },
          coverText: { type: "string", required: true },
          steps: { type: "array", required: true, items: { type: "string" } },
        },
      },
      render: (_args, value) => [{
        type: "text",
        text: `【${value.platform}】${value.autoUpload ? "（已尝试自动上传）" : "（手动发布）"}\n${value.result}\n\n待复制文案：\n标题：${value.title}\n简介：${value.description}\n标签：${value.tags}\n封面：${value.coverText}\n\n步骤：\n${value.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
      }],
    },
    execute: async (args) => {
      const content = args.content || {};
      const platform = pickPlatform(args.platform);
      const copy = platformCopy(content, platform);
      const steps = [
        `打开${platform.name}的创作者后台/App 发布入口`,
        `上传视频文件`,
        `标题填：${copy.title}`,
        `简介/描述填：${copy.description}`,
        `标签填：${copy.tags}`,
        `封面使用文案：${copy.coverText}`,
        "检查无误后点击发布",
      ];
      let autoUpload = false;
      let result = platform.note;
      if (platform.id === "bilibili") {
        result = "B站自动上传当前版本尚未接入，请按下方步骤在 B站创作中心手动上传。";
      }
      return {
        platform: platform.name,
        autoUpload,
        result,
        title: copy.title,
        description: copy.description,
        tags: copy.tags,
        coverText: copy.coverText,
        steps,
      };
    },
  }));

  ctx.tools.register(defineTool({
    name: "render_video",
    description:
      "把内容包（脚本/字幕）真正「剪辑成片」：用系统中文语音（macOS say，本地离线）配音，再用内置 ffmpeg 合成为一段带字幕的 mp4 视频。背景默认深色纯色，可指定背景色或背景图片，可指定分辨率（默认竖屏 1080x1920）。content 传 script_generate 返回的内容包即可。用于把文字脚本变成可发布的视频文件。",
    parameters: {
      content: { type: "json", required: true, description: "script_generate 返回的内容包对象（至少含 subtitles 或 script）。" },
      voice: { type: "string", description: "配音音色（say 音色名，如 Flo / Eddy / Meijia），默认自动选中文音色。" },
      background: { type: "string", description: "背景：hex 颜色（如 #1a1a2e 或 0x1a1a2e），或图片路径（.png/.jpg/.webp）。默认深色纯色。" },
      resolution: { type: "string", description: "分辨率，默认 1080x1920（竖屏）；横屏用 1920x1080。" },
      outDir: { type: "string", description: "输出目录，默认 ./成片。" },
    },
    output: {
      schema: {
        type: "object", additionalProperties: false,
        properties: {
          videoFile: { type: "string", required: true },
          audioFile: { type: "string", required: true },
          subtitleFile: { type: "string", required: true },
          duration: { type: "number", required: true },
          subtitleCount: { type: "integer", required: true },
          note: { type: "string", required: true },
        },
      },
      render: (_args, value) => [{
        type: "text",
        text: `已合成视频：${value.videoFile}\n时长 ${value.duration} 秒，字幕 ${value.subtitleCount} 句。${value.note}`,
      }],
    },
    execute: async (args) => {
      const content = args.content || {};
      const raw = (content.subtitles && content.subtitles.length ? content.subtitles : (content.script || []).map((s) => s.text));
      const lines = raw.map((t) => String(t || "").trim()).filter(Boolean);
      if (lines.length === 0) throw new Error("内容包缺少字幕/脚本文本，请先调用 script_generate 生成内容。");

      const voice = args.voice || (await detectChineseVoice()) || undefined;
      let bg = (args.background || "0x1a1a2e").trim();
      const res = args.resolution || "1080x1920";
      const outDir = args.outDir || "./成片";
      const work = await mkdtemp(join(tmpdir(), "dsh-video-"));
      const voiceFile = join(work, "voice.aiff");
      const srtFile = join(work, "subs.srt");

      try {
        await ttsToFile(lines.join("。"), voice, voiceFile);
      } catch (e) {
        throw new Error(`配音失败（需要 macOS 的 say 命令）：${e.message}`);
      }
      let dur = await probeDuration(voiceFile);
      if (dur <= 0) dur = lines.length * 2;
      const srt = buildSrt(lines, dur);
      await writeFile(srtFile, srt, "utf8");
      await mkdir(outDir, { recursive: true });
      const outFile = join(outDir, "成片.mp4");

      const isImage = /\.(png|jpe?g|webp)$/i.test(bg);
      let inputArgs;
      if (isImage) {
        inputArgs = ["-loop", "1", "-framerate", "30", "-i", bg];
      } else {
        const c = bg.replace(/^#/, "").replace(/^(?=[0-9a-fA-F]{6}$)/, "0x");
        inputArgs = ["-f", "lavfi", "-i", `color=c=${c}:s=${res}:d=${dur}`];
      }
      const style = "FontSize=16,PrimaryColour=&H00FFFFFF,OutlineColour=&H80000000,BorderStyle=1,Outline=1,Shadow=0,Alignment=2,MarginV=80";
      const vf = `subtitles=${srtFile}:force_style='${style}'`;
      try {
        await execFileAsync(ffmpegPath, [
          "-y", ...inputArgs,
          "-i", voiceFile,
          "-vf", vf,
          "-map", "0:v", "-map", "1:a",
          "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-shortest",
          outFile,
        ]);
      } catch (e) {
        throw new Error(`视频合成失败：${(e.stderr || e.message || "").toString().slice(0, 500)}`);
      }
      return {
        videoFile: outFile,
        audioFile: voiceFile,
        subtitleFile: srtFile,
        duration: Math.round(dur * 10) / 10,
        subtitleCount: lines.length,
        note: "配音为 macOS 系统中文语音（离线），如需更换音色可在 voice 参数指定；字幕按句长比例分布。",
      };
    },
  }));
}

export { apply, inject, name };
