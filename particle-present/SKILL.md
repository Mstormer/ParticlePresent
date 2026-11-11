---
name: particle-present
description: ParticlePresent: turn a talk manuscript into an animated presentation (particle-light visuals, voice cues, speaker view, in-page editor). Use when someone gives a manuscript or script and wants slides or a presentation in this style.
---

# ParticlePresent: manuscript → animated presentation

A ParticlePresent deck is one self-contained HTML page: a full-screen WebGL particle field that morphs into a picture for each slide, large editorial type on a 1920×1080 stage that scales to any screen, speaker notes, voice cues, a speaker-view window, and an in-page editor (press E) whose Save writes the edits back into the file. You never hand-write the engine. You write the slides; the builder pours them into the template.

**Your job:** turn the person's manuscript into `<section>` slides, build, check, deliver. Keep their words. The manuscript becomes the speaker notes verbatim; the on-screen text is short phrasing lifted from it. Do not rewrite their argument or tone.

## 1. Files in this skill

- `assets/template.html`: the ParticlePresent deck engine, editor, fonts and styles, with a 7-slide sample. Its presenting and editing UI comes from the shared modules in `assets/modules/` (from Cinematic Deck Designer, already built in; nothing to do with them when building a deck). Use it as `--template`. (Any `... - ParticlePresent.html` made with this skill also works as a template, since every deck carries the full template inside it.)
- `scripts/make_deck.py`: pours your slides into the template, picks voice-cue words, applies the default look, writes the finished files.
- `scripts/check.js`: renders every slide fully built, reports errors and layout problems, saves screenshots.
- `examples/sample_slides.html`: the slides of the sample deck; copy its patterns.

Never rebuild the engine by hand or from memory. Never edit `assets/template.html`.

## 2. Onboard and storyboard (before writing any slide)

Work in the steps below. Stop and wait for the person only where it says **WAIT**. Ask in plain chat (or with AskUserQuestion when available), each question with 2–4 options and your recommendation first.

### 2a · Get the talk
The person supplies the content: manuscript, script, outline or notes, as a file, paste or link. If nothing is attached, ask and **WAIT**; never invent the talk. Every on-screen word comes from their material; anything you write yourself (even a short phrase) is marked *drafted* in the storyboard and needs their OK. Ask where the finished file should go unless it is obvious.

### 2b · Read the talk
Read everything, then write a short diagnosis: the talk's shape (ladder, journey, reveal, contrast, toolkit, story); the one sentence the audience should remember (your draft); the 3–5 chapters and the emotional peak; and the concrete images, objects, animals or places the talk already names. Those images are the raw material for the particle pictures.

### 2c · Goals first, then a few questions
Propose your best guess for each goal and have the person confirm or correct it, even when it seems obvious:
- **Outcome:** what should the audience do, think and feel afterwards?
- **Success:** what makes this a win for the speaker, and how will they know?
- **Occasion and stakes:** keynote, sermon, class, workshop, board meeting; main event or support?
- **Audience starting point:** what do they already believe, and what doubt must the talk overcome?

Then ask at most 4 more, only what the material doesn't answer: title and speaker name; length; room and screen (projector, LED wall, laptop, screen-shared); presenting style (clicker, voice cues, speaker view on a second screen). Fold two checks into these: any **sacred moments** (a slide or verse that must stay calm and still: no shock-rings, slow gentle forms), and the closing question or call to action in the speaker's words.

**WAIT.** Then write a **goals brief** of 6 lines or fewer (outcome, measure of success, audience shift from → to, the sentence to remember, sacred moments) and get the OK. Every later choice serves it.

### 2d · Pitch light treatments
Offer two or three distinct treatments for the particle light, derived from the talk, not a template. For each:
- **Name and premise** (e.g. "Lamplight: small warm lights gathering into one").
- **Colour arc:** which `data-mood` carries each chapter, and what the light colours mean (e.g. gold = gift, leaf = growth, coral = cost, sky = AI).
- **Picture language:** mostly icons, scenes, drawn silhouettes, or particle text; which recurring image ties the talk together.
- **Energy:** particle speed, transition pace, glow and light rays, where shock-rings (`data-wave`) land, and how the picture morphs on builds.
- **Three signature moments** (e.g. a cover tree that grows, a picture that morphs mid-sentence, the closing question forming out of light).
- **How it serves the goals brief,** and **one risk** (how you keep the light from upstaging the speaker).

Make them genuinely different: one calm and elegant, one bold, one surprising. Recommend one. **WAIT** for the pick or a mix.

### 2e · Storyboard
Put the goals brief at the top, then a slide-by-slide table: # · chapter · the slide's job (one phrase) · on-screen words (few; *drafted* marked) · particle picture (`data-form`, and why it fits the idea) · mood · builds, with any picture morph per build · spoken cue word per build · wave or rays if any. Use only form names listed in §3; avoid the same picture on neighbouring slides. Cut or merge any slide with no job. End on the closing question or call to action, never "Questions?".

**WAIT** for changes, then write the slides from the approved storyboard, following these rules:

- **One idea per slide.** About one slide per 30–45 seconds of script. Short sections can share a slide; long ones split.
- **Builds:** when a key line should land on its own, it becomes a build: an element with `data-step="1"` (then 2, 3…). In the notes, put `[BUILD]` right where that line starts. The count of `[BUILD]` markers on a slide must equal its number of build steps.
- **Notes:** `<aside class="notes">` holds the script for that slide, verbatim, in order. `[PAUSE]` or `[PAUSE for laughter]` for beats. Stage directions go in `<em class="dir">…</em>` (not spoken, ignored by voice cues).
- **On-screen text:** 3–20 words per element, in the speaker's words. Big statement = `d2`/`d3`; supporting line = `t1`; small label = `lab`/`eyebrow`.
- **Sections:** an `eyebrow` (e.g. `II · The cost`) on the first slide of each section.
- **Sources:** any statistic or study gets a `src` line (author, venue, year). Do not invent numbers; use only what the manuscript states.
- **Ending:** the last slide uses the final-question pattern (below): the closing question forms out of particles, centered, then blows away.

## 3. Write `slides.html` (only `<section>` blocks)

### Stage and layout
- Stage is 1920×1080. Text column: `left:120px`, width up to ~1100px (the particle picture usually sits on the right, x≈1300–1700). Full-width text only when `data-form="none"`.
- Positioned elements use `class="abs"` with inline `left/top/width`. Keep everything inside x 60–1860, y 60–1040.
- Every element the person may want to edit gets `data-e="<slideid>-<n>"` (unique, numbered in order). Slide ids are short, lowercase, unique.

### Section attributes
`<section class="slide" id="habit" data-mood="gold" data-form="book" data-title="Old habits, new tools">`
- `data-title`: shown in the slide list and speaker view.
- `data-mood` (background colour): `ai` (blue), `gold`, `garden` (green), `cost` (red-brown), `rest` (dusk, pairs with the sunset).
- `data-form`: the particle picture. One name, or a timed sequence `peopleAll>people@2.6` (morph to the second after 2.6 s). A build element can carry its own `data-form` to morph when it appears.
- Optional `data-wave="x,y,amp,delay"`: a shock-ring from that point.

### Particle pictures (`data-form`)
- **Icons (always safe):** `icon:<name>` or `icon:<name>:<gold|leaf|coral|sky|ink|white>`. Names: book-open, book-open-text, head-circuit, scales, lightbulb, coins, hammer, tent, hourglass, mountains, eye, gift, user, person, trend-up, trend-down, hands-praying, heart, gear, gear-six, feather, sparkle, fire, bird, fish, rabbit, butterfly, horse, cat, cow, dog, bug, bug-beetle, shrimp, egg, paw-print.
- **Scenes:** `tree` (glowing branching tree, good cover), `book`, `page`, `mind` (head with circuitry), `scales`, `bulb`, `coins`, `tower`, `landscape`, `path`, `sprout`, `flame`, `lamps`, `clock`, `gears`, `infinity`, `spiral`, `gardenScene`, `sunset>sunsetLow@3` (setting sun behind a hill; use with mood `rest`), `iconPray`, `iconBook`, `iconFlame`, `iconHeart`, `none` (dust only).
- **Animals:** `animal:lion|horse|donkey|camel|dog|fish` (drawn silhouettes).
- Other forms in the engine were made for specific charts in the original talk; check the contact sheet before using any name not listed here.

### Type and colour classes
`d1` (150px title), `d2` (104px statement), `d3` (70px), `t1` (44px), `t2` (33px), `t3` (25px), `lab` (small caps label), `num` (huge number), `quote` (italic). Colours: `c-gold`, `c-leaf`, `c-coral`, `c-sky`, `c-ink`, `mute`, `dimop`. Colour single phrases with `<span class="c-gold">…</span>`.

### Entrances
- `rv`: words rise in one by one (statements). `in` + one of `fade`, `pop`, `left`, `right`, `thud` (default rise). Delay with `style="--d:.6s"`.
- `data-count="42" data-suffix="%" data-delay="400"` on a `num`: counts up.
- `data-type data-delay="1500"` on a paragraph: typed out like a chatbot reply (caret stays at the end).

### Patterns (copy and adapt)
```html
<!-- cover -->
<section class="slide" id="cover" data-mood="ai" data-form="tree" data-title="Talk Title">
 <div data-e="cover-1" class="abs stack" style="left:120px;top:318px;width:1010px;--g:34px">
  <p data-e="cover-2" class="lab c-gold in fade" style="--d:.5s">Subtitle line</p>
  <h1 data-e="cover-3" class="d1 rv" style="--d:.7s;font-size:146px">Talk Title</h1>
  <p data-e="cover-4" class="t2 mute in fade" style="--d:1.9s;margin-top:22px">Speaker Name</p>
 </div>
 <aside class="notes"><em class="dir">Title. Let the room settle.</em></aside>
</section>

<!-- statement + build that morphs the picture -->
<section class="slide" id="habit" data-mood="gold" data-form="book" data-title="Old habits, new tools">
 <p data-e="habit-1" class="eyebrow in fade">I · Where we start</p>
 <p data-e="habit-2" class="abs d3 rv" style="left:120px;top:228px;width:1060px;--d:.2s">Every generation meets a new tool and wonders what it will do to us.</p>
 <p data-e="habit-3" class="abs d2 c-gold rv" data-step="1" data-form="mind" style="left:120px;top:640px;width:1100px">The tool is never the whole story.</p>
 <aside class="notes">Every generation meets a new tool and wonders what it will do to us.
[BUILD] But the tool is never the whole story. [PAUSE]</aside>
</section>

<!-- statistic -->
<p data-e="stat-2" class="abs num c-coral" style="left:104px;top:196px;font-size:280px" data-count="42" data-suffix="%" data-delay="400">42%</p>
<p data-e="stat-3" class="abs t1 in" style="left:120px;top:516px;width:860px;--d:.8s">what the number means</p>
<p data-e="stat-5" class="src in fade" style="--d:1.2s">Author et al., Venue, Year</p>

<!-- list that builds, each line morphing the picture -->
<div data-e="list-2" class="abs stack" style="left:120px;top:236px;width:1220px;--g:40px">
 <p data-e="list-3" class="d3 rv" style="font-size:62px;--d:.2s">First line.</p>
 <p data-e="list-4" class="d3 rv" data-step="1" data-form="icon:book-open-text" style="font-size:62px">Second line.</p>
 <p data-e="list-5" class="d3 c-gold rv" data-step="2" data-form="icon:heart:coral" style="font-size:62px">Third line.</p>
</div>

<!-- chat bubbles (add "warn" to tint AI replies red) -->
<div data-e="chat-3" class="abs stack chat" style="left:1080px;top:200px;width:740px;--g:20px">
 <div data-e="chat-4" class="msg me glass in right" style="--d:1s">User message</div>
 <div data-e="chat-5" class="msg ai warn glass in pop" style="--d:1.8s">AI reply</div>
</div>

<!-- final question (last slide): everything else in .fadeaway; the question in .finalwrap, centered -->
<section class="slide" id="question" data-mood="ai" data-form="lamps" data-title="The last question">
 <div data-e="question-1" class="abs fadeaway" style="left:120px;top:220px;width:1120px"><p data-e="question-2" class="t1 mute in" style="--d:.2s">Lead-in sentence.</p></div>
 <div data-e="question-3" class="abs finalwrap" style="left:370px;top:370px;width:1180px"><p data-e="question-4" class="d2 rv finalq" data-step="1" data-cue="ask, yourself" style="text-align:center">The <span class="c-leaf">closing</span> question?</p></div>
 <aside class="notes">Lead-in sentence.
[BUILD] Ask yourself: the closing question? [PAUSE]</aside>
</section>
```

### Voice cues
The builder picks cue words automatically: for a slide, distinctive words near the start of its notes that were not said at the end of the previous slide; for a build, words at the start of that `[BUILD]` segment not said just before it. Override by putting `data-cue="word, word"` on the section or the build element. Good cues: common, clearly spoken words of 5+ letters. Avoid names, rare words, and words said just before the cue point. (In the deck, the person can also double-click any word in Notes or Speaker view to add or drop a cue.)

## 4. Build

Copy the skill's `scripts/` folder into your working folder, then:
```
python3 scripts/make_deck.py --template "<skill folder>/assets/template.html" --slides slides.html --title "<Talk Title>" --out out
```
- It prints the cue words per slide and build. Fix every `!!` line (build/marker count mismatch) and every `(none: clicker only)` or weak cue (add `data-cue`). Rebuild.
- Default look (the template author's settings): particle speed 1.5×, transition 1.5×, glow 2×, background 1.25×, quality high, progress bar on. Pass `--settings settings.json` to change any of `speed, morph, bright, glow, bg, quality, bar`.
- To carry forward edits the person saved in an earlier version, extract its `<script type="application/json" id="deck-edits">` JSON to a file and pass `--edits that.json`.

## 5. Check (required)

```
node scripts/check.js "out/<Talk Title> - ParticlePresent.html" shots
python3 -c "import glob;from PIL import Image;fs=sorted(glob.glob('shots/s-*.png'));ims=[Image.open(f).resize((480,270)) for f in fs];c=4;S=Image.new('RGB',(c*486,((len(ims)+c-1)//c)*276),'white');[S.paste(im,((i%c)*486,(i//c)*276)) for i,im in enumerate(ims)];S.save('sheet.png')"
```
Playwright and Chromium are needed (`require('playwright')`). Look at `sheet.png` yourself. Compare every slide with the approved storyboard (picture, mood, builds, words). Fix: errors, edge or overlap warnings, text running into the particle picture, unreadable contrast, a picture that does not fit the idea or differs from the storyboard without reason. Rebuild and re-check until clean.

## 6. Deliver

- The deliverable is `out/<Talk Title> - ParticlePresent.html`: one file that opens in any modern browser, offline. Voice cues need Chrome or Edge. Save it where the person keeps their work (their connected folder, or as a download).
- Optional, when the host offers hosted pages (e.g. the Artifact tool on claude.ai): `out/deck.html` is the same deck as page content; publish it with `capabilities: {"artifact": {}, "downloads": true}` so the in-page Save can publish new versions. A hosted page has no microphone, so voice cues only work in the offline file.
- Tell the person, briefly, how to present:
  - Clicker/arrows: always shows the next build first, then the next slide (voice on or off). With voice off, builds also come on their own, timed to the script (turn that off in `T`). `S`: speaker view in its own window (running script with cue words, Now and Next previews, timer and clock; Notes / Now / Next toggles, A− / A+, layout button, Edit notes); share or project only the slides window. `V`: voice cues on/off. `N`: notes strip along the bottom with the next cue word (do not press on a shared screen). `T`: cue words, slide targets, build times and pace. `G`: slide list. `E`: edit (below). `P`: hide the progress bar. `F`: fullscreen. `B`: black screen. `?`: help.
  - Editor (`E`): click to select text (click again inside a group), drag to move, corner to resize, side for width, arrows nudge, A− / A+ size, double-click or Enter to retype, Delete hides, Cmd/Ctrl+Z undoes. "Select the light image" (or click the picture) to move and size it and set that slide's particle speed, brightness, glow and light rays; "Whole deck" holds particle speed, transition speed, brightness, glow, haze, quality and the progress bar. Slides with a naming list get a "Names on this slide" box.
  - Saving: the first Save asks once for the deck's own file and the browser remembers it, so every later Save (Cmd/Ctrl+S), even after a reload, writes straight back; "Save as…" writes a copy without changing where Save goes. Browsers that can't write files download a copy. Edits are also kept in the browser as a working copy until saved.
  - Voice mode: builds and slides wait for their cue word; the clicker always works. The last question forms in particles and dissolves on its own about 8 s later; "thank you" or a click brings it forward (never sooner than 5 s).

## 7. Later updates

Before every update, read the person's latest copy first (their file's `<script type="application/json" id="deck-edits">` block, or the newest hosted version if they publish it) and carry those edits forward with `--edits`. Never overwrite a newer save.
