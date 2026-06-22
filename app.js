const WORKER_ENDPOINT = "https://insighthook.gmo-k-watanabe.workers.dev";

const runBtn     = document.getElementById("runBtn");
const progressEl = document.getElementById("progress");
const resultEl   = document.getElementById("result");
const errorEl    = document.getElementById("error");
const reportContent = document.getElementById("reportContent");
const copyBtn    = document.getElementById("copyBtn");

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
      const code   = data.code   || "UNKNOWN";
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

/* ---------- UI制御 ---------- */
function resetUI() {
  resultEl.hidden  = true;
  errorEl.hidden   = true;
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
  // ① まずエスケープ
  let s = escapeHtml(raw);

  // ② Markdownテーブルをまとめて変換（エスケープ後の | を使用）
  s = convertMarkdownTable(s);

  // ③ 見出し
  s = s.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  s = s.replace(/^##\s+(.+)$/gm,  "<h3>$1</h3>");

  // ④ 太字
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // ⑤ 箇条書き（- / * / ・ いずれも対応）
  s = s.replace(/^[-*]\s+(.+)$/gm, "<li>$1</li>");
  s = s.replace(/^・(.+)$/gm,      "<li>$1</li>");

  // ⑥ 連続する<li>を<ul>で囲む
  s = s.replace(/((?:<li>[\s\S]*?<\/li>\n?)+)/g, "<ul>$1</ul>");

  // ⑦ 連続する改行を段落区切りに
  s = s.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
  return `<p>${s}</p>`;
}

/* ---------- Markdownテーブル → HTMLテーブル ---------- */
function convertMarkdownTable(s) {
  // エスケープ後の | で区切られた行ブロックを検出
  return s.replace(/((?:\|.+\|\n?)+)/g, (block) => {
    const rows = block.trim().split("\n").filter((r) => r.trim());
    if (rows.length < 2) return block;

    // 区切り行（|---|）を除外
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
   workers.js の assembleReport() が埋め込む
   <!-- SECTION: XXX --> タグでセクションを分割して描画
================================================================ */
function showReport(text) {
  reportContent.innerHTML = "";

  const sectionDefs = [
    { key: "PROFILE",  icon: "🏢", title: "営業先プロファイル",       priority: "low",    cardClass: "card-profile",  renderer: renderProfileCard  },
    { key: "ANALYSIS", icon: "📈", title: "業界分析",                  priority: "medium", cardClass: "card-analysis", renderer: renderMarkdownCard },
    { key: "HOOKS",    icon: "💬", title: "商談で使える営業フック",    priority: "high",   cardClass: "card-hooks",    renderer: renderHooksCard    },
    { key: "CAUTION",  icon: "⚠️", title: "利用上の注意",              priority: "low",    cardClass: "card-caution",  renderer: renderMarkdownCard },
  ];

  // <!-- SECTION: KEY --> でブロックを分割
  const sectionRegex = /<!--\s*SECTION:\s*(\w+)\s*-->([\s\S]*?)(?=<!--\s*SECTION:|$)/g;
  const sections = {};
  let m;
  while ((m = sectionRegex.exec(text)) !== null) {
    sections[m[1].toUpperCase()] = m[2].trim();
  }

  // SECTIONタグ未検出 → 旧フォーマット対応フォールバック
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

  // renderer が例外を投げても必ずフォールバック表示
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
   "**Key:** Value" 形式の行をグリッド表示
================================================================ */
function renderProfileCard(container, text) {
  const grid = document.createElement("div");
  grid.className = "profile-grid";

  const lines = text.split("\n");
  lines.forEach((line) => {
    // **ラベル:** 値　の形式を抽出（:と：どちらも対応）
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
    // パース失敗時は汎用Markdownにフォールバック
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
   【設計方針】
   - escapeHtml()「前」の生テキストをパースしてDOMを組み立て、
     テキストノード挿入時だけ textContent を使って自動エスケープ。
   - 正規表現に頼らず「行ベースのステートマシン」で解析するため
     AIの出力ゆらぎ（全角数字・スペース・前置き文など）に強い。
================================================================ */
function renderHooksCard(container, text) {
  // ---------- パース ----------
  const hooks = parseHooks(text);

  // パース結果が1件もなければ汎用Markdownにフォールバック
  if (hooks.length === 0) {
    console.warn("HOOKS_PARSE: フォールバック（パース結果0件）");
    renderMarkdownCard(container, text);
    return;
  }

  // ---------- 描画 ----------
  const hookList = document.createElement("div");
  hookList.className = "hook-list";

  hooks.forEach((hook, idx) => {
    const item = document.createElement("div");
    item.className = "hook-item";

    // タイトル
    const titleEl = document.createElement("div");
    titleEl.className = "hook-title";
    titleEl.textContent = `🎣 ${hook.title || `フック${idx + 1}`}`;
    item.appendChild(titleEl);

    // 3行フィールド
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
      txt.textContent = val;   // textContent で自動エスケープ

      row.appendChild(lbl);
      row.appendChild(txt);
      item.appendChild(row);
    });

    // 3フィールドが1つも取れなかったフックは本文をそのまま表示
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
   【ゆらぎ吸収の仕組み】
   行を1行ずつ読み「これはフックの見出し行か？」を判定して
   ブロックを分割する。見出し行の判定条件を広めに取る：
     - 「フック」という文字を含む
     - 前後に ** があってもなくてもよい
     - 数字は半角・全角どちらでも可
     - : と ： どちらでも可
     - 前置き文（「以下に〜」など）が混入していても読み飛ばす
================================================================ */
function parseHooks(text) {
  const hooks  = [];
  let current  = null;

  // フック見出し行かどうかを判定（ゆらぎ吸収）
  const isHookHeader = (line) => {
    const normalized = line
      .replace(/\*\*/g, "")         // ** 除去
      .replace(/[１２３４５６７８９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)) // 全角数字→半角
      .trim();
    return /フック\s*[1-9]/.test(normalized);
  };

  // フックタイトルを抽出（**: 除去・整形）
  const extractTitle = (line) => {
    return line
      .replace(/\*\*/g, "")
      .replace(/^フック\s*[1-9１-９]\s*[:：]\s*/, "")  // "フック1: " を除去してテーマ名だけ残す
      .replace(/^[-*\s]+/, "")
      .trim();
  };

  // フィールド行を分類（切り出し / 刺さる理由 / 続けて聞く質問）
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
  const bodyLines = [];   // 現フックの未分類行を蓄積

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

    if (!current) return;  // フック開始前の前置き行は無視

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
