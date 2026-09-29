import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const port = Number(process.env.PORT || 4173);

const knowledge = [
  {
    id: "k1",
    title: "Investing assistant product brief",
    type: "Product brief",
    excerpt: "Investment research users need a traceable answer that separates market facts, cited signals, and a final recommendation.",
    tags: ["research", "investment", "citations"],
  },
  {
    id: "k2",
    title: "On-device runtime notes",
    type: "Engineering note",
    excerpt: "The Android client uses a provider adapter so cloud inference and an MNN-compatible local runtime can share a single message contract.",
    tags: ["android", "mnn", "local runtime"],
  },
  {
    id: "k3",
    title: "Mobile release checklist",
    type: "Checklist",
    excerpt: "Validate model download, token streaming, offline fallback, network recovery, and source citation rendering before release.",
    tags: ["release", "android", "streaming"],
  },
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
};

function send(res, status, payload, headers = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(payload));
}

function bestMatches(query) {
  const normalized = query.toLowerCase();
  return knowledge
    .map((item) => ({
      ...item,
      score: item.tags.reduce((score, tag) => score + (normalized.includes(tag) ? 2 : 0), 1),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function normalizeQuery(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  // Let users paste the API payload during demos without polluting the conversation.
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed.query === "string") return parsed.query.trim();
  } catch {
    // A normal conversational question is not JSON.
  }
  return text;
}

function answerFor(query, docs, mode) {
  const topic = query.trim() || "the current request";
  const localMode = mode === "local";
  const normalized = topic.toLowerCase();
  const isSwitching = /switch|cloud|local|on-device|端侧|云端|切换|离线/.test(normalized);
  const isRelease = /release|quality|test|publish|发布|质量|测试|验收/.test(normalized);
  const isRag = /rag|retriev|citation|evidence|知识库|引用|检索/.test(normalized);

  let answer;
  let followUps;
  if (isSwitching) {
    answer = `For "${topic}", use one provider-neutral request and response contract. Route to cloud by default when the network and policy allow it; select the local runtime for offline use, privacy-sensitive work, or degraded-network fallback. Keep the selected runtime in request metadata rather than in the chat content, so Android and iOS render the same conversation and citations.`;
    followUps = [
      "Persist the preferred runtime and expose a per-request override.",
      "Return the active runtime, latency, and fallback reason in the response metadata.",
      "Test network loss during generation and resume from the shared message contract.",
    ];
  } else if (isRelease) {
    answer = `For "${topic}", treat model delivery as a mobile release concern. Validate first-run model download, storage limits, cancellation, offline recovery, token streaming, and source rendering. Instrument the runtime path so the team can compare cloud and local failure rates before rolling out.`;
    followUps = [
      "Use staged rollout and capture runtime-specific crash and timeout telemetry.",
      "Add deterministic acceptance tests for citations and interrupted streams.",
      "Verify that the app stays useful when model download is unavailable.",
    ];
  } else if (isRag) {
    answer = `For "${topic}", retrieve and rank workspace evidence before generation, then attach each cited source to the final answer. Keep retrieval, generation, and rendering separate so the same API can support cloud models today and an on-device runtime later.`;
    followUps = [
      "Return source IDs, excerpts, and scores as structured fields.",
      "Require the client to render citations before a user acts on a recommendation.",
      "Log retrieval misses separately from generation quality issues.",
    ];
  } else {
    answer = `For "${topic}", start with a provider-neutral mobile AI contract: retrieve relevant workspace evidence, generate against those sources, and return a consistent response envelope to Android and iOS. The active ${localMode ? "local" : "cloud"} adapter can then change without changing the product workflow.`;
    followUps = [
      "Show evidence before generating the final recommendation.",
      "Keep provider selection outside the UI message schema.",
      "Emit token and tool events so Android and iOS can render one streaming experience.",
    ];
  }

  return {
    answer: `${answer} This run is using the ${localMode ? "local runtime adapter" : "cloud provider adapter"}.`,
    followUps,
    citations: docs.map((doc) => ({ id: doc.id, title: doc.title, excerpt: doc.excerpt })),
  };
}

async function bodyOf(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/health") {
    return send(res, 200, {
      status: "ok",
      models: ["Cloud adapter", "Local runtime adapter"],
      knowledgeCount: knowledge.length,
    });
  }

  if (req.method === "GET" && url.pathname === "/api/knowledge") {
    return send(res, 200, { items: knowledge });
  }

  if (req.method === "POST" && url.pathname === "/api/chat") {
    try {
      const { query, mode = "cloud" } = await bodyOf(req);
      const normalizedQuery = normalizeQuery(query);
      const docs = bestMatches(normalizedQuery);
      return send(res, 200, {
        runId: `run_${Date.now().toString(36)}`,
        retrieval: docs.map(({ id, title, score }) => ({ id, title, score })),
        ...answerFor(normalizedQuery, docs, mode),
      });
    } catch {
      return send(res, 400, { error: "Expected JSON with a query field." });
    }
  }

  if (req.method === "POST" && url.pathname === "/api/knowledge") {
    try {
      const { title, excerpt, tags = [] } = await bodyOf(req);
      if (!title || !excerpt) return send(res, 400, { error: "title and excerpt are required" });
      const item = {
        id: `k${knowledge.length + 1}`,
        title: String(title).slice(0, 80),
        type: "Workspace note",
        excerpt: String(excerpt).slice(0, 240),
        tags: Array.isArray(tags) ? tags.map(String).slice(0, 6) : [],
      };
      knowledge.unshift(item);
      return send(res, 201, { item });
    } catch {
      return send(res, 400, { error: "Expected JSON body." });
    }
  }

  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = normalize(join(publicDir, requested));
  if (!filePath.startsWith(publicDir)) return send(res, 403, { error: "Forbidden" });

  try {
    const file = await readFile(filePath);
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Not a file");
    res.writeHead(200, { "content-type": mimeTypes[extname(filePath)] || "application/octet-stream" });
    res.end(file);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.listen(port, () => {
  console.log(`Signal Copilot is running at http://localhost:${port}`);
});
