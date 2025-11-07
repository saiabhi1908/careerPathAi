document.getElementById("analyze").addEventListener("click", async () => {
  const jobDesc = document.getElementById("jobDesc").value.trim();
  const resumeText = document.getElementById("resume").value.trim();
  const resumeFile = document.getElementById("resumeFile").files[0];
  const resultBox = document.getElementById("result");
  const loading = document.getElementById("loading");
  const atsCircle = document.getElementById("atsCircle");
  const atsInner = atsCircle.querySelector(".inner");

  if (!jobDesc || (!resumeText && !resumeFile)) {
    alert("Please provide both Job Description and Resume (text or file).");
    return;
  }

  resultBox.style.display = "none";
  loading.style.display = "block";

  try {
    const formData = new FormData();
    formData.append("jobDesc", jobDesc);
    formData.append("resumeText", resumeText);
    if (resumeFile) formData.append("resumeFile", resumeFile);

    const response = await fetch("http://localhost:5000/analyze", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();
    loading.style.display = "none";

    if (!data.success) throw new Error(data.error || "Analysis failed.");

    // 🧩 Debug logs
    console.log("🧩 Data received:", data);
    console.log("💪 Strengths:", data.strengths);
    console.log("⚙️ Weaknesses:", data.weaknesses);

    resultBox.style.display = "block";

    // Animate ATS score circle
    const score = Math.round(data.matchScore || 0);
    let current = 0;
    const animate = setInterval(() => {
      current++;
      atsCircle.style.setProperty("--pct", current);
      atsInner.textContent = current;
      if (current >= score) clearInterval(animate);
    }, 20);

    // Render everything
    renderList("strengths", data.strengths || "");
    renderList("weaknesses", data.weaknesses || "");
    renderCards("courses", data.courses || []);
    renderCards("projects", data.projects || []);
    renderCards("jobs", data.jobs || []);

    document.getElementById("motivation").textContent =
      data.motivation ||
      "Keep learning and pushing forward — your growth is just beginning!";
  } catch (err) {
    loading.style.display = "none";
    alert("❌ " + err.message);
  }
});

document.getElementById("clear").addEventListener("click", () => {
  ["jobDesc", "resume"].forEach((id) => (document.getElementById(id).value = ""));
  document.getElementById("resumeFile").value = "";
  document.getElementById("result").style.display = "none";
  document.getElementById("loading").style.display = "none";
});


// ✅ NEW ROBUST renderList FUNCTION (handles multiple formats cleanly)
function renderList(id, text) {
  const ul = document.getElementById(id);
  ul.innerHTML = "";

  if (!text || typeof text !== "string" || text.trim().length === 0) {
    ul.innerHTML = "<li class='empty'>Not found.</li>";
    return;
  }

  // Normalize text
  let cleaned = text
    .replace(/\r/g, "")
    .replace(/•/g, "\n-") // convert bullet dots to newlines
    .replace(/✅|⚙️|💪|👉/g, "") // remove emojis
    .replace(/\n{2,}/g, "\n"); // remove extra empty lines

  // Split by newline, or fallback by period or semicolon
  let lines = cleaned
    .split(/\n|\.|;/)
    .map((l) => l.trim().replace(/^[-\d\.\)]*\s*/, "")) // remove list numbering
    .filter((l) => l.length > 1 && !l.toLowerCase().includes("weaknesses") && !l.toLowerCase().includes("strengths"));

  if (lines.length === 0) {
    ul.innerHTML = `<li>${text}</li>`;
    return;
  }

  lines.forEach((line) => {
    const li = document.createElement("li");
    li.textContent = line;
    ul.appendChild(li);
  });
}


// ✅ Render recommended items (courses, projects, jobs)
function renderCards(id, items) {
  const container = document.getElementById(id);
  container.innerHTML = "";

  if (!items.length) {
    container.innerHTML = "<p class='empty'>No data available.</p>";
    return;
  }

  items.forEach((item) => {
    const div = document.createElement("div");
    div.className = "item";

    // ✅ If link exists → make the title itself clickable
    if (item.link) {
      const link = document.createElement("a");
      link.href = item.link;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = item.title || "Untitled";
      link.className = "link-title";
      div.appendChild(link);
    } else {
      const h4 = document.createElement("h4");
      h4.textContent = item.title || "Untitled";
      div.appendChild(h4);
    }

    container.appendChild(div);
  });
}

