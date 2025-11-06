from fastapi import FastAPI, Request
from pydantic import BaseModel
import uvicorn, os, json
from dotenv import load_dotenv
from prompts import SKILL_EXTRACTION_PROMPT, GAP_ANALYSIS_PROMPT
from utils import role_skills, normalize_skill
import openai

load_dotenv()
OPENAI_KEY = os.getenv("OPENAI_API_KEY")
if OPENAI_KEY:
    openai.api_key = OPENAI_KEY

app = FastAPI()

class AnalyzeReq(BaseModel):
    resume_text: str
    target_role: str

def llm_extract_skills(resume_text: str):
    if not OPENAI_KEY:
        # fallback: simple keyword scan using job_skills.json
        # naive extract: return words that look like technology names (very simple)
        words = set([w.lower().strip('.,()') for w in resume_text.split()])
        return [w for w in words if len(w)>1 and w.isalpha()][:40]
    prompt = SKILL_EXTRACTION_PROMPT.format(resume_text=resume_text)
    resp = openai.ChatCompletion.create(
        model="gpt-4o-mini", # or "gpt-4o" / "gpt-4" depending on availability/cost
        messages=[{"role":"user","content":prompt}],
        temperature=0.0,
        max_tokens=400
    )
    txt = resp.choices[0].message.content
    # Attempt to parse JSON
    import json
    try:
        skills = json.loads(txt)
        if isinstance(skills, list):
            return [normalize_skill(s) for s in skills if isinstance(s,str)]
    except Exception:
        # last resort: simple cleanup
        return [normalize_skill(s) for s in txt.replace('\n',',').split(',') if s.strip()][:40]
    return []

def llm_gap_analysis(resume_skills, role_skill_list):
    if not OPENAI_KEY:
        # fallback naive comparison
        have = [s for s in resume_skills if s in role_skill_list]
        missing = [s for s in role_skill_list if s not in resume_skills]
        weak = []
        score = int(100 * len(have) / max(1, len(role_skill_list)))
        recs = [{"skill": m, "course": f"Course for {m}"} for m in missing[:3]]
        return {"score": score, "have": have, "weak": weak, "missing": missing, "recommendations": recs}
    prompt = GAP_ANALYSIS_PROMPT.format(resume_skills=json.dumps(resume_skills),
                                        role_skills=json.dumps(role_skill_list))
    resp = openai.ChatCompletion.create(
        model="gpt-4o-mini",
        messages=[{"role":"user","content":prompt}],
        temperature=0.0,
        max_tokens=600
    )
    txt = resp.choices[0].message.content
    import json
    try:
        out = json.loads(txt)
        return out
    except Exception:
        # fallback safe output
        return {"score": 0, "have": [], "weak": [], "missing": role_skill_list, "recommendations": []}

@app.post("/analyze")
async def analyze(req: AnalyzeReq):
    resume_text = req.resume_text
    role = req.target_role.lower()
    try:
        # 1. extract resume skills
        resume_skills = llm_extract_skills(resume_text)
        # 2. load role skills
        rskills = role_skills(role)
        # 3. compare via LLM or simple logic
        gap = llm_gap_analysis(resume_skills, rskills)
        return gap
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
