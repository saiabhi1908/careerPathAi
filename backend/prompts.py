# Prompt templates used when calling OpenAI
SKILL_EXTRACTION_PROMPT = """
You are a helpful assistant. Extract a JSON array of short skill names from the resume text below.
Return only valid JSON (an array of strings).
Resume:
---
{resume_text}
---
"""

GAP_ANALYSIS_PROMPT = """
You are an expert career coach. Given a list of skills extracted from the resume:
{resume_skills}
and a list of required skills for a role:
{role_skills}
Return only JSON with keys:
- score: integer 0-100 = percent matched
- have: array of skills the candidate clearly has
- weak: array of skills partially present / needs improvement
- missing: array of skills not present
- recommendations: array of objects { skill, course } (3 items max)
Example:
{{ "score": 70, "have": ["python","sql"], "weak": ["data visualization"], "missing": ["deep learning"], "recommendations":[{{"skill":"deep learning","course":"Intro to Deep Learning - Coursera"}}] }}
"""
