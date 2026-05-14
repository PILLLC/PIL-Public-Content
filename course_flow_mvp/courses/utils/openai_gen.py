# courses/utils/openai_gen.py
from __future__ import annotations

import json, time
from typing import Any, Dict
from django.conf import settings
from django.db import transaction
from openai import OpenAI, APIError, RateLimitError, AuthenticationError, BadRequestError

SYSTEM = (
    "You are a course designer. Return STRICT JSON with this schema:\n"
    "{"
    '  \"title\": str,'
    '  \"objective\": str,'
    '  \"description\": str,'
    '  \"modules\": ['
    '    {\"title\": str, \"description\": str, \"lessons\": [ {\"title\": str, \"content\": str} ]}'
    "  ]"
    "}\n"
    "Keep 3–6 lessons per module. No prose around the JSON."
)

MODEL = getattr(settings, "OPENAI_MODEL", "gpt-4o-mini")
MAX_MODULES = int(getattr(settings, "OPENAI_MAX_MODULES", 6))
MAX_LESSONS = int(getattr(settings, "OPENAI_MAX_LESSONS", 6))
TIMEOUT = int(getattr(settings, "OPENAI_TIMEOUT", 30))

def _call_openai(prompt: str) -> Dict[str, Any]:
    if not getattr(settings, "OPENAI_API_KEY", ""):
        raise RuntimeError("OPENAI_API_KEY is not set")

    client = OpenAI(api_key=settings.OPENAI_API_KEY)

    backoff = 1.0
    for attempt in range(5):
        try:
            resp = client.chat.completions.create(
                model=MODEL,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": SYSTEM},
                    {"role": "user", "content": prompt.strip()},
                ],
                temperature=0.4,
                timeout=TIMEOUT,
            )
            content = resp.choices[0].message.content or "{}"
            return json.loads(content)

        except (RateLimitError, APIError) as e:
            if attempt == 4:
                raise
            time.sleep(backoff)
            backoff *= 2

        except (AuthenticationError, BadRequestError):
            # These won't succeed on retry (bad key, bad request)
            raise

        except json.JSONDecodeError as e:
            if attempt == 4:
                raise ValueError("OpenAI returned invalid JSON") from e
            time.sleep(backoff)
            backoff *= 2

@transaction.atomic
def generate_course_from_prompt(prompt: str, user):
    from ..models import Course, Module, Lesson  # local import avoids circulars during migrations
    data = _call_openai(prompt)

    course = Course.objects.create(
        title=str(data.get("title") or "Untitled Course")[:200],
        objective=str(data.get("objective") or ""),
        description=str(data.get("description") or ""),
        created_by=user,
    )

    modules = (data.get("modules") or [])[:MAX_MODULES]
    for m_idx, m in enumerate(modules, start=1):
        mod = Module.objects.create(
            course=course,
            title=str(m.get("title") or f"Module {m_idx}")[:200],
            description=str(m.get("description") or ""),
            order=m_idx,
        )
        lessons = (m.get("lessons") or [])[:MAX_LESSONS]
        for l_idx, l in enumerate(lessons, start=1):
            Lesson.objects.create(
                module=mod,
                title=str(l.get("title") or f"Lesson {l_idx}")[:200],
                content=str(l.get("content") or ""),
                order=l_idx,
            )
    return course
