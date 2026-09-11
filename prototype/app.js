const JOURNAL_KEY = "morpho.prototype.privateJournal";
const state = { currentView: "overview", currentProject: "脑机接口", journal: loadJournal() };
const PROJECT_META = {
  "脑机接口": { description: "为大学课程建立一份可追溯、可持续更新的研究知识库。", coverage: "67%", sources: "126", nodes: "348", reviews: "12" },
  "大语言模型": { description: "梳理模型训练、对齐方法、应用和开放生态。", coverage: "42%", sources: "58", nodes: "174", reviews: "7" },
  "个人知识管理": { description: "比较笔记工具、知识图谱和长期信息管理方法。", coverage: "0%", sources: "0", nodes: "0", reviews: "0" }
};

function loadJournal() {
  try { return JSON.parse(localStorage.getItem(JOURNAL_KEY) || "[]"); } catch { return []; }
}

function today() { return new Date().toISOString().slice(0, 10); }
function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2800);
}

function switchView(view) {
  state.currentView = view;
  document.querySelectorAll(".view").forEach(panel => panel.classList.toggle("active", panel.id === `view-${view}`));
  document.querySelectorAll(".nav-item[data-view]").forEach(item => item.classList.toggle("active", item.dataset.view === view));
  const label = document.querySelector(`#view-${view} .kicker`);
  document.querySelector("#breadcrumb-label").textContent = ["projects", "overview"].includes(view) ? "脑机接口" : (label?.textContent.split(" /")[0] || "脑机接口");
  if (view === "journal") renderJournal();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function selectProject(name) {
  state.currentProject = name;
  document.querySelector(".project-switcher-copy strong").textContent = name;
  const assistantProject = document.querySelector("#assistant-project");
  if (assistantProject) assistantProject.textContent = name;
  document.querySelector("#breadcrumb-label").textContent = name;
  const overviewTitle = document.querySelector("#view-overview h1");
  if (overviewTitle) overviewTitle.textContent = name;
  const meta = PROJECT_META[name] || PROJECT_META["脑机接口"];
  const overview = document.querySelector("#view-overview");
  const lede = overview?.querySelector(".lede");
  if (lede) lede.textContent = meta.description;
  const metrics = overview?.querySelectorAll(".metric-card strong");
  if (metrics?.length >= 4) [meta.coverage, meta.sources, meta.nodes, meta.reviews].forEach((value, index) => { metrics[index].textContent = value; });
  ["plan", "tasks", "sources", "knowledge", "graph"].forEach(view => { const title = document.querySelector(`#view-${view} h1`); if (title && /脑机接口/.test(title.textContent)) title.textContent = title.textContent.replaceAll("脑机接口", name); });
}

function renderJournal() {
  const list = document.querySelector("#journal-list");
  const entries = state.journal.filter(entry => entry.date === today());
  if (!entries.length) return;
  list.innerHTML = entries.map(entry => `<div class="journal-entry ${entry.author === "Morpho" ? "assistant" : ""}"><span class="journal-time">${entry.time}</span><div><strong>${entry.author}</strong><p>${escapeHtml(entry.text)}</p></div></div>`).join("");
  document.querySelector("#journal-count").textContent = `${entries.length} 条记录`;
}

function escapeHtml(text) { return text.replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
function saveJournal(text) {
  const now = new Date();
  state.journal.push({ date: today(), time: now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }), author: "用户", text });
  localStorage.setItem(JOURNAL_KEY, JSON.stringify(state.journal));
  renderJournal();
}

function markdownJournal() {
  const entries = state.journal.filter(entry => entry.date === today());
  return `# Morpho Conversation Journal — ${today()}\n\n> Private local development notes. Do not commit.\n\n${entries.map(entry => `## ${entry.time} · ${entry.author}\n\n${entry.text}`).join("\n\n") || "No entries."}\n`;
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}

document.addEventListener("click", event => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) { switchView(viewButton.dataset.view); return; }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  if (action === "save-setup") { showToast("研究配置已保存，下一步可以查看计划"); switchView("plan"); }
  if (action === "approve-plan") { showToast("计划已确认，任务队列开始运行"); switchView("tasks"); }
  if (action === "run-research") { showToast("研究任务已恢复，正在从上次检查点继续"); switchView("tasks"); }
  if (action === "create-gap-task") { showToast("已创建“产业与应用”补充任务"); switchView("tasks"); }
  if (action === "download-markdown") { download(`${today()}.md`, markdownJournal(), "text/markdown;charset=utf-8"); showToast("今日私有日志已下载"); }
  if (action === "download-json") { download(`${today()}.json`, JSON.stringify(state.journal.filter(entry => entry.date === today()), null, 2), "application/json"); showToast("今日日志 JSON 已下载"); }
  if (action === "toggle-project-menu") { toggleProjectMenu(); }
  if (action === "new-project") {
    document.querySelectorAll("[data-form]").forEach(input => { if (input.dataset.form !== "purpose") input.value = ""; });
    document.querySelector("[data-form=topic]").placeholder = "例如：量子计算、先进封装、气候政策…";
    switchView("setup"); showToast("请填写新研究的主题和范围");
  }
});

function toggleProjectMenu() {
  const menu = document.querySelector("#project-menu");
  const button = document.querySelector(".project-switcher");
  const open = menu.hidden;
  menu.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
}

document.querySelectorAll("[data-project-switch]").forEach(item => item.addEventListener("click", () => {
  selectProject(item.dataset.projectSwitch);
  document.querySelectorAll("[data-project-switch]").forEach(option => option.classList.toggle("active", option === item));
  document.querySelector("#project-menu").hidden = true;
  document.querySelector(".project-switcher").setAttribute("aria-expanded", "false");
  switchView("overview");
  showToast(`已切换到研究项目：${item.dataset.projectSwitch}`);
}));

document.addEventListener("click", event => {
  const project = event.target.closest(".project-card");
  if (!project) return;
  selectProject(project.dataset.project);
  showToast(`已切换到研究项目：${project.dataset.project}`);
  switchView("overview");
});

function assistantReply(prompt) {
  const normalized = prompt.toLowerCase();
  if (normalized.includes("进度")) return `当前“${state.currentProject}”覆盖度为 ${PROJECT_META[state.currentProject]?.coverage || "0%"}，正在整理核心技术与实验。`;
  if (normalized.includes("下一步")) return "建议先完成当前技术实验任务，再补充产业与应用方向的独立来源。";
  if (normalized.includes("审核")) return "当前有 12 个待审核结论，其中 3 个存在冲突。我可以先按来源质量和证据密度排序。";
  return `我会在“${state.currentProject}”项目上下文中处理这个问题。原型阶段可以继续拆分任务、查看来源或记录决定。`;
}

function addAssistantMessage(text, author = "Morpho") {
  const list = document.querySelector("#assistant-messages");
  const item = document.createElement("div"); item.className = `assistant-message ${author === "用户" ? "user" : ""}`;
  item.innerHTML = `${author === "Morpho" ? '<span class="assistant-avatar">✦</span>' : ""}<p>${escapeHtml(text)}</p>`;
  list.appendChild(item); list.scrollTop = list.scrollHeight;
}

document.querySelector("#assistant-launcher").addEventListener("click", toggleAssistant);
function toggleAssistant() { const panel = document.querySelector("#assistant-panel"); panel.hidden = !panel.hidden; if (!panel.hidden) document.querySelector("#assistant-input").focus(); }
document.querySelector("#assistant-form").addEventListener("submit", event => { event.preventDefault(); const input = document.querySelector("#assistant-input"); const text = input.value.trim(); if (!text) return; addAssistantMessage(text, "用户"); input.value = ""; window.setTimeout(() => addAssistantMessage(assistantReply(text)), 220); });
document.querySelectorAll("[data-assistant-prompt]").forEach(button => button.addEventListener("click", () => { const prompt = button.dataset.assistantPrompt; addAssistantMessage(prompt, "用户"); window.setTimeout(() => addAssistantMessage(assistantReply(prompt)), 220); }));

document.querySelector("#journal-form").addEventListener("submit", event => {
  event.preventDefault();
  const input = document.querySelector("#journal-input");
  const text = input.value.trim();
  if (!text) return;
  saveJournal(text); input.value = ""; showToast("已保存到本机私有日志");
});

document.querySelectorAll(".segmented button, .dimension-chips button:not(.add-chip), .filter, .table-tabs button, .source-preferences").forEach(element => {
  element.addEventListener("click", () => {
    if (element.classList.contains("segmented") || element.classList.contains("filter")) return;
    if (element.matches(".segmented button")) { element.parentElement.querySelectorAll("button").forEach(item => item.classList.remove("selected")); element.classList.add("selected"); }
    if (element.matches(".dimension-chips button")) element.classList.toggle("selected");
    if (element.matches(".filter, .table-tabs button")) { element.parentElement.querySelectorAll("button").forEach(item => item.classList.remove("active")); element.classList.add("active"); }
  });
});
