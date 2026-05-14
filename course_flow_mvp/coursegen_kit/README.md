# CourseGen Kit (AsciiDoc)

This toolkit converts a single AsciiDoc outline into a full multi-file course project
(z.main.adoc, z.content.adoc, module-XX.adoc), with IG/Handbook/Slides conditionals baked in.

## Usage

```bash
python generate_from_outline.py --input examples/software_dev_pm_outline.adoc --outdir /path/to/output --artifact-type IG
```

- `--artifact-type` can be `IG`, `handbook`, `SLIDE`, or `EXMAN` (affects conditional blocks).
- The generator will produce:
  - `z.main.adoc`
  - `z.content.adoc`
  - `module-01.adoc`, `module-02.adoc`, ...

Then build with Asciidoctor (example):

```bash
asciidoctor-pdf -a artifact-type=IG z.content.adoc
asciidoctor-pdf -a artifact-type=handbook z.content.adoc
asciidoctor-revealjs -a artifact-type=SLIDE z.content.adoc
```
