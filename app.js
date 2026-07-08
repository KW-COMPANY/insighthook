// File: app.js
const WORKER_ENDPOINT = "https://insighthook.gmo-k-watanabe.workers.dev";
const HISTORY_KEY = "insighthook_history_v1";
const HISTORY_MAX = 10;

const runBtn     = document.getElementById("runBtn");
const progressEl = document.getElementById("progress");
const resultEl   = document.getElementById("result");
const errorEl    = document.getElementById("error");
const reportContent = document.getElementById("reportContent");
const copyBtn    = document.getElementById("copyBtn");
const printBtn   = document.getElementById("printBtn");
const targetUrlInput = document.getElementById("targetUrl");
const urlHintEl  = document.getElementById("urlHint");
const cacheBadgeEl = document.getElementById("cacheBadge");
const historySection = document.getElementById("historySection");
const historyList = document.getElementById("historyList");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");

const BLOCKED_URL_PATTERNS = [
  /\/admin/i, /\/login/i, /\/mypage/i, /\/members?\//i,
  /\/account/i, /\/dashboard/i,
  /localhost|127\.0\.0\.1|192\.168\./i,
];

/* ================================================================
   URLリアルタイムバリデーション
================================================================ */
targetUrlInput.addEventListener("input", () => {
  const val = targetUrlInput.value.trim();
  targetUrlInput.classList.remove("input-valid", "input-invalid");
  urlHintEl.textContent = "";
  urlHintEl.classList.remove("hint-error", "hint-ok");

  if (!val) return;

  if (!/^https?:\/\//.test(val)) {
    targetUrlInput.classList.add("input-invalid");
    urlHintEl.textContent = "http:// または https:// から始まるURLを入力してください。";
    urlHintEl.classList.add("hint-error");
    return;
  }
  if (BLOCKED_URL_PATTERNS.some((re) => re.test(val))) {
    targetUrlInput.classList.add("input-invalid");
    urlHintEl.textContent = "会員専用・管理画面と思われるURLは分析対象外です。";
    urlHintEl.classList.add("hint-error");
    return;
  }
  targetUrlInput.classList.add("input-valid");
  urlHintEl.textContent = "✓ 分析可能な形式のURLです";
  urlHintEl.classList.add("hint-ok");
});

runBtn.addEventListener("click", async () => {
  const url = targetUrlInput.value.trim();
  if (!url || !/^https?:\/\//.test(url)) {
    showError("正しいURL（http:// または https://）を入力してください。");
    return;
  }
  if (BLOCKED_URL_PATTERNS.some((re) => re.test(url))) {
    showError("会員専用・管理画面と思われるURLは分析対象外です。");
    return;
  }

  resetUI();
  runBtn.disabled = true;
  progressEl.hidden = false;

  try {
    animateSteps();

    const res = await fetch(`${WORKER_ENDPOINT}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const code   = data.code   || "UNKNOWN";
      const detail = data.detail ? `\n詳細: ${data.detail}` : "";
      throw new Error(`分析エラー [${code}] (HTTP ${res.status})${detail}`);
    }

    markAllStepsDone();
    showCacheBadge(data.cached, data.cachedAt);
    showReport(data.report);
    saveHistory(url, data.report, data.cached, data.cachedAt);
    renderHistory();
  } catch (err) {
    showError(err.message || "予期しないエラーが発生しました。");
  } finally {
    runBtn.disabled = false;
  }
});

/* ---------- UI制御 ---------- */
function resetUI() {
  resultEl.hidden  = true;
  errorEl.hidden   = true;
  reportContent.innerHTML = "";
  cacheBadgeEl.hidden = true;
  document.querySelectorAll("#steps li").forEach((li) => {
    li.classList.remove("done", "active");
  });
}

function animateSteps() {
  const steps = document.querySelectorAll("#steps li");
  let i = 0;
  steps[0].classList.add("active");
  const interval = setInterval(() => {
    if (i >= steps.length - 1) { clearInterval(interval); return; }
    steps[i].classList.remove("active");
    steps[i].classList.add("done");
    i++;
    steps[i].classList.add("active");
  }, 6000);
}

function markAllStepsDone() {
  document.querySelectorAll("#steps li").forEach((li) => {
    li.classList.remove("active");
    li.classList.add("done");
  });
}

/* ================================================================
   キャッシュバッジ表示
================================================================ */
function showCacheBadge(cached, cachedAt) {
  if (!cached || !cachedAt) {
    cacheBadgeEl.hidden = true;
    return;
  }
  const hours = Math.max(0, Math.floor((Date.now() - cachedAt) / 3600000));
  const label = hours < 1 ? "1時間以内に生成" : `${hours}時間前に生成`;
  cacheBadgeEl.textContent = `🗂 キャッシュ結果（${label}）`;
  cacheBadgeEl.hidden = false;
}

/* ================================================================
   分析履歴（localStorage）
================================================================ */
function loadHistoryList() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory(url, report, cached, cachedAt) {
  try {
    let list = loadHistoryList();
    list = list.filter((h) => h.url !== url);
    list.unshift({ url, report, cached: !!cached, cachedAt: cachedAt || Date.now(), savedAt: Date.now() });
    if (list.length > HISTORY_MAX) list = list.slice(0, HISTORY_MAX);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn("HISTORY_SAVE_FAILED:", e.message);
  }
}

function renderHistory() {
  const list = loadHistoryList();
  historyList.innerHTML = "";

  if (list.length === 0) {
    historySection.hidden = true;
    return;
  }

  list.forEach((item) => {
    const row = document.createElement("div");
    row.className = "history-item";

    const info = document.createElement("div");
    info.className = "history-item-info";

    const urlEl = document.createElement("div");
    urlEl.className = "history-item-url";
    urlEl.textContent = item.url;

    const dateEl = document.createElement("div");
    dateEl.className = "history-item-date";
    dateEl.textContent = new Date(item.savedAt).toLocaleString("ja-JP");

    info.appendChild(urlEl);
    info.appendChild(dateEl);

    const btn = document.createElement("button");
    btn.className = "btn-secondary btn-small";
    btn.textContent = "再表示";
    btn.addEventListener("click", () => {
      targetUrlInput.value = item.url;
      resetUI();
      showCacheBadge(true, item.savedAt);
      showReport(item.report);
      resultEl.hidden = false;
      resultEl.scrollIntoView({ behavior: "smooth" });
    });

    row.appendChild(info);
    row.appendChild(btn);
    historyList.appendChild(row);
  });

  historySection.hidden = false;
}

clearHistoryBtn.addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});

/* ---------- エスケープ（DOM挿入直前のみ使用） ---------- */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ---------- 安全なテキストノード挿入 ---------- */
function safeText(el, text) {
  el.textContent = text;
}

/* ---------- Markdown→HTML変換（エスケープ済み文字列に適用） ---------- */
function mdToHtml(raw) {
  let s = escapeHtml(raw);
  s = convertMarkdownTable(s);
  s = s.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  s = s.replace(/^##\s+(.+)$/gm,  "<h3>$1</h3>");
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/^[-*]\s+(.+)$/gm, "<li>$1</li>");
  s = s.replace(/^・(.+)$/gm,      "<li>$1</li>");
  s = s.replace(/((?:<li>[\s\S]*?<\/li>\n?)+)/g, "<ul>$1</ul>");
  s = s.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
  return `<p>${s}</p>`;
}

/* ---------- Markdownテーブル → HTMLテーブル ---------- */
function convertMarkdownTable(s) {
  return s.replace(/((?:\|.+\|\n?)+)/g, (block) => {
    const rows = block.trim().split("\n").filter((r) => r.trim());
    if (rows.length < 2) return block;

    const dataRows = rows.filter((r) => !/^\|[\s\-|:]+\|$/.test(r));
    if (dataRows.length === 0) return block;

    const parseRow = (row) =>
      row.split("|").filter((_, i, a) => i > 0 && i < a.length - 1).map((c) => c.trim());

    const [hRow, ...bRows] = dataRows;
    const ths  = parseRow(hRow).map((h) => `<th>${h}</th>`).join("");
    const tbdy = bRows.map((r) => `<tr>${parseRow(r).map((c) => `<td>${c}</td>`).join("")}</tr>`).join("");
    return `<table><thead><tr>${ths}</tr></thead><tbody>${tbdy}</tbody></table>`;
  });
}

/* ================================================================
   レポート表示（カード型UI）
================================================================ */
function showReport(text) {
  reportContent.innerHTML = "";

  const sectionDefs = [
    { key: "PROFILE",  icon: "🏢", title: "営業先プロファイル",       priority: "low",    cardClass: "card-profile",  renderer: renderProfileCard  },
    { key: "ANALYSIS", icon: "📈", title: "業界分析",                  priority: "medium", cardClass: "card-analysis", renderer: renderMarkdownCard },
    { key: "HOOKS",    icon: "💬", title: "商談で使える営業フック",    priority: "high",   cardClass: "card-hooks",    renderer: renderHooksCard    },
    { key: "CAUTION",  icon: "⚠️", title: "利用上の注意",              priority: "low",    cardClass: "card-caution",  renderer: renderMarkdownCard },
  ];

  const sectionRegex = /<!--\s*SECTION:\s*(\w+)\s*-->([\s\S]*?)(?=<!--\s*SECTION:|$)/g;
  const sections = {};
  let m;
  while ((m = sectionRegex.exec(text)) !== null) {
    sections[m[1].toUpperCase()] = m[2].trim();
  }

  if (Object.keys(sections).length === 0) {
    renderFallback(text);
    resultEl.hidden = false;
    return;
  }

  sectionDefs.forEach(({ key, icon, title, priority, cardClass, renderer }) => {
    const content = sections[key];
    if (!content) return;
    const card = buildCard(icon, title, priority, cardClass, renderer, content);
    reportContent.appendChild(card);
  });

  resultEl.hidden = false;
}

/* ---------- カード骨格生成 ---------- */
function buildCard(icon, title, priority, cardClass, renderer, content) {
  const card = document.createElement("div");
  card.className = `report-card ${cardClass}`;

  const priorityLabels = { high: "最重要", medium: "重要", low: "参考" };

  const header = document.createElement("div");
  header.className = "report-card-header";

  const titleEl = document.createElement("span");
  titleEl.className = "report-card-title";
  titleEl.textContent = `${icon} ${title}`;

  const badge = document.createElement("span");
  badge.className = `priority-badge ${priority}`;
  badge.textContent = priorityLabels[priority] || priority;

  header.appendChild(titleEl);
  header.appendChild(badge);

  const body = document.createElement("div");
  body.className = "report-card-body";

  try {
    renderer(body, content);
  } catch (e) {
    console.error("RENDER_ERROR:", e);
    renderMarkdownCard(body, content);
  }

  card.appendChild(header);
  card.appendChild(body);
  return card;
}

/* ================================================================
   プロファイルカード
================================================================ */
function renderProfileCard(container, text) {
  const grid = document.createElement("div");
  grid.className = "profile-grid";

  const lines = text.split("\n");
  lines.forEach((line) => {
    const match = line.match(/^\*\*(.+?)[:：]\*\*\s*(.*)/);
    if (!match) return;

    const label = match[1].trim();
    const value = match[2].trim() || "—";

    const item  = document.createElement("div");
    item.className = "profile-item";

    const labelEl = document.createElement("div");
    labelEl.className = "label";
    labelEl.textContent = label;

    const valueEl = document.createElement("div");
    valueEl.className = "value";
    valueEl.textContent = value;

    item.appendChild(labelEl);
    item.appendChild(valueEl);
    grid.appendChild(item);
  });

  if (grid.children.length === 0) {
    renderMarkdownCard(container, text);
    return;
  }
  container.appendChild(grid);
}

/* ================================================================
   汎用Markdownカード
================================================================ */
function renderMarkdownCard(container, text) {
  const div = document.createElement("div");
  div.className = "md-body";
  div.innerHTML = mdToHtml(text);
  container.appendChild(div);
}

/* ================================================================
   営業フックカード
================================================================ */
function renderHooksCard(container, text) {
  const hooks = parseHooks(text);

  if (hooks.length === 0) {
    console.warn("HOOKS_PARSE: フォールバック（パース結果0件）");
    renderMarkdownCard(container, text);
    return;
  }

  const hookList = document.createElement("div");
  hookList.className = "hook-list";

  hooks.forEach((hook, idx) => {
    const item = document.createElement("div");
    item.className = "hook-item";

    const titleEl = document.createElement("div");
    titleEl.className = "hook-title";
    titleEl.textContent = `🎣 ${hook.title || `フック${idx + 1}`}`;
    item.appendChild(titleEl);

    const rowDefs = [
      { field: "opening",  label: "切り出し方" },
      { field: "reason",   label: "刺さる理由" },
      { field: "question", label: "続く質問"   },
    ];
    rowDefs.forEach(({ field, label }) => {
      const val = hook[field];
      if (!val) return;
      const row = document.createElement("div");
      row.className = "hook-row";

      const lbl = document.createElement("span");
      lbl.className = "hook-row-label";
      lbl.textContent = label;

      const txt = document.createElement("span");
      txt.textContent = val;

      row.appendChild(lbl);
      row.appendChild(txt);
      item.appendChild(row);
    });

    if (item.children.length <= 1) {
      const raw = document.createElement("p");
      raw.style.cssText = "font-size:0.87rem;color:#cbd5e0;margin-top:0.4rem;";
      raw.textContent = hook.rawBody || "";
      item.appendChild(raw);
    }

    hookList.appendChild(item);
  });

  container.appendChild(hookList);
}

/* ================================================================
   parseHooks()
================================================================ */
function parseHooks(text) {
  const hooks  = [];
  let current  = null;

  const isHookHeader = (line) => {
    const normalized = line
      .replace(/\*\*/g, "")
      .replace(/[１２３４５６７８９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
      .trim();
    return /フック\s*[1-9]/.test(normalized);
  };

  const extractTitle = (line) => {
    return line
      .replace(/\*\*/g, "")
      .replace(/^フック\s*[1-9１-９]\s*[:：]\s*/, "")
      .replace(/^[-*\s]+/, "")
      .trim();
  };

  const classifyField = (line) => {
    const clean = line.replace(/^[-*・\s]+/, "").trim();

    if (/^(切り出し|切り出す|opener|opening)/i.test(clean)) {
      return { field: "opening",  value: clean.replace(/^[^:：]+[:：]\s*/, "") };
    }
    if (/^(刺さる|why|reason)/i.test(clean)) {
      return { field: "reason",   value: clean.replace(/^[^:：]+[:：]\s*/, "") };
    }
    if (/^(続け|質問|question|follow)/i.test(clean)) {
      return { field: "question", value: clean.replace(/^[^:：]+[:：]\s*/, "") };
    }
    return null;
  };

  const lines = text.split("\n");
  const bodyLines = [];

  const flushCurrent = () => {
    if (!current) return;
    if (!current.rawBody) current.rawBody = bodyLines.join("\n").trim();
    hooks.push(current);
    bodyLines.length = 0;
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;

    if (isHookHeader(line)) {
      flushCurrent();
      current = {
        title:    extractTitle(line),
        opening:  "",
        reason:   "",
        question: "",
        rawBody:  "",
      };
      return;
    }

    if (!current) return;

    const classified = classifyField(line);
    if (classified) {
      current[classified.field] = classified.value;
    } else {
      bodyLines.push(line);
    }
  });

  flushCurrent();
  return hooks;
}

/* ================================================================
   フォールバック（SECTIONタグ未検出時）
================================================================ */
function renderFallback(text) {
  const wrapper = document.createElement("div");
  wrapper.className = "report-card card-analysis";
  wrapper.innerHTML = mdToHtml(text);
  reportContent.appendChild(wrapper);
}

/* ---------- エラー表示 ---------- */
function showError(msg) {
  errorEl.innerHTML = "⚠ " + escapeHtml(msg).replace(/\n/g, "<br>");
  errorEl.hidden   = false;
  progressEl.hidden = true;
}

/* ---------- コピーボタン ---------- */
copyBtn.addEventListener("click", () => {
  const text = reportContent.innerText || reportContent.textContent || "";
  navigator.clipboard.writeText(text).then(() => {
    copyBtn.innerHTML = "<span>✓</span> コピーしました";
    copyBtn.style.background   = "rgba(0, 184, 148, 0.2)";
    copyBtn.style.borderColor  = "rgba(0, 184, 148, 0.5)";
    setTimeout(() => {
      copyBtn.innerHTML         = "<span>📋</span> レポートをコピー";
      copyBtn.style.background  = "";
      copyBtn.style.borderColor = "";
    }, 2000);
  }).catch(() => {
    copyBtn.textContent = "コピー失敗";
    setTimeout(() => { copyBtn.innerHTML = "<span>📋</span> レポートをコピー"; }, 2000);
  });
});

/* ---------- 印刷・PDF保存ボタン ---------- */
printBtn.addEventListener("click", () => {
  window.print();
});

/* ---------- 初期表示：履歴を復元 ---------- */
renderHistory();
