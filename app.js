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
      // エラーコードとdetailを表示（原因切り分け用）
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
  }, 6000); // 7000 → 6000ms（処理時間に合わせて調整）
}

function markAllStepsDone() {
  document.querySelectorAll("#steps li").forEach((li) => {
    li.classList.remove("active");
    li.classList.add("done");
  });
}

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function showReport(text) {
  const safe = escapeHtml(text);
  const html = safe
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^\* (.+)$/gm, "・$1")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  reportContent.innerHTML = html;
  resultEl.hidden = false;
}

function showError(msg) {
  errorEl.innerHTML = "⚠ " + escapeHtml(msg).replace(/\n/g, "<br>");
  errorEl.hidden = false;
}

copyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(reportContent.innerText);
  copyBtn.textContent = "✓ コピーしました";
  setTimeout(() => (copyBtn.textContent = "レポートをコピー"), 2000);
});
