# ======== Config ========
PYTHON       ?= python3
VENV_DIR     ?= .venv
ACTIVATE     := source $(VENV_DIR)/bin/activate
REQ_FILE     ?= requirements.txt

INPUT        ?= examples/input.adoc
OUTBASE      ?= course
OUTDIR       ?= ../output
ARTIFACT     ?= IG              # IG | handbook | EXMAN | SLIDE

ASSETS_DIR        ?= assets
ASSETS_IMG_DIR     = $(ASSETS_DIR)/images
ASSETS_STYLES_DIR  = $(ASSETS_DIR)/styles
ASSETS_FONTS_DIR   = $(ASSETS_DIR)/fonts
ASSETS_THEMES_DIR  = $(ASSETS_DIR)/themes

MAIN_ADOC    := $(OUTDIR)/z.main.adoc
PDF_FILE     ?= $(OUTDIR)/$(OUTBASE)_$(ARTIFACT).pdf
HTML_FILE    ?= $(OUTDIR)/$(OUTBASE)_$(ARTIFACT).html
SLIDES_FILE  ?= $(OUTDIR)/slides_$(ARTIFACT).html

# Logo (relative to :imagesdir: which our templates set to "images")
LOGO_NAME    ?= PIL_Logo_2023.png

# HTML stylesheet mode: 0=gem default, 1=no CSS, 2=use assets/styles/asciidoctor.css
NO_CSS ?= 2

# ======== External tools ========
ASCIIDOCTOR         ?= asciidoctor
ASCIIDOCTOR_PDF     ?= asciidoctor-pdf
ASCIIDOCTOR_REVEAL  ?= asciidoctor-revealjs

# ======== Phony targets ========
.PHONY: all venv reset-venv install generate assets pdf html slides build build-all clean deepclean doctor print-vars help show

all: build

# --- venv setup ---
venv:
	@echo "==> Creating venv at $(VENV_DIR) (if missing)"
	@test -d $(VENV_DIR) || $(PYTHON) -m venv $(VENV_DIR)

reset-venv:
	@echo "==> Resetting venv"
	@rm -rf $(VENV_DIR)
	@$(MAKE) venv
	@echo "==> Installing Python bootstrap (pip/setuptools/wheel)"
	@$(ACTIVATE) && python -m pip install -U 'pip<25' 'setuptools' 'wheel'

install: venv
	@echo "==> Installing Python deps"
	@$(ACTIVATE) && python -m pip install -r $(REQ_FILE)

# --- generate .adoc structure from outline ---
generate: install
	@echo "==> Generating course from $(INPUT) into $(OUTDIR) [artifact=$(ARTIFACT)]"
	@$(ACTIVATE) && $(PYTHON) generate_from_outline.py \
		--input $(INPUT) \
		--outdir $(OUTDIR) \
		--artifact-type $(ARTIFACT)

# --- bring shared assets into OUTDIR (OVERWRITE so branding/theme updates propagate) ---
assets:
	@mkdir -p "$(OUTDIR)/images" "$(OUTDIR)/styles" "$(OUTDIR)/fonts" "$(OUTDIR)/themes" "$(OUTDIR)/themes/resources/fonts"
	@if [ -d "$(ASSETS_IMG_DIR)" ]; then \
	  echo "==> Copying images (overwrite) from $(ASSETS_IMG_DIR) -> $(OUTDIR)/images"; \
	  cp -f $(ASSETS_IMG_DIR)/* "$(OUTDIR)/images/" 2>/dev/null || true; \
	fi
	@if [ -d "$(ASSETS_STYLES_DIR)" ]; then \
	  echo "==> Copying styles (overwrite) from $(ASSETS_STYLES_DIR) -> $(OUTDIR)/styles"; \
	  cp -f $(ASSETS_STYLES_DIR)/* "$(OUTDIR)/styles/" 2>/dev/null || true; \
	fi
	@if [ -d "$(ASSETS_FONTS_DIR)" ]; then \
	  echo "==> Copying fonts (overwrite) from $(ASSETS_FONTS_DIR) -> $(OUTDIR)/fonts"; \
	  cp -f $(ASSETS_FONTS_DIR)/* "$(OUTDIR)/fonts/" 2>/dev/null || true; \
	  echo "==> Mirroring fonts into themes/resources/fonts for theme-relative lookups"; \
	  cp -f $(ASSETS_FONTS_DIR)/* "$(OUTDIR)/themes/resources/fonts/" 2>/dev/null || true; \
	fi
	@if [ -d "$(ASSETS_THEMES_DIR)" ]; then \
	  echo "==> Copying PDF themes (overwrite) from $(ASSETS_THEMES_DIR) -> $(OUTDIR)/themes"; \
	  rsync -a --delete "$(ASSETS_THEMES_DIR)/" "$(OUTDIR)/themes/"; \
	fi

# --- PDF build ---
pdf: generate assets
	@echo "==> Building PDF -> $(PDF_FILE)"
	@logo_arg=""; \
	if [ -s "$(OUTDIR)/images/$(LOGO_NAME)" ]; then logo_arg="-a logo=$(LOGO_NAME)"; fi; \
	case "$(ARTIFACT)" in \
	  IG)       pdf_theme="ig-theme.yml" ;; \
	  handbook) pdf_theme="handbook-theme.yml" ;; \
	  EXMAN)    pdf_theme="exman-theme.yml" ;; \
	  SLIDE)    pdf_theme="slide-theme.yml" ;; \
	  *)        pdf_theme="ig-theme.yml" ;; \
	esac; \
	theme_file="$(OUTDIR)/themes/$$pdf_theme"; \
	fonts_dirs="$(OUTDIR)/fonts,$(OUTDIR)/themes,$(OUTDIR)/themes/resources/fonts"; \
	if [ -s "$$theme_file" ]; then \
	  echo "   using theme: $$theme_file"; \
	  echo "   fonts_dirs: $$fonts_dirs"; \
	  $(ASCIIDOCTOR_PDF) -a artifact-type=$(ARTIFACT) $$logo_arg \
	    -a pdf-theme="$$theme_file" -a pdf-fontsdir="$$fonts_dirs" \
	    $(MAIN_ADOC) -o $(PDF_FILE); \
	else \
	  echo "   (pdf theme $$theme_file not found; using default)"; \
	  $(ASCIIDOCTOR_PDF) -a artifact-type=$(ARTIFACT) $$logo_arg \
	    -a pdf-fontsdir="$$fonts_dirs" \
	    $(MAIN_ADOC) -o $(PDF_FILE); \
	fi

# --- HTML build ---
html: generate assets
	@echo "==> Building HTML -> $(HTML_FILE)"
	@logo_arg=""; \
	if [ -s "$(OUTDIR)/images/$(LOGO_NAME)" ]; then logo_arg="-a logo=$(LOGO_NAME)"; fi; \
	if [ "$(NO_CSS)" = "1" ]; then \
	  $(ASCIIDOCTOR) -a artifact-type=$(ARTIFACT) $$logo_arg -a stylesheet! $(MAIN_ADOC) -o $(HTML_FILE); \
	elif [ "$(NO_CSS)" = "2" ]; then \
	  css="$(OUTDIR)/styles/asciidoctor.css"; \
	  if [ -s "$$css" ]; then \
	    $(ASCIIDOCTOR) -a artifact-type=$(ARTIFACT) $$logo_arg \
	      -a stylesheet=$$(basename $$css) -a stylesdir=$(OUTDIR)/styles \
	      $(MAIN_ADOC) -o $(HTML_FILE); \
	  else \
	    echo "   (custom CSS not found; falling back to no CSS)"; \
	    $(ASCIIDOCTOR) -a artifact-type=$(ARTIFACT) $$logo_arg -a stylesheet! $(MAIN_ADOC) -o $(HTML_FILE); \
	  fi; \
	else \
	  $(ASCIIDOCTOR) -a artifact-type=$(ARTIFACT) $$logo_arg $(MAIN_ADOC) -o $(HTML_FILE); \
	fi

# --- Slides (reveal.js) ---
slides: generate assets
	@echo "==> Building Slides (reveal.js) -> $(SLIDES_FILE)"
	@logo_arg=""; \
	if [ -s "$(OUTDIR)/images/$(LOGO_NAME)" ]; then logo_arg="-a logo=$(LOGO_NAME)"; fi; \
	$(ASCIIDOCTOR_REVEAL) -a artifact-type=$(ARTIFACT) $$logo_arg $(MAIN_ADOC) -o $(SLIDES_FILE)

# --- convenience combos ---
build: pdf html show

build-all:
	@$(MAKE) pdf  ARTIFACT=IG
	@$(MAKE) html ARTIFACT=IG
	@$(MAKE) pdf  ARTIFACT=handbook
	@$(MAKE) html ARTIFACT=handbook
	@$(MAKE) pdf  ARTIFACT=EXMAN
	@$(MAKE) html ARTIFACT=EXMAN
	@$(MAKE) slides ARTIFACT=SLIDE

# --- housekeeping ---
clean:
	@echo "==> Cleaning generated course at $(OUTDIR)"
	@rm -rf "$(OUTDIR)"/*

deepclean: clean
	@echo "==> Removing venv"
	@rm -rf "$(VENV_DIR)"

doctor:
	@echo "==> Checking toolchain"
	@which $(PYTHON) || (echo "Missing python3"; exit 1)
	@which $(ASCIIDOCTOR) || (echo "Missing asciidoctor (brew install asciidoctor)"; exit 1)
	@which $(ASCIIDOCTOR_PDF) || (echo "Missing asciidoctor-pdf (gem install asciidoctor-pdf rouge)"; exit 1)
	@echo "OK"

print-vars:
	@echo INPUT=$(INPUT)
	@echo OUTDIR=$(OUTDIR)
	@echo ASSETS_IMG_DIR=$(ASSETS_IMG_DIR)
	@echo ASSETS_STYLES_DIR=$(ASSETS_STYLES_DIR)
	@echo ASSETS_FONTS_DIR=$(ASSETS_FONTS_DIR)
	@echo ASSETS_THEMES_DIR=$(ASSETS_THEMES_DIR)
	@echo LOGO_NAME=$(LOGO_NAME)
	@echo NO_CSS=$(NO_CSS)
	@echo ARTIFACT=$(ARTIFACT)
	@echo MAIN_ADOC=$(MAIN_ADOC)
	@echo PDF_FILE=$(PDF_FILE)
	@echo HTML_FILE=$(HTML_FILE)
	@echo SLIDES_FILE=$(SLIDES_FILE)

help:
	@echo "Usage:"
	@echo "  make build INPUT=examples/input.adoc OUTDIR=../output ARTIFACT=IG|handbook|EXMAN NO_CSS=2"
	@echo "  make build-all"
	@echo "  make reset-venv | make doctor | make clean | make deepclean | make print-vars"

show:
	@echo "==> OUTDIR:    $(OUTDIR)"
	@echo "==> MAIN_ADOC: $(MAIN_ADOC)"
	@echo "==> PDF:       $(PDF_FILE)"
	@echo "==> HTML:      $(HTML_FILE)"
	@echo "==> SLIDES:    $(SLIDES_FILE)"
