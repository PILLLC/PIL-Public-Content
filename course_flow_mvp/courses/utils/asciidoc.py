from pathlib import Path
from slugify import slugify
from ..models import Course

# Persist exports on host (we’ll mount ./exports -> /app/exports)
EXPORT_DIR = Path("/app/exports/courses")
EXPORT_DIR.mkdir(parents=True, exist_ok=True)

def course_to_adoc_text(course: Course) -> str:
    lines = []
    lines.append(f"= {course.title}")
    lines.append(":toc:")
    lines.append("")
    if course.objective:
        lines.append("== Objective")
        lines.append(course.objective)
        lines.append("")
    if course.description:
        lines.append("== Description")
        lines.append(course.description)
        lines.append("")
    for m in course.modules.all().order_by("order"):
        lines.append(f"== {m.title}")
        if m.description:
            lines.append(m.description)
            lines.append("")
        for l in m.lessons.all().order_by("order"):
            lines.append(f"=== {l.title}")
            if l.content:
                lines.append(l.content)
            lines.append("")
    return "\n".join(lines).strip() + "\n"

def write_course_adoc(course: Course) -> Path:
    fname = f"{slugify(course.title) or 'course'}-{course.pk}.adoc"
    path = EXPORT_DIR / fname
    path.write_text(course_to_adoc_text(course), encoding="utf-8")
    return path
