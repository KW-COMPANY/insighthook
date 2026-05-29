const WORKER_ENDPOINT = "https://insighthook.gmo-k-watanabe.workers.dev";

const runBtn = document.getElementById("runBtn");
const progressEl = document.getElementById("progress");
const resultEl = document.getElementById("result");
const errorEl = document.getElementById("error");
const reportContent = document.getElementById("reportContent");
const copyBtn = document.getElementById("copyBtn");

runBtn.addEventListener("click", async () => {
  const url = document.getElementById("targetUrl").value.trim();
  const mode = document.querySelector('input[name="mode"]:checked').value;

  if (!url || !/^https?:\/\//.test(url)) {
    showError("正しいURL（http:// または https://）を入力してください。");
    return;
  }

  resetUI();
  runBtn.disabled = true;
  progressEl.hidden = false;

  try {
    // Server-Sent Events 風に段階的な状況を扱うため、シンプルにポーリングではなく
    // 1リクエストで完結させ、進捗はUI上でアニメーション表現
    animateSteps();

    const res = await fetch(`${WORKER_ENDPOINT}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, mode }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`サーバーエラー: ${res.status} ${text}`);
    }

    const data = await res.json();
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
  }, 4000);
}

function markAllStepsDone() {
  document.querySelectorAll("#steps li").forEach((li) => {
    li.classList.remove("active");
    li.classList.add("done");
  });
}

function showReport(text) {
  // Markdown風の簡易整形
  const html = text
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/^\* (.+)$/gm, "・$1")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  reportContent.innerHTML = html;
  resultEl.hidden = false;
}

function showError(msg) {
  errorEl.textContent = "⚠ " + msg;
  errorEl.hidden = false;
}

copyBtn.addEventListener("click", () => {
  navigator.clipboard.writeText(reportContent.innerText);
  copyBtn.textContent = "✓ コピーしました";
  setTimeout(() => (copyBtn.textContent = "レポートをコピー"), 2000);
});
