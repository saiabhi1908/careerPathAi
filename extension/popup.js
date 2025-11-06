document.getElementById("analyze").addEventListener("click", async () => {
  const jobDesc = document.getElementById("jobDesc").value.trim();
  const resumeText = document.getElementById("resume").value.trim();
  const resumeFile = document.getElementById("resumeFile").files[0];
  const resultBox = document.getElementById("result");
  const loading = document.getElementById("loading");

  if (!jobDesc && !resumeText && !resumeFile) {
    alert("Please provide at least a resume or a job description!");
    return;
  }

  loading.style.display = "block";
  resultBox.innerHTML = "";

  try {
    const formData = new FormData();
    if (resumeFile) formData.append("resume", resumeFile);
    formData.append("resume_text", resumeText);
    formData.append("jobDescription", jobDesc);

    const resp = await fetch("http://localhost:5000/analyze", {
      method: "POST",
      body: formData,
    });

    const data = await resp.json();

    if (data.success) {
      // Extract ATS / Match score from the raw AI text
      const raw = data.raw || "";
      // Try various patterns: "ATS Score: 82/100" or "ATS Score: 82" or old "Match Score: 82%"
      let scoreMatch =
        raw.match(/ATS Score[:\s]*([0-9]{1,3})\s*\/?\s*100/i) ||
        raw.match(/ATS Score[:\s]*([0-9]{1,3})/i) ||
        raw.match(/Match Score[:\s]*([0-9]{1,3})/i) ||
        raw.match(/Match Score[:\s]*([0-9]{1,3})%/i);

      const score = scoreMatch ? Math.max(0, Math.min(100, parseInt(scoreMatch[1], 10))) : null;

      // Build SVG gauge HTML
      function buildGaugeHTML(score) {
        if (score === null) return "";
        const pct = score;
        // circumference for circle r=45 => ~2πr
        // We'll animate stroke-dashoffset to represent value
        const circumference = 2 * Math.PI * 45; // ~282.743
        const offset = Math.round(circumference * (1 - pct / 100));
        // choose color
        let colorClass = "gauge-green";
        if (pct >= 75) colorClass = "gauge-green";
        else if (pct >= 50) colorClass = "gauge-yellow";
        else if (pct >= 30) colorClass = "gauge-orange";
        else colorClass = "gauge-red";

        return `
          <div class="ats-gauge-wrapper">
            <div class="ats-gauge ${colorClass}" role="status" aria-label="ATS Score ${pct} out of 100">
              <svg class="gauge-svg" viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">
                <!-- background circle -->
                <circle class="gauge-bg" cx="60" cy="60" r="45" stroke-width="10" fill="none"></circle>
                <!-- progress circle -->
                <circle class="gauge-progress" cx="60" cy="60" r="45" stroke-width="10"
                  stroke-dasharray="${circumference}" stroke-dashoffset="${circumference}"
                  style="stroke-dashoffset: ${offset}; transition: stroke-dashoffset 1s cubic-bezier(.2,.9,.2,1);"></circle>
                <!-- central text -->
                <text x="50%" y="50%" text-anchor="middle" dy="6" class="gauge-text">${pct}</text>
                <text x="50%" y="50%" text-anchor="middle" dy="26" class="gauge-subtext">/100</text>
              </svg>
              <div class="gauge-label">ATS Score</div>
            </div>
          </div>
        `;
      }

      // Clean the returned HTML to avoid showing the original "Match Score" line
      let resultHtml = data.resultHtml || "";
      // Remove Match/ATS Score lines that appear alone (a few patterns)
      resultHtml = resultHtml.replace(/^\s*(Match Score|ATS Score)[:\s]*[^\n<]+(\n|<br>)?/im, "");
      // Prepend our gauge
      const gaugeHtml = buildGaugeHTML(score);
      resultBox.style.opacity = 0;
      resultBox.innerHTML = gaugeHtml + resultHtml;
      setTimeout(() => (resultBox.style.opacity = 1), 100);
      resultBox.scrollIntoView({ behavior: "smooth" });
    } else {
      resultBox.innerHTML = `<p style="color:#f87171">${data.error}</p>`;
    }
  } catch (err) {
    console.error(err);
    resultBox.innerHTML =
      "<p style='color:#f87171'>     Server not reachable. Make sure your backend is running.</p>";
  } finally {
    loading.style.display = "none";
  }
});
