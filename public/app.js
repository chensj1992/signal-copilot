const state = { mode: "cloud", evidence: [], mnnConfigured: false, mnnModel: "MNN" };

const thread = document.querySelector("#thread");
const query = document.querySelector("#query");
const composer = document.querySelector("#composer");
const evidenceList = document.querySelector("#evidence-list");
const evidenceTemplate = document.querySelector("#evidence-template");
const runtimeLabel = document.querySelector("#runtime-label");
const runId = document.querySelector("#run-id");
const traceList = document.querySelector("#trace-list");
const dialog = document.querySelector("#note-dialog");

function escapeHtml(value) {
  return value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
}

function renderEvidence(items) {
  evidenceList.replaceChildren();
  items.forEach((item, index) => {
    const fragment = evidenceTemplate.content.cloneNode(true);
    fragment.querySelector("strong").textContent = item.title;
    fragment.querySelector("p").textContent = item.excerpt;
    fragment.querySelector(".evidence-score").textContent = item.score ? `${item.score.toFixed(1)} relevance` : item.type;
    fragment.querySelector(".evidence-type").style.background = ["#d85b42", "#007f79", "#2b5a87"][index % 3];
    evidenceList.append(fragment);
  });
}

function setTrace(stage = 0) {
  [...traceList.children].forEach((item, index) => item.classList.toggle("complete", index <= stage));
}

function updateRuntimeLabel() {
  if (state.mode === "cloud") {
    runtimeLabel.textContent = "Demo cloud adapter";
    return;
  }
  runtimeLabel.textContent = state.mnnConfigured ? `MNN: ${state.mnnModel}` : "MNN endpoint required";
}

function appendUserMessage(text) {
  const article = document.createElement("article");
  article.className = "message user-message";
  article.innerHTML = `<div class="message-body"><p>${escapeHtml(text)}</p></div>`;
  thread.append(article);
}

function appendAssistantMessage(response) {
  const article = document.createElement("article");
  article.className = "message assistant-message";
  article.innerHTML = `
    <div class="assistant-avatar" aria-label="Signal assistant">S</div>
    <div class="message-body">
      <div class="message-meta"><strong>Signal</strong><span>${escapeHtml(response.runtime?.label || "Run complete")}</span></div>
      <p>${escapeHtml(response.answer)}</p>
      <ul class="answer-points">${response.followUps.map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>
      <div class="citation-row">${response.citations.map((citation) => `<span class="citation">Source: ${escapeHtml(citation.title)}</span>`).join("")}</div>
    </div>`;
  thread.append(article);
  article.scrollIntoView({ behavior: "smooth", block: "end" });
}

async function runQuery(text) {
  appendUserMessage(text);
  query.value = "";
  query.focus();
  setTrace(0);
  runId.textContent = "Running";

  const pending = document.createElement("article");
  pending.className = "message assistant-message";
  pending.innerHTML = `<div class="assistant-avatar" aria-label="Signal assistant">S</div><div class="message-body"><div class="message-meta"><strong>Signal</strong><span>Retrieving evidence</span></div><p>Searching the workspace and preparing a cited response...</p></div>`;
  thread.append(pending);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: text, mode: state.mode }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed");
    pending.remove();
    state.evidence = data.citations.map((citation, index) => ({ ...citation, score: data.retrieval[index]?.score || 1 }));
    renderEvidence(state.evidence);
    setTrace(3);
    runId.textContent = data.runId;
    appendAssistantMessage(data);
  } catch (error) {
    pending.querySelector("p").textContent = error.message || "The local demo server is unavailable. Start the project with npm run dev and try again.";
    pending.querySelector(".message-meta span").textContent = "Runtime unavailable";
  }
}

document.querySelectorAll(".mode").forEach((button) => {
  button.addEventListener("click", () => {
    state.mode = button.dataset.mode;
    document.querySelectorAll(".mode").forEach((item) => item.classList.toggle("active", item === button));
    updateRuntimeLabel();
  });
});

document.querySelectorAll(".prompt-chip").forEach((button) => {
  button.addEventListener("click", () => runQuery(button.textContent.trim()));
});

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = query.value.trim();
  if (text) runQuery(text);
});

document.querySelector("#new-run").addEventListener("click", () => {
  query.value = "";
  query.focus();
  runId.textContent = "Waiting";
  setTrace(0);
});

document.querySelector("#export-run").addEventListener("click", () => {
  const content = [...thread.querySelectorAll(".message-body")].map((node) => node.innerText).join("\n\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type: "text/plain" }));
  link.download = "signal-run.txt";
  link.click();
  URL.revokeObjectURL(link.href);
});

document.querySelector("#add-note").addEventListener("click", () => dialog.showModal());
document.querySelector("#note-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = document.querySelector("#note-title").value.trim();
  const excerpt = document.querySelector("#note-excerpt").value.trim();
  const tags = document.querySelector("#note-tags").value.split(",").map((tag) => tag.trim()).filter(Boolean);
  const response = await fetch("/api/knowledge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, excerpt, tags }) });
  if (response.ok) {
    const { item } = await response.json();
    state.evidence.unshift({ ...item, score: 1 });
    renderEvidence(state.evidence);
    event.target.reset();
    dialog.close();
  }
});

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item === button));
    const isWorkspace = button.dataset.view === "workspace";
    document.querySelector("#workspace-view").hidden = !isWorkspace;
    document.querySelector("#empty-view").hidden = isWorkspace;
    if (!isWorkspace) {
      document.querySelector("#empty-title").textContent = button.textContent;
      document.querySelector("#empty-copy").textContent = `${button.textContent} is connected to the same provider-neutral workspace contract.`;
    }
  });
});

document.querySelector("#return-workspace").addEventListener("click", () => document.querySelector('[data-view="workspace"]').click());

fetch("/api/knowledge").then((response) => response.json()).then(({ items }) => {
  state.evidence = items.map((item) => ({ ...item, score: 1 }));
  renderEvidence(state.evidence);
}).catch(() => {
  document.querySelector("#health-label").textContent = "Start local server";
});

fetch("/api/health").then((response) => response.json()).then(({ localRuntime }) => {
  state.mnnConfigured = Boolean(localRuntime?.configured);
  state.mnnModel = localRuntime?.model || "MNN";
  updateRuntimeLabel();
  if (!state.mnnConfigured) document.querySelector("#health-label").textContent = "MNN endpoint not configured";
}).catch(() => {
  document.querySelector("#health-label").textContent = "Start local server";
});
