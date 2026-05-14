from pathlib import Path

def split_course(infile, outdir):
    text = Path(infile).read_text()
    course_title = text.splitlines()[0].lstrip("= ").strip()
    modules = text.split("\n== ")
    Path(outdir).mkdir(exist_ok=True)

    # write z.main.adoc
    (Path(outdir)/"z.main.adoc").write_text(f"= {course_title}\n:toc:\n\ninclude::z.content.adoc[]\n")

    # write modules
    content_lines = []
    for i, mod in enumerate(modules[1:], start=1):
        modfile = Path(outdir)/f"module-{i:02}.adoc"
        modtitle, *rest = mod.splitlines()
        modtext = "\n".join(rest)
        modfile.write_text(f"== Module {{module-number}}: {modtitle}\n\n{modtext}")
        content_lines.append(f":module-number: {i:02}\ninclude::module-{i:02}.adoc[]\n")

    (Path(outdir)/"z.content.adoc").write_text("\n".join(content_lines))
