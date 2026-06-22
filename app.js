const WORKER_ENDPOINT = "https://insighthook.gmo-k-watanabe.workers.dev";

const runBtn = document.getElementById("runBtn");
const progressEl = document.getElementById("progress");
const resultEl = document.getElementById("result");
const errorEl = document.getElementById("error");
const reportContent = document.getElementById("reportContent");
const copyBtn = document.getElementById("copyBtn");

const BLOCKED_URL_PATTERNS = [
  /\/admin/i, /\/login/i, /\/mypage/i, /\/members?\//i,
  /\/account/i, /\/dashboard/i,
  /localhost|127\.0\.0\.1|192\.168\./i,
];

runBtn.addEventListener("click", async () => {
  const url = document.getElementById("targetUrl").value.trim();

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
      const code = data.code || "UNKNOWN";
      const detail = data.detail ? `\n詳細: ${data.detail}` : "";
      throw new Error(`分析エラー [${code}] (HTTP ${res.status})${detail}`);
    }

    markAllStepsDone();
    showReport(data.report);
  } catch (err) {
    showError(err.message || "予期しないエラーが発生しました。");
  } finally {
    runBtn.disabled = false;
  }
});

function resetUI() {
  resultEl.hidden = true;
  errorEl.hidden = true;
  reportContent.innerHTML = "";
  document.querySelectorAll("#steps li").forEach((li) => {
    li.classList.remove("done", "active");
  });
}

function animateSteps() {
  const steps = document.querySelectorAll("#steps li");
  let i = 0;
  steps[0].classList.add("active");
  const interval = setInterval(() => {
    if (i >= steps.length - 1) {
      clearInterval(interval);
      return;
    }
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

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* ===== レポート表示（カード型UI） ===== */
function showReport(text) {
  reportContent.innerHTML = "";

  // workers.js の assembleReport() が埋め込む <!-- SECTION: xxx --> タグで分割
  const sectionDefs = [
    {
      key: "PROFILE",
      icon: "🏢",
      title: "営業先プロファイル",
      priority: "low",
      cardClass: "card-profile",
      renderer: renderProfileCard,
    },
    {
      key: "ANALYSIS",
      icon: "📈",
      title: "業界分析",
      priority: "medium",
      cardClass: "card-analysis",
      renderer: renderMarkdownCard,
    },
    {
      key: "HOOKS",
      icon: "💬",
      title: "商談で使える営業フック",
      priority: "high",
      cardClass: "card-hooks",
      renderer: renderHooksCard,
    },
    {
      key: "CAUTION",
      icon: "⚠️",
      title: "利用上の注意",
      priority: "low",
      cardClass: "card-caution",
      renderer: renderMarkdownCard,
    },
  ];

  // SECTIONタグで分割
  const sectionRegex = /<!--\s*SECTION:\s*(\w+)\s*-->([\s\S]*?)(?=<!--\s*SECTION:|$)/g;
  const sections = {};
  let m;
  while ((m = sectionRegex.exec(text)) !== null) {
    sections[m[1].toUpperCase()] = m[2].trim();
  }

  // SECTIONタグが見つからない場合はフォールバック
  const hasSections = Object.keys(sections).length > 0;
  if (!hasSections) {
    renderFallback(text);
    resultEl.hidden = false;
    return;
  }

  sectionDefs.forEach((def) => {
    const content = sections[def.key];
    if (!content) return;
    const card = buildCard(def.icon, def.title, def.priority, def.cardClass, def.renderer, content);
    reportContent.appendChild(card);
  });

  resultEl.hidden = false;
}

/* カード骨格を生成 */
function buildCard(icon, title, priority, cardClass, renderer, content) {
  const card = document.createElement("div");
  card.className = `report-card ${cardClass}`;

  const priorityLabels = { high: "最重要", medium: "重要", low: "参考" };
  const header = document.createElement("div");
  header.className = "report-card-header";
  header.innerHTML = `
    <span class="report-card-title">${icon} ${escapeHtml(title)}</span>
    <span class="priority-badge ${priority}">${priorityLabels[priority] || priority}</span>
  `;
  card.appendChild(header);

  const body = document.createElement("div");
  body.className = "report-card-body";
  renderer(body, content);
  card.appendChild(body);

  return card;
}

/* プロファイルカード：Key:Value 形式をグリッド表示 */
function renderProfileCard(container, text) {
  const grid = document.createElement("div");
  grid.className = "profile-grid";

  const fieldMap = {
    "会社名": "company_name",
    "事業内容": "business_summary",
    "主要製品・サービス": "main_products_services",
    "ターゲット顧客": "target_customers",
    "強み・独自性": "value_proposition",
    "企業ステージ": "company_stage",
    "所属業界": "industry",
  };

  // ** Key:** Value 形式をパース
  const lines = text.split("\n").filter((l) => l.trim());
  lines.forEach((line) => {
    const match = line.match(/\*\*(.+?)[:：]\*\*\s*(.*)/);
    if (!match) return;
    const label = match[1].trim();
    const value = match[2].trim() || "—";
    const item = document.createElement("div");
    item.className = "profile-item";
    item.innerHTML = `<div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div>`;
    grid.appendChild(item);
  });

  if (grid.children.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted);font-size:0.88rem;">${escapeHtml(text)}</p>`;
    return;
  }
  container.appendChild(grid);
}

/* Markdownカード：汎用Markdownレンダリング */
function renderMarkdownCard(container, text) {
  const safe = escapeHtml(text);
  let html = safe
    // テーブル（|---|）
    .replace(/^\|(.+)\|$/gm, (row) => row)
    // 見出し
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    // 太字
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // 箇条書き（- / *）
    .replace(/^[*\-] (.+)$/gm, "<li>$1</li>")
    // ・記法
    .replace(/^・(.+)$/gm, "<li>$1</li>");

  // <li>タグを<ul>で囲む
  html = html.replace(/(<li>[\s\S]*?<\/li>)(?=\s*<li>|$)/gm, (m) => m);
  html = html.replace(/((?:<li>[\s\S]*?<\/li>\n?)+)/g, "<ul>$1</ul>");

  html = convertMarkdownTable(html);

  // 改行
  html = html.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
  container.innerHTML = `<div class="md-body"><p>${html}</p></div>`;
}

/* Markdownテーブル → HTMLテーブル変換 */
function convertMarkdownTable(html) {
  // エスケープ済みの | を検出
  const tableRegex = /((?:\|.+\|\n?)+)/g;
  return html.replace(tableRegex, (block) => {
    const rows = block.trim().split("\n").filter((r) => r.trim() !== "");
    if (rows.length < 2) return block;

    // 区切り行（|---|）を除外
    const dataRows = rows.filter((r) => !/^\|[\s\-|:]+\|$/.test(r));
    if (dataRows.length === 0) return block;

    const parseRow = (row) =>
      row
        .split("|")
        .filter((_, i, arr) => i > 0 && i < arr.length - 1)
        .map((cell) => cell.trim());

    const [headerRow, ...bodyRows] = dataRows;
    const headers = parseRow(headerRow).map((h) => `<th>${h}</th>`).join("");
    const bodyHtml = bodyRows
      .map((r) => `<tr>${parseRow(r).map((c) => `<td>${c}</td>`).join("")}</tr>`)
      .join("\n");

    return `<table><thead><tr>${headers}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
  });
}

function renderHooksCard(container, text) {
  const hookList = document.createElement("div");
  hookList.className = "hook-list";

  // **フックN: [テーマ名]** ブロックを分割
  const safe = escapeHtml(text);
  const hookBlocks = safe.split(/(?=\*\*フック\d+[:：])/);

  hookBlocks.forEach((block) => {
    const trimmed = block.trim();
    if (!trimmed) return;

    const item = document.createElement("div");
    item.className = "hook-item";

    // タイトル行
    const titleMatch = trimmed.match(/\*\*(.+?)\*\*/);
    const titleText = titleMatch ? titleMatch[1] : "フック";
    const titleEl = document.createElement("div");
    titleEl.className = "hook-title";
    titleEl.innerHTML = `🎣 ${titleText}`;
    item.appendChild(titleEl);

    // 切り出し・刺さる理由・続けて聞く質問
    const rowDefs = [
      { key: "切り出し", label: "切り出し方" },
      { key: "刺さる理由", label: "刺さる理由" },
      { key: "続けて聞く質問", label: "続く質問" },
    ];

    rowDefs.forEach(({ key, label }) => {
      const re = new RegExp(`- ${key}[:：]\\s*(.+)`);
      const match = trimmed.match(re);
      if (!match) return;
      const row = document.createElement("div");
      row.className = "hook-row";
      row.innerHTML = `<span class="hook-row-label">${label}</span><span>${match[1].trim()}</span>`;
      item.appendChild(row);
    });

    if (item.children.length <= 1) {
      const fallbackText = trimmed
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\n/g, "<br>");
      item.innerHTML += `<div style="font-size:0.87rem;color:#cbd5e0;">${fallbackText}</div>`;
    }

    hookList.appendChild(item);
  });

  // パースできなかった場合はMarkdownにフォールバック
  if (hookList.children.length === 0) {
    renderMarkdownCard(container, text);
    return;
  }

  container.appendChild(hookList);
}

/* SECTIONタグなし旧フォーマットのフォールバック */
function renderFallback(text) {
  const safe = escapeHtml(text);
  let html = safe
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^\* (.+)$/gm, "・$1")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  const wrapper = document.createElement("div");
  wrapper.className = "report-card card-analysis";
  wrapper.style.whiteSpace = "pre-wrap";
  wrapper.innerHTML = html;
  reportContent.appendChild(wrapper);
}

function showError(msg) {
  errorEl.innerHTML = "⚠ " + escapeHtml(msg).replace(/\n/g, "<br>");
  errorEl.hidden = false;
  progressEl.hidden = true;
}

copyBtn.addEventListener("click", () => {
  const textContent = reportContent.innerText || reportContent.textContent || "";
  navigator.clipboard.writeText(textContent).then(() => {
    copyBtn.innerHTML = "<span>✓</span> コピーしました";
    copyBtn.style.background = "rgba(0, 184, 148, 0.2)";
    copyBtn.style.borderColor = "rgba(0, 184, 148, 0.5)";
    setTimeout(() => {
      copyBtn.innerHTML = "<span>📋</span> レポートをコピー";
      copyBtn.style.background = "";
      copyBtn.style.borderColor = "";
    }, 2000);
  }).catch(() => {
    copyBtn.textContent = "コピー失敗";
    setTimeout(() => (copyBtn.innerHTML = "<span>📋</span> レポートをコピー"), 2000);
  });
});
