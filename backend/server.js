import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import dotenv from "dotenv";
import axios from "axios";
import mammoth from "mammoth";
import pdfParse from "pdf-parse-fixed";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());
const upload = multer({ dest: "uploads/" });

const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || "mistralai/mixtral-8x7b-instruct";
const SERPAPI_KEY = process.env.SERPAPI_KEY;

const PREFERRED_DOMAINS = [
  "coursera.org",
  "edx.org",
  "udemy.com",
  "linkedin.com",
  "pluralsight.com",
  "classcentral.org",
  "alison.com",
  "futurelearn.com",
];

// 🔍 Find course URLs using SerpAPI
async function findCourseUrl(query) {
  if (!SERPAPI_KEY) return null;
  try {
    const params = new URLSearchParams({
      engine: "google",
      q: query,
      api_key: SERPAPI_KEY,
      num: "8",
    });
    const url = `https://serpapi.com/search.json?${params.toString()}`;
    const resp = await axios.get(url, { timeout: 10000 });
    const results = resp.data.organic_results || resp.data.organic || [];
    for (const r of results) {
      if (!r.link) continue;
      for (const d of PREFERRED_DOMAINS) {
        if (r.link.includes(d)) return r.link;
      }
    }
    for (const r of results) if (r.link) return r.link;
    return null;
  } catch (e) {
    console.warn("SerpAPI error:", e?.message || e);
    return null;
  }
}

// 🧠 Extract both Courses and Projects sections from AI text
function extractSections(text) {
  const courseMatch = text.match(
    /(Recommended Courses[:\s]*)([\s\S]*?)(?=(Recommended Projects|Relevant Projects|Motivational Note|$))/i
  );
  const projectMatch = text.match(
    /(Recommended Projects|Relevant Projects)[:\s]*([\s\S]*?)(?=(Motivational Note|$))/i
  );

  const before = text.slice(0, courseMatch?.index || 0);
  const coursesBlock = courseMatch ? courseMatch[2].trim() : "";
  const projectsBlock = projectMatch ? projectMatch[2].trim() : "";
  const after =
    text.slice(
      projectMatch
        ? projectMatch.index + projectMatch[0].length + (projectMatch[2]?.length || 0)
        : text.length
    ) || "";

  const cleanLine = (l) =>
    l
      .trim()
      .replace(/^[\d\-\.\)]*\s*/, "")
      .trim();

  const isMeaningful = (l) =>
    l.length > 2 && !/^(?:\d+\.?|[-–—•]+)$/.test(l);

  const courseLines = coursesBlock
    ? coursesBlock.split("\n").map(cleanLine).filter(isMeaningful)
    : [];

  const projectLines = projectsBlock
    ? projectsBlock.split("\n").map(cleanLine).filter(isMeaningful)
    : [];

  return { before, courseLines, projectLines, after };
}

// 🔎 Build clickable job links card
function buildJobsCard(keywords = [], location = "") {
  if (!keywords || keywords.length === 0) return "";
  const combined = encodeURIComponent(keywords.join(" "));
  const locParam = encodeURIComponent(location || "");
  const lines = [];

  const indeed = `https://www.indeed.com/jobs?q=${combined}${locParam ? `&l=${locParam}` : ""}`;
  const linkedin = `https://www.linkedin.com/jobs/search?keywords=${combined}${locParam ? `&location=${locParam}` : ""}`;
  const google = `https://www.google.com/search?q=${combined}+jobs${locParam ? `+${locParam}` : ""}`;

  lines.push(`<li><a href="${indeed}" target="_blank" rel="noopener noreferrer">View jobs matching "${escapeHtml(keywords.join(" "))}" on Indeed</a></li>`);
  lines.push(`<li><a href="${linkedin}" target="_blank" rel="noopener noreferrer">View jobs matching "${escapeHtml(keywords.join(" "))}" on LinkedIn</a></li>`);
  lines.push(`<li><a href="${google}" target="_blank" rel="noopener noreferrer">Search similar jobs on Google</a></li>`);

  const kw = keywords.slice(0, 5);
  kw.forEach((k) => {
    const q = encodeURIComponent(k);
    lines.push(
      `<li style="font-size:0.95em"><a href="https://www.indeed.com/jobs?q=${q}${locParam ? `&l=${locParam}` : ""}" target="_blank" rel="noopener noreferrer">Indeed: ${escapeHtml(k)} jobs</a> · <a href="https://www.linkedin.com/jobs/search?keywords=${q}${locParam ? `&location=${locParam}` : ""}" target="_blank" rel="noopener noreferrer">LinkedIn</a></li>`
    );
  });

  return `
    <div class="job-card">
      <h3>🔎 Recommended Job Searches</h3>
      <ol class="job-list">${lines.join("\n")}</ol>
    </div>
  `;
}

// 🧠 Simple keyword extractor
function extractKeywordsFromText(text, maxKeywords = 5) {
  if (!text) return [];
  const stopwords = new Set([
    "the","and","for","with","that","this","your","you","from","are","have","has",
    "will","can","skills","experience","years","year","work","project","projects",
    "education","resume","profile","html","css","javascript"
  ]);
  const words = text
    .replace(/[^a-zA-Z0-9\s\-]/g, " ")
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopwords.has(w));
  const freq = {};
  words.forEach((w) => (freq[w] = (freq[w] || 0) + 1));
  return Object.keys(freq).sort((a, b) => freq[b] - freq[a]).slice(0, maxKeywords);
}

// 💡 Build clickable course HTML card
function buildCoursesCard(courses) {
  if (!courses || courses.length === 0) return "";
  const itemsHtml = courses
    .map((c) => {
      if (c.url) {
        return `<li><a href="${c.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(
          c.title
        )}</a>${
          c.provider
            ? ` — <span style="opacity:0.85">${escapeHtml(c.provider)}</span>`
            : ""
        }</li>`;
      } else {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(
          c.title + (c.provider ? " " + c.provider : "")
        )}`;
        return `<li><a href="${searchUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(
          c.title
        )}</a>${
          c.provider
            ? ` — <span style="opacity:0.85">${escapeHtml(c.provider)}</span>`
            : ""
        } <small style="opacity:0.6">(unverified)</small></li>`;
      }
    })
    .join("\n");

  return `
    <div class="course-card">
      <h3>🎓 Recommended Courses</h3>
      <ol class="course-list">${itemsHtml}</ol>
    </div>
  `;
}

// 💡 Build project ideas card
function buildProjectsCard(projects) {
  if (!projects || projects.length === 0) return "";
  const itemsHtml = projects.map((p) => `<li>${escapeHtml(p)}</li>`).join("\n");
  return `
    <div class="project-card">
      <h3>🧠 Recommended Projects</h3>
      <ol class="project-list">${itemsHtml}</ol>
    </div>
  `;
}

// ✨ Escape HTML
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 🚀 Main endpoint
app.post("/analyze", upload.single("resume"), async (req, res) => {
  try {
    let resumeContent = "";
    let jobDescription = "";
    const userName = req.body.userName || "your friend";

    // 🧾 Handle uploaded resume
    if (req.file) {
      const filePath = req.file.path;
      const ext = req.file.originalname.split(".").pop().toLowerCase();
      if (ext === "pdf") {
        const dataBuffer = fs.readFileSync(filePath);
        const pdfData = await pdfParse(dataBuffer);
        resumeContent = pdfData.text;
      } else if (ext === "docx") {
        const dataBuffer = fs.readFileSync(filePath);
        const docxData = await mammoth.extractRawText({ buffer: dataBuffer });
        resumeContent = docxData.value;
      } else if (ext === "txt") {
        resumeContent = fs.readFileSync(filePath, "utf8");
      } else {
        fs.unlinkSync(filePath);
        return res.status(400).json({ error: "Unsupported file type" });
      }
      fs.unlinkSync(filePath);
      jobDescription = req.body.jobDescription || "";
    } else {
      resumeContent = req.body.resume_text || "";
      jobDescription = req.body.jobDescription || "";
    }

    if (!resumeContent || !jobDescription) {
      return res
        .status(400)
        .json({ error: "Missing resume or job description." });
    }

    // 🧠 Prompt
    const prompt = `
You are "CareerPath AI" — a friendly, encouraging career mentor and AI coach.
Your goal is to help ${userName} grow, improve, and feel motivated.

Speak directly to ${userName} using “you” and “your”.
Your tone should be warm, positive, supportive, and conversational — like a good friend giving career feedback.

Compare the following resume and job description carefully, and respond in this exact structure:

1. ATS Score: (0–100%) — **Begin your response with a single line in the exact format**:
   ATS Score: XX/100

2. Strengths:
   - Highlight 3–5 real strengths or achievements.

3. Weak/Missing Areas:
   - List 2–4 key areas to improve.

4. Recommended Courses:
   - Suggest 4–6 course titles with providers.

5. Recommended Projects:
   - Suggest 3–4 practical project ideas.

6. Motivational Note:
   - End with 2–3 sentences of positive encouragement.
`;

    // 🧩 Call OpenRouter API
    const aiResponse = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: "user",
            content: `${prompt}\n\nJob Description:\n${jobDescription}\n\nResume:\n${resumeContent}`,
          },
        ],
        temperature: 0.9,
        max_tokens: 1600,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    let aiText =
      aiResponse.data.choices?.[0]?.message?.content?.trim() ||
      "No response from AI.";

    // 🧠 Extract sections
    const { before, courseLines, projectLines, after } = extractSections(aiText);

    // Parse courses
    const parsedCourses = [];
    for (const line of courseLines) {
      const cleaned = line.replace(/^\s*[\d\-\.\)]\s*/, "").trim();
      let title = cleaned;
      let provider = "";
      const m1 = cleaned.match(/^(.*?)[\-\–—]\s*(.+)$/);
      const m2 = cleaned.match(/^(.*)\(([^)]+)\)$/);
      const m3 = cleaned.match(/^(.*),\s*([^,]+)$/);
      if (m1) {
        title = m1[1].trim();
        provider = m1[2].trim();
      } else if (m2) {
        title = m2[1].trim();
        provider = m2[2].trim();
      } else if (m3) {
        title = m3[1].trim();
        provider = m3[2].trim();
      }
      const providerGuess =
        provider ||
        (
          cleaned.match(
            /\b(Coursera|Udemy|edX|LinkedIn|Pluralsight|IBM|Google|AWS)\b/i
          ) || [null, null]
        )[1] ||
        "";
      parsedCourses.push({ title, provider: providerGuess });
    }

    // 🔗 Find URLs for courses
    const verified = [];
    await Promise.all(
      parsedCourses.map(async (c) => {
        const q = c.title + (c.provider ? " " + c.provider : "");
        const foundUrl = await findCourseUrl(q);
        verified.push({ title: c.title, provider: c.provider || "", url: foundUrl });
      })
    );

    // ✅ Final HTML builder (updated)
    const coursesCardHtml = buildCoursesCard(verified);
    const jobsKeywords = extractKeywordsFromText(resumeContent || before || "");
    const jobsCardHtml = buildJobsCard(jobsKeywords, req.body.location || "");
    const projectsCardHtml = buildProjectsCard(projectLines);
    const beforePart = escapeHtml(before);
    const afterPart = escapeHtml(after);

    const finalHtml = `${beforePart}${coursesCardHtml}${jobsCardHtml}${projectsCardHtml}${afterPart}`.replace(
      /\n/g,
      "<br>"
    );

    res.json({
      success: true,
      resultHtml: finalHtml,
      raw: aiText,
      courses: verified,
      projects: projectLines,
      job_keywords: jobsKeywords,
    });
  } catch (err) {
    console.error("❌ Backend error:", err.response?.data || err.message || err);
    res
      .status(500)
      .json({ success: false, error: "AI analysis failed. Try again later." });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`✅ Server running on http://localhost:${PORT}`)
);
