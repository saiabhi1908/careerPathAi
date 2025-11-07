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

// 🔍 Course URL finder
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
  } catch {
    return null;
  }
}

// 🧩 Section extraction — robust for all GPT formatting styles
function extractSection(text, start, end) {
  if (!text || !start) return "";
  const startIdx = text.toLowerCase().indexOf(start.toLowerCase());
  if (startIdx === -1) return "";
  const endIdx = end
    ? text.toLowerCase().indexOf(end.toLowerCase(), startIdx + start.length)
    : -1;
  const section =
    endIdx !== -1
      ? text.slice(startIdx + start.length, endIdx)
      : text.slice(startIdx + start.length);
  return section
    .replace(/\*\*/g, "")
    .replace(/[-•✅⚙️⚠️]/g, "")
    .replace(/\r/g, "")
    .trim();
}

// ✅ /analyze endpoint
app.post("/analyze", upload.single("resumeFile"), async (req, res) => {
  try {
    let resumeContent = "";
    const jobDescription = req.body.jobDesc || "";
    const userName = req.body.userName || "your friend";

    // 🗂 Read resume file or text
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
        return res.status(400).json({ error: "Unsupported file type." });
      }
      fs.unlinkSync(filePath);
    } else {
      resumeContent = req.body.resumeText || "";
    }

    if (!resumeContent || !jobDescription) {
      return res
        .status(400)
        .json({ error: "Missing resume or job description." });
    }

    // 🧠 Updated AI prompt to ensure Weaknesses section always appears
    const prompt = `
You are "CareerPath AI" — a warm, expert career mentor.
Compare the provided resume and job description carefully, and respond **exactly in this structure** (include all headers even if empty):

ATS Score: XX/100

Strengths:
- 5–6 detailed strengths.

Weaknesses / Improvement Areas:
- 5–6 skill or experience gaps or areas to improve.

Recommended Courses:
- 6 course topics to fill gaps.

Recommended Projects:
- 6 project ideas aligned to the field.

Recommended Jobs:
- 6 realistic job titles.

Motivational Note:
A short, human-like encouragement paragraph for ${userName}.
`;

    // 🧩 Send request to OpenRouter
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
        max_tokens: 2000,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    // 🧾 Process AI response
    let aiText = "No AI response.";
    try {
      const content = aiResponse?.data?.choices?.[0]?.message?.content;
      aiText = content?.trim?.() || "No AI output found.";
    } catch (e) {
      console.error("AI response parsing failed:", e.message);
    }

    console.log("🧠 Raw AI Output:\n", aiText);

    // Extract all sections robustly
    const atsMatch = aiText.match(/ATS Score[:\s]*([0-9]{1,3})/i);
    const atsScore = atsMatch ? parseInt(atsMatch[1]) : 0;

    const strengths = extractSection(aiText, "Strengths:", "Weaknesses");
    const weaknesses = extractSection(
      aiText,
      "Weaknesses / Improvement Areas:",
      "Recommended Courses"
    );
    const coursesText = extractSection(
      aiText,
      "Recommended Courses:",
      "Recommended Projects"
    );
    const projectsText = extractSection(
      aiText,
      "Recommended Projects:",
      "Recommended Jobs"
    );
    const jobsText = extractSection(
      aiText,
      "Recommended Jobs:",
      "Motivational Note"
    );
    const motivation = extractSection(aiText, "Motivational Note:", "");

    // 💡 Safe fallback for weaknesses
    const safeWeaknesses =
      weaknesses && weaknesses.trim().length > 2
        ? weaknesses
        : "No clear weaknesses detected — consider deepening skills in advanced tools, team collaboration, and emerging technologies.";

    // 🔹 Helper to turn text into list items
    function toListItems(text) {
      if (!text) return [];
      return text
        .split(/\n|\.|;/)
        .map((t) => t.trim().replace(/^[-•\d\.\)]*\s*/, ""))
        .filter((t) => t.length > 1)
        .slice(0, 6);
    }

    const courseLines = toListItems(coursesText);
    const projectLines = toListItems(projectsText);
    const jobLines = toListItems(jobsText);

    // 🌐 Fetch verified course URLs
    const verifiedCourses = [];
    await Promise.all(
      courseLines.map(async (title) => {
        const foundUrl = await findCourseUrl(title);
        verifiedCourses.push({ title, link: foundUrl });
      })
    );

    const projects = projectLines.map((p) => ({ title: p }));
    const jobs = jobLines.map((j) => ({
      title: j,
      link: `https://www.google.com/search?q=${encodeURIComponent(j)}+jobs`,
    }));

    // 🧩 Debug logs
    console.log("\n💪 Strengths:\n", strengths);
    console.log("\n⚙️ Weaknesses:\n", weaknesses);
    console.log("\n📘 Courses:\n", courseLines);
    console.log("\n🧩 Projects:\n", projectLines);
    console.log("\n💼 Jobs:\n", jobLines);
    console.log("\n💬 Motivation:\n", motivation);

    res.json({
      success: true,
      matchScore: atsScore,
      strengths,
      weaknesses: safeWeaknesses,
      courses: verifiedCourses,
      projects,
      jobs,
      motivation,
    });
  } catch (err) {
    console.error("❌ Backend error:", err.response?.data || err.message);
    res
      .status(500)
      .json({ success: false, error: "AI analysis failed. Try again later." });
  }
});

// 🚀 Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`✅ Server running on http://localhost:${PORT}`)
);
