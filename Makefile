.PHONY: all check build pdf

all: check build pdf

check:
	python3 tools/check.py

build:
	python3 tools/build.py

pdf:
	node tools/render_pdf.mjs
