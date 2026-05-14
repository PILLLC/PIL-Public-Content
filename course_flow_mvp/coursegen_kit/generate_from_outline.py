import re
import argparse
from pathlib import Path
from jinja2 import Environment, FileSystemLoader, select_autoescape
from dataclasses import dataclass, field
from typing import List

@dataclass
class Topic:
    title: str
    content: str = ""
    instructor_note: str = ""
    activity: str = ""
    bullets: List[str] = field(default_factory=list)

@dataclass
class Lesson:
    title: str
    summary: str = ""
    instructor_note: str = ""
    activity: str = ""
    bullets: List[str] = field(default_factory=list)
    topics: List[Topic] = field(default_factory=list)

@dataclass
class Module:
    title: str
    objectives: List[str] = field(default_factory=list)
    lessons: List[Lesson] = field(default_factory=list)

@dataclass
class Course:
    title: str

def sentence_bullets(text: str, max_items: int = 3) -> List[str]:
    # Convert a paragraph to up to N concise bullets
    if not text:
        return []
    # Split on periods while keeping main clauses
    parts = [p.strip() for p in re.split(r'[.;]\s+', text) if p.strip()]
    bullets = []
    for p in parts:
        # Trim length for slides
        bullets.append(p[:140])
        if len(bullets) >= max_items:
            break
    return bullets

def objectiveize(headings: List[str], fallback: str = "") -> List[str]:
    # Turn lesson headings into objective-styled bullets
    objs = []
    for h in headings[:3]:
        h_clean = h.strip().rstrip(".")
        if h_clean.lower().startswith(("introduction to", "intro to", "introduction")):
            objs.append(f"Explain {h_clean}")
        elif h_clean.lower().startswith(("understanding", "overview")):
            objs.append(f"Describe {h_clean}")
        elif h_clean.lower().startswith(("creating", "defining", "estimation", "managing", "monitoring")):
            objs.append(f"Apply {h_clean}")
        else:
            objs.append(f"Understand {h_clean}")
    if not objs and fallback:
        objs = sentence_bullets(fallback, max_items=3)
    return objs or ["Identify key concepts.", "Apply core techniques.", "Evaluate outcomes."]

def parse_outline(text: str):
    # Extract course title (first line starting with '= ')
    lines = text.splitlines()
    title = None
    i = 0
    while i < len(lines):
        if lines[i].startswith("="):
            title = lines[i].lstrip("= ").strip()
            i += 1
            break
        i += 1
    if not title:
        raise ValueError("Outline must start with a '= Course Title' line.")

    # Parse sections: == (modules), === (lessons), ==== (topics)
    modules = []
    current_module = None
    current_lesson = None
    current_topic = None

    def commit_topic():
        nonlocal current_topic, current_lesson
        if current_topic:
            # Strip trailing whitespace
            current_topic.content = current_topic.content.strip()
            current_lesson.topics.append(current_topic)
            current_topic = None

    def commit_lesson():
        nonlocal current_lesson, current_module, current_topic
        if current_lesson:
            commit_topic()
            current_lesson.summary = current_lesson.summary.strip()
            # Generate default slide bullets from summary if none
            if not current_lesson.bullets:
                current_lesson.bullets = sentence_bullets(current_lesson.summary, 4)
            current_module.lessons.append(current_lesson)
            current_lesson = None

    def commit_module():
        nonlocal current_module, modules, current_lesson
        if current_module:
            commit_lesson()
            # Derive default objectives from lesson titles if not provided
            if not current_module.objectives:
                lesson_headings = [l.title for l in current_module.lessons]
                first_para = current_module.lessons[0].summary if current_module.lessons else ""
                current_module.objectives = objectiveize(lesson_headings, first_para)
            modules.append(current_module)
            current_module = None

    # Combine lines back for scanning from i
    while i < len(lines):
        line = lines[i]

        if re.match(r"^==\s", line):
            # New module
            commit_module()
            title_mod = line[3:].strip()
            current_module = Module(title=title_mod)
            current_lesson = None
            current_topic = None
        elif re.match(r"^===\s", line):
            # New lesson
            commit_lesson()
            title_les = line[4:].strip()
            current_lesson = Lesson(title=title_les, summary="")
            current_topic = None
        elif re.match(r"^====\s", line):
            # New topic
            commit_topic()
            title_top = line[5:].strip()
            current_topic = Topic(title=title_top, content="")
        else:
            # Accumulate text into the most specific node
            if current_topic is not None:
                current_topic.content += (line + "\n")
            elif current_lesson is not None:
                # First non-empty line becomes summary (collect all)
                current_lesson.summary += (line + "\n")
            elif current_module is not None:
                # Treat stray text under module as a first lesson called "Overview"
                if not current_module.lessons:
                    current_lesson = Lesson(title="Overview", summary=(line + "\n"))
                else:
                    # Append to last lesson summary
                    current_module.lessons[-1].summary += (line + "\n")
            # else ignore (before first module)
        i += 1

    # Commit any trailing structures
    commit_module()

    # Combine "Objective" + "Description" into a Course Overview module if present
    def maybe_merge_overview(mods):
        if len(mods) >= 2 and mods[0].title.lower() == "objective" and mods[1].title.lower() == "description":
            overview = Module(title="Course Overview")
            # Lesson 1: Objective
            obj_text = mods[0].lessons[0].summary.strip() if mods[0].lessons else ""
            overview.lessons.append(Lesson(
                title="Objective",
                summary=obj_text,
                bullets=sentence_bullets(obj_text, 3),
                instructor_note="Connect objectives to expected outcomes."
            ))
            # Lesson 2: Description
            desc_text = mods[1].lessons[0].summary.strip() if mods[1].lessons else ""
            overview.lessons.append(Lesson(
                title="Description",
                summary=desc_text,
                bullets=sentence_bullets(desc_text, 3),
                instructor_note="Set expectations for scope and depth."
            ))
            # Objectives for the overview module
            overview.objectives = objectiveize(
                [l.title for l in overview.lessons],
                fallback=obj_text or desc_text
            )
            return [overview] + mods[2:]
        return mods

    modules = maybe_merge_overview(modules)

    return Course(title=title), modules

def render_course(course, modules, outdir: Path, templates_dir: Path, artifact_type: str = "IG"):
    outdir.mkdir(parents=True, exist_ok=True)
    env = Environment(
        loader=FileSystemLoader(str(templates_dir)),
        autoescape=select_autoescape(enabled_extensions=("j2",))
    )
    # z.main.adoc
    zmain_t = env.get_template("z.main.adoc.j2")
    (outdir / "z.main.adoc").write_text(zmain_t.render(course=course, artifact_type=artifact_type), encoding="utf-8")

    # modules files
    mod_t = env.get_template("module.adoc.j2")
    for idx, module in enumerate(modules, start=1):
        content = mod_t.render(module=module, logo="PIL_Logo_2023.png")
        (outdir / f"module-{idx:02d}.adoc").write_text(content, encoding="utf-8")

    # z.content.adoc
    zc_t = env.get_template("z.content.adoc.j2")
    (outdir / "z.content.adoc").write_text(zc_t.render(modules=modules), encoding="utf-8")

def main():
    ap = argparse.ArgumentParser(description="Generate a multi-file AsciiDoc course from a single outline.")
    ap.add_argument("--input", required=True, help="Path to input AsciiDoc outline")
    ap.add_argument("--outdir", required=True, help="Output directory for generated course")
    ap.add_argument("--templates", default=None, help="Templates directory (defaults to templates/adoc next to script)")
    ap.add_argument("--artifact-type", default="IG", help="IG | handbook | SLIDE | EXMAN")
    args = ap.parse_args()

    input_path = Path(args.input)
    outdir = Path(args.outdir)
    if args.templates:
        templates_dir = Path(args.templates)
    else:
        templates_dir = Path(__file__).resolve().parent / "templates" / "adoc"

    text = input_path.read_text(encoding="utf-8")
    course, modules = parse_outline(text)
    render_course(course, modules, outdir, templates_dir, artifact_type=args.artifact_type)

if __name__ == "__main__":
    main()
