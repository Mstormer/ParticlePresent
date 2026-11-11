# ParticlePresent

A Claude skill. Give Claude a talk manuscript; get back an animated, single-file HTML presentation:

- full-screen particle light that morphs into a picture for each slide
- large editorial type on a 16:9 stage that fits any screen or projector
- speaker notes with your full script, a speaker-view window (timer, next-sentence preview, slide previews)
- optional voice cues: builds and slides advance when you say a cue word (Chrome/Edge); the clicker always works
- in-page editor (press E): move and retype anything, tune particle speed, brightness, glow and light rays per slide; Save writes into the file
- a closing question that forms out of light and dissolves

## Install

Claude apps: zip the `particle-present` folder and upload it under Settings → Capabilities → Skills.
Claude Code: copy the `particle-present` folder to `~/.claude/skills/particle-present/` (or `.claude/skills/` in a project).

## Use

> Use the particle-present skill to turn this manuscript into a presentation. [attach or paste the manuscript]

Claude reads the talk, confirms your goals in a short brief, pitches two or three light treatments (colour arc, picture language, energy), and storyboards each slide's particle picture for your OK. Then it builds with `scripts/make_deck.py`, checks every slide with `scripts/check.js` (needs Node + Playwright), and hands you `<Title> - ParticlePresent.html`.

## Presenting keys

Arrows/clicker: next build, then next slide · S: speaker view · V: voice cues · N: notes · T: cue words and timing · G: slide list · E: edit · P: progress bar · F: fullscreen · B: black screen · ?: help.
In the editor, the first Save asks once for the deck's file; after that Save (Cmd/Ctrl+S) writes straight back to it, and Save as… makes a copy.
Share or project only the slides window; keep speaker view on your own screen.

## Contents (inside `particle-present/`)

- `SKILL.md`: instructions Claude follows
- `assets/template.html`: engine, editor, fonts and styles, plus a 7-slide sample deck (open it in a browser to see the style)
- `assets/modules/`: the shared presenter modules (HUD and notes, speaker view, editor, save), taken unchanged from Cinematic Deck Designer (same author) so both skills present and edit the same way; they are built into `template.html`
- `scripts/make_deck.py`, `scripts/check.js`: build and check
- `examples/sample_slides.html`: slide markup patterns

## Developing the engine

The template is generated: edit `src/` (and, only by re-syncing, `particle-present/assets/modules/`), then run `python3 tools/build_template.py`. See `AGENTS.md`.

## License

[PolyForm Noncommercial 1.0.0](LICENSE.md). You may use, copy and change this skill for any noncommercial purpose: personal use, study, research, hobby projects, and use by charities, schools, churches and other noncommercial organizations. Commercial use, including selling the skill or a changed version of it, needs a separate license from the author. This is source-available software, not open source. The presenter modules in `particle-present/assets/modules/` come from [Cinematic Deck Designer](https://github.com/Mstormer/CinematicDeckDesigner) under the same license.

Required Notice: Copyright (c) 2026 Mstormer (https://github.com/Mstormer)
