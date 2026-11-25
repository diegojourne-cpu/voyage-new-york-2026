.PHONY: all check build pdf serve

all: check build pdf

check:
	python3 tools/check.py

build:
	python3 tools/build.py

pdf:
	node tools/render_pdf.mjs

serve:
	node tools/serve.mjs dist/site 8787
