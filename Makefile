# Workflow around the studio CLI.
#
# Positional project name: `make dry starship` or `make dry name=starship`.
# Extra goals are swallowed so Make does not try to build a file called starship.

.DEFAULT_GOAL := help

COMMANDS := help new script dry images prod redo takes pick render open
EXTRA_GOALS := $(filter-out $(COMMANDS),$(MAKECMDGOALS))

ifeq ($(origin name),command line)
project_name := $(name)
else
project_name := $(firstword $(EXTRA_GOALS))
endif

PROJECT := projects/$(project_name)/project.yaml
renderer ?= ffmpeg

.PHONY: help require-name require-shot new script dry images prod redo takes pick render open $(EXTRA_GOALS)

$(foreach extra,$(EXTRA_GOALS),$(if $(shell printf '%s' '$(extra)' | grep -Eq '^[A-Za-z0-9][A-Za-z0-9_-]{0,40}$$' && echo ok),$(eval $(extra):;@:),$(error Project name "$(extra)" must use letters, numbers, dashes, or underscores)))

help:
	@echo "ai-studio"
	@echo ""
	@echo "  make new <name>                         Scaffold projects/<name>/"
	@echo "  make script <name>                      Draft project.yaml from idea.md (needs claude)"
	@echo "  make dry <name>                         Validate, preview with placeholders, print paid calls"
	@echo "  make images <name>                      Generate stills only, then a contact sheet"
	@echo "  make prod <name>                        Generate video, voice, and sound, then render"
	@echo ""
	@echo "  make redo <name> shot=<id>              Redo that shot (image if no video yet, else video)"
	@echo "  make redo <name> shot=<id> stage=image  Force the image or video stage"
	@echo "  make takes <name>                       List takes"
	@echo "  make pick <name> shot=<id> take=<id>    Select a take (image-1, video-1, ...)"
	@echo "  make render <name>                      Re-render. No generation"
	@echo "  make open <name>                        Open projects/<name>/output.mp4"
	@echo ""
	@echo "name=<name> works in place of the positional name."
	@echo "images and prod ask before any paid call. They do not pass --yes."
	@echo "renderer=ffmpeg is the default here. renderer=remotion uses Chrome."

require-name:
	@if [ -z "$(project_name)" ]; then \
	  echo "Name the project: make <target> <name>   or   make <target> name=<name>"; \
	  exit 1; \
	fi

require-shot: require-name
	@if [ -z "$(shot)" ]; then \
	  echo "Name the shot: make redo $(project_name) shot=<id>"; \
	  exit 1; \
	fi

new: require-name
	npm run --silent studio -- new $(project_name)

script: require-name
	@if ! command -v claude >/dev/null 2>&1; then \
	  echo "Claude Code is optional and is not installed, so make script cannot draft project.yaml."; \
	  echo "Install it from https://docs.anthropic.com/en/docs/claude-code then run make script $(project_name) again."; \
	  echo "Or edit projects/$(project_name)/idea.md and projects/$(project_name)/project.yaml yourself, then make dry $(project_name)."; \
	  exit 1; \
	fi
	claude -p "Read CLAUDE.md and follow it. Read projects/$(project_name)/idea.md and every file in projects/$(project_name)/images/. Write or update only projects/$(project_name)/project.yaml so it matches the idea and those photos. Do not run generation. Do not pass --yes. Do not read or print .env. Do not call fal or ElevenLabs." --allowedTools "Read,Write,Edit,Glob,Grep"
	npm run --silent studio -- validate $(PROJECT)

dry: require-name
	npm run --silent studio -- dry $(PROJECT)

images: require-name
	npm run --silent studio -- images $(PROJECT)

prod: require-name
	npm run --silent studio -- prod $(PROJECT) --renderer $(renderer)

redo: require-shot
	npm run --silent studio -- redo $(PROJECT) $(shot) $(if $(stage),--stage $(stage),)

takes: require-name
	npm run --silent studio -- takes $(PROJECT)

pick: require-name
	@if [ -z "$(shot)" ] || [ -z "$(take)" ]; then \
	  echo "Usage: make pick $(project_name) shot=<id> take=<take-id>"; \
	  exit 1; \
	fi
	npm run --silent studio -- select $(PROJECT) $(shot) $(take)

render: require-name
	npm run --silent studio -- render $(PROJECT) --renderer $(renderer)

open: require-name
	@file="projects/$(project_name)/output.mp4"; \
	if [ ! -f "$$file" ]; then \
	  echo "No $$file yet. Run make prod $(project_name) or make render $(project_name)."; \
	  exit 1; \
	fi; \
	if command -v xdg-open >/dev/null 2>&1; then xdg-open "$$file"; \
	elif command -v open >/dev/null 2>&1; then open "$$file"; \
	else echo "No opener found. The file is $$file"; exit 1; fi
