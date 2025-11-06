import json, os
from pathlib import Path

BASE = Path(__file__).parent
JOB_SKILLS = json.load(open(BASE / "job_skills.json"))

# synonyms map — expand as needed
SYNONYMS = {
    "tensorflow": ["tf", "tensorflow"],
    "pytorch": ["pytorch", "torch"],
    "mlops": ["mlops", "mlo ps"]
}

def normalize_skill(s: str) -> str:
    return s.strip().lower()

def role_skills(role: str):
    return [normalize_skill(s) for s in JOB_SKILLS.get(role.lower(), [])]
