# Lorca UI & UX Guide

A reference for Lorca’s panels, step types, settings, and suggestions — with emphasis on how the interface feels to use, what the learning curve looks like, and where friction tends to appear.

---

## At a glance

Lorca is a **three-pane pipeline workbench**: library and resources on the left, the editable flow in the center, and inspection/debugging on the right. The mental model is linear — prompt in, ordered steps, artifacts out — even though steps can pull from multiple prior outputs via XML prompt composition.

| Audience | Expected experience |
| --- | --- |
| **First-time user** | Can run a minimal flow (endpoint → model → execute) in ~5 minutes if Ollama is already running. Step Suggestions accelerate this. |
| **Intermediate user** | Builds multi-step flows, uses partial runs and trace to iterate. Learns artifact namespaces and prompt blocks. |
| **Power user** | Authors Capsules, loop groups, history reads, import/export with remap, and tunes model buckets. |

**Overall UX character:** dense but purposeful. Tooltips and inline badges carry a lot of explanatory weight. The app rewards experimentation (partial runs, stale indicators, trace) rather than requiring everything to be configured perfectly before the first run.

---

## Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Lorca — Local AI Orchestrator                    [run status] ?│
├──────────────┬──────────────────────────────┬───────────────────┤
│  Left pane   │  Center pane                 │  Right pane       │
│  (library)   │  (prompt + step chain)       │  (inspector)      │
└──────────────┴──────────────────────────────┴───────────────────┘
```

- **Header:** app title, optional Capsule breadcrumb (`← Pipeline › Capsule name`), run status badge, **?** help button.
- **Resizable panes:** drag handles between left/center and center/right.
- **Mobile:** hamburger toggles left library; ⊞ toggles right inspector.

When editing a Capsule, the center pane switches to Capsule editor mode; the right pane gains an **Interface** tab. Pipeline and Capsule editing share the same step-chain UI.

---

## Left pane (library)

The left pane uses **accordion sections** — only one section expands at a time. On first load, **Endpoints** expands if no models exist; otherwise **Step types** expands.

### Step types

Primitive building blocks (5 types shown; Capsule instances are inserted from the Capsules section).

| Type | What it does |
| --- | --- |
| **Model call** | Sends a composed XML prompt to a model; outputs `text` and `rawResponse`. |
| **Prompt wrapper** | Builds XML prompt blocks without calling a model. |
| **Text** | Static or templated text with `{{artifact.namespace.key}}` interpolation. |
| **JSON extract** | Parses JSON from a prior artifact (supports fenced code blocks). |
| **Loop group** | Repeats an inner step chain with optional JSON exit condition. |

Each row has a **↓ Insert** button (after the selected step, or append if none selected). A search box filters the palette.

**UX note:** Step types are the “blank canvas” path. They require more manual wiring than Step Suggestions but teach the underlying model.

### Step Suggestions

Eight built-in **recipes** — pre-configured model-call steps with system prompts, previous-output wiring, and preferred model buckets. Categories: extraction, planning, rewrite, generation, verification, utility.

| Suggestion | Category | Preferred bucket | Purpose |
| --- | --- | --- | --- |
| Intent Extraction | extraction | `extract-json` | Structured intent/topics from user prompt |
| Acceptance Criteria | planning | `general` | Testable criteria as JSON |
| Constraint Extraction | extraction | `extract-json` | Must/must-not/preferences as JSON |
| Prompt Rewrite | rewrite | `rewrite` | Clearer, structured rewrite of prior output |
| Candidate Answer | generation | `general` | Full answer using pipeline context |
| Answer Verification | verification | `verify` | Pass/fail check against requirements |
| Drift Check | verification | `verify` | Semantic drift between intent and output |
| Summary | utility | `summarize` | Compressed summary preserving facts |

**Insert modes:**

| Button | Behavior |
| --- | --- |
| **↑ Before** | Insert before selected step (disabled if no step selected) |
| **↓ After** | Insert after selected step |
| **+ Append** | Add to end of chain |
| **New** | Replace entire pipeline (destructive; confirmation dialog) |

**Drag-and-drop:** grab the ⠿ handle and drop onto insert zones in the center chain. On insert, Lorca **auto-assigns a model** matching the suggestion’s preferred bucket when possible.

**UX note:** Suggestions are the fastest on-ramp. They encode good defaults (JSON response shapes, tag names, previous-output placement) so beginners get a working multi-step flow without opening the Prompt tab first.

### Capsules

Reusable mini-pipelines with a public interface (inputs, outputs, parameters, model slots).

- **Click row** → open Capsule editor (center pane switches context).
- **↓ Insert** → add a `capsule-instance` step to the current pipeline.
- **⊕** → duplicate as editable draft.
- **+** → new empty Capsule; **↓** (header) → import JSON.

Status badges: **draft** (editable) vs **locked** (stable, usable in pipelines).

**UX note:** Capsules add a second level of indirection. The Interface tab and input/output bindings are the main learning hurdle after basic pipelines.

### Models

Discovered and manually added models from registered endpoints.

| Control | Purpose |
| --- | --- |
| **Bucket filter** | Show only models tagged with a usage bucket (`tiny`, `thinking`, `summarize`, etc.) |
| **Bucket tags** | Per-model usage buckets; click to add/remove; **Reset to auto** restores heuristics |
| **Enable / Disable** | Disabled models are excluded from auto-assignment |
| **Click model** | When a model-call step is selected, assigns that model to the step |

**Usage buckets:**

| Bucket | Typical use |
| --- | --- |
| `tiny` | Small/fast models for lightweight tasks |
| `thinking` | Reasoning and complex generation |
| `summarize` | Summarization |
| `rewrite` | Rewriting and rephrasing |
| `extract-json` | Structured JSON extraction |
| `verify` | Verification and critique |
| `general` | General-purpose |
| `unknown` | Uncategorized |

Buckets are auto-inferred from model metadata on discovery; users can override per model.

**UX note:** Click-to-assign (select step → click model) is one of the most intuitive patterns in the app. The bucket filter bridges “I need a verify model” to the right row without memorizing model names.

### Endpoints

Connections to local AI servers (Ollama fully supported).

| Action | Purpose |
| --- | --- |
| **Test access** | Checks browser reachability (CORS) |
| **Discover models** | Fetches model list (requires available access) |
| **Edit** | Name, URL, kind, auth |
| **Enable / Disable** | Disabled endpoints don’t contribute models to auto-assignment |
| **Remove** | Deletes endpoint and its discovered models |

Cards show access status: **Available**, **Blocked**, or **Unknown**. Blocked endpoints display a CORS warning with guidance (local proxy, manual model add).

**UX note:** Endpoint setup is the main **Day 0 friction** — especially CORS when using the hosted GitHub Pages build against localhost Ollama. The CorsProxyBanner and README proxy instructions exist because this blocks many first runs.

---

## Center pane

### Pipeline mode

**Toolbar:**

| Control | Purpose |
| --- | --- |
| **New** | Empty pipeline |
| **Pipeline name** / selector | Rename or switch when multiple pipelines exist |
| **⋯ More** | Extract to Capsule, Convert to Capsule, Export, Import |
| **Follow** (during run) | Auto-select the currently executing step |
| **Execute Pipeline** | Full run (⌘↵ / Ctrl+↵) |
| **Cancel** | Stop in-flight run |

**Prompt bar:** top-level user prompt. Creates `user_prompt.raw` and `user_prompt.xml` artifacts. Wrapped automatically in `<user_prompt>` for downstream steps.

**Step chain (ChainEditor):** vertical ordered list of step cards.

#### Step card anatomy

Each card shows:

- **Type badge** and **label**
- **Model name** (model-call steps)
- **Output namespace** (e.g. `intent_extraction.*`)
- **History read count**, **run state** (current / stale / blocked / not run)
- **Source badges** (“From …”) showing which prior artifacts feed this step
- **Action buttons** (always visible, not hover-only):
  - ▷ Run up to here
  - ▷▷ Run from here (reuses prior outputs)
  - ↻ Re-run only this step
  - Move up/down, duplicate, enable/disable, delete
  - Comment (expandable note on the step)
- **⠿ drag handle** for reorder
- **+ insert zones** between steps and at top (also drop targets for suggestions)
- **Inline output preview** (collapsible) after a run
- **Trace status** and duration when applicable

**Selection:** click to select; Shift+click to extend range (for Extract to Capsule).

**Stale indicators:** when upstream prompt, config, or inputs change after a run, steps show stale state — a gentle nudge to re-run rather than silently showing outdated output.

**Undo/redo:** toolbar in chain area; ⌘Z / ⌘⇧Z (Ctrl+Z / Ctrl+Y).

### Capsule mode

Same chain editor, plus:

- **Capsule toolbar:** name, version, status, Lock / Edit (new draft), Export, Import
- **Test prompt** bar (when draft)
- **Test Run panel** at bottom: fill interface inputs/parameters, run test, inspect trace/output in right pane

Locked Capsules are read-only in the chain; create a draft copy to edit.

---

## Right pane (inspector)

Tab bar differs by context:

| Tab | Pipeline | Capsule |
| --- | --- | --- |
| **Inspector** | ✓ | ✓ |
| **Interface** | — | ✓ |
| **Trace** | ✓ | ✓ |
| **Output** | ✓ | ✓ |

### Inspector tab → Step Inspector

Shown when a step is selected. Empty state: “Select a step to configure it.”

**Header:** type badge + editable label.

**Sub-tabs:**

| Sub-tab | Contents |
| --- | --- |
| **Config** | Type-specific settings (see [Step types & settings](#step-types--settings)) |
| **Prompt** | Prompt composition (model-call and prompt-wrapper only) |
| **Inputs** | History reads, previous output, capsule bindings, JSON source |
| **Outputs** | Primary artifact key, capsule output bindings, last-run artifact refs |
| **Last run** | Status, timestamp, output preview |
| **Validation** | Block reasons, stale hints |

### Interface tab (Capsule only)

Declares the Capsule’s public contract:

- **Inputs** — name, kind (`text` / `json`), required flag
- **Outputs** — name, kind
- **Parameters** — name, kind (`text` / `boolean` / `number` / `json`), required
- **Model slots** — named placeholders filled by callers at runtime

### Trace tab

Step-by-step execution log from the last run.

- Partial vs full run banner
- Optional filter to selected step’s events
- Per event: step label, status, duration, input/output artifact tags
- Expandable details: history read previews, rendered prompt XML, full model response
- Click output artifact tags to preview bodies (JSON pretty-printed)

**UX note:** Trace is the primary debugging surface. It makes Lorca feel **transparent** compared to black-box chat UIs — at the cost of visual density.

### Output tab

Final artifact from the last run.

- Idle / running / error states
- **Stale banner** when upstream changed
- **Partial run banner** when output may not be the configured pipeline terminus
- Copy button
- Pretty-printed JSON for non-string values

---

## Step types & settings

### Model call

| Setting | Description |
| --- | --- |
| Model | Dropdown grouped by endpoint; or click model in left pane |
| Mode | `generate` (single prompt) or `chat` (role-based) |
| Temperature | Optional; blank = model default |
| Max tokens | Optional; blank = model default |
| Prompt tab | Blocks, previous output, history reads |

Outputs: `{namespace}.text`, `{namespace}.rawResponse`.

### Prompt wrapper

No model invocation. Composes XML from prompt blocks only.

| Prompt setting | Description |
| --- | --- |
| **Previous output** | Include prior step’s primary output under a custom XML tag |
| **Placement** | Before or after this step’s own prompt blocks |
| **History reads** | Pull specific prior artifacts into the prompt under custom tags |
| **Prompt blocks** | Label, tag name, body; enable/disable per block |
| **? References** | Help dialog listing available `{{artifact.key}}` refs |

### Text (presentation)

Free-form text with optional `{{artifact.namespace.key}}` template interpolation. No prompt tab.

### JSON extract

| Setting | Description |
| --- | --- |
| Source artifact | Dot-path key, e.g. `answer.text` |

Output: `{namespace}.json`.

### Capsule instance

| Setting | Description |
| --- | --- |
| Capsule | Which Capsule definition to run |
| Input bindings | Map Capsule input ports → parent artifact refs |
| Output bindings | Map Capsule output ports → namespaced keys in parent |
| Loop config | Optional fixed iterations (up to 10) with carried I/O |

Internal Capsule artifacts appear in trace under `{prefix}.internal.*`.

### Loop group

| Setting | Description |
| --- | --- |
| Max iterations | 1–20 (default 3) |
| Exit when | Preset or custom JSON field check on the **last inner step's** output |
| Inner chain | Nested steps shown inline in the chain editor and in the Inspector |

**Retry loop pattern:** put refine step(s) first, verification last (e.g. Candidate Answer → Answer Verification). Exit when `passed` is `true` or `drifted` is `false`. On each retry, `loop.prev.text` holds the previous iteration's verifier JSON — wire it into the refine step via **↺ Add retry feedback** in the Prompt tab.

**Wrap existing steps:** Shift+click to select a range ending with a verifier → **⋯ More → Wrap in retry loop**.

Prep steps (intent, criteria, constraints) stay **outside** the loop; inner steps read them via history reads. See [Feedback loops](#feedback-loops) below.

---

## Feedback loops

Your outline flow is a **prep phase** (linear) plus **retry phases** (loop groups):

```
user_prompt
  → intent_extraction
  → acceptance_criteria
  → constraint_extraction
  → prompt_rewrite
  ┌─ retry loop ─────────────────────────┐
  │  prompt_rewrite → drift_check      │  exit when drifted = false
  └────────────────────────────────────┘
  → candidate_answer
  ┌─ retry loop ───────────────────────────────┐
  │  candidate_answer → answer_verification    │  exit when passed = true
  └────────────────────────────────────────────┘
  → drift_check (final)
  → summary
```

### Should the loop be external?

Yes — in Lorca today a **loop-group step** wraps an inner chain. It is one step in the outer list, but the chain editor shows its inner steps inline. That keeps the outer pipeline linear while making the retry boundary explicit.

You cannot jump back to arbitrary outer steps from inside a loop; move the steps that should retry **into** the loop's inner chain. Outer context (intent, criteria, user prompt) remains available via **history reads**.

### How to read a boolean from verifier output

1. The verifier step (Drift Check, Answer Verification) outputs JSON text.
2. Put it **last** in the loop's inner chain.
3. In the loop's Inspector → **Exit when** → choose **Verification passed** or **No drift detected**, or set a custom JSON field.
4. The executor parses the last inner step's JSON and checks the field (e.g. `passed`, `drifted`).

### Feedback on retry (not just re-run)

On iteration 2+, the previous verifier output is available as `loop.prev.text`. On the refine step's Prompt tab, click **↺ Add retry feedback** to inject it under a `<retry_feedback>` tag with instructions to improve.

---

## Prompt composition (deeper settings)

Available on **model-call** and **prompt-wrapper** steps.

### Previous output

- Toggle **Include**
- **Tag** — XML wrapper name (default patterns like `previous_output`, `user_prompt`)
- **Placement** — before or after this step’s prompt blocks

### History reads

Each read specifies:

- **Source step** — must be prior in chain
- **Artifact** — which output (primary or named)
- **Tag** — XML tag for injection
- **Required** — blocks run if source missing

Status icons on each read indicate valid / disabled source / missing source.

### Prompt blocks

Ordered list of `{label, tagName, body}` sections. System-default blocks from suggestions are marked accordingly. Blocks can be toggled enabled/disabled.

**Learning curve note:** XML/tag composition is the steepest conceptual climb. The **? References** help dialog and source badges on step cards mitigate this, but users coming from plain chat prompts need a few runs to internalize namespaces and tags.

---

## Import & export

### Export (pipeline: ⋯ More; Capsule: toolbar)

Modal with JSON preview, copy, download. Optional **include step outputs** from the last run (useful for sharing reproducible results).

### Import

Paste JSON or load file → **ImportRemapDialog** when model references don’t match local registry.

Remap UI:

- Lists missing models with original endpoint/model names
- Suggests local models matching exported **usage buckets** first
- Pipeline import may replace active pipeline (warning + undo history cleared)

---

## UX patterns worth knowing

| Pattern | Why it matters |
| --- | --- |
| **Partial runs** | Iterate on one step without re-running expensive upstream model calls |
| **Stale state** | Honest feedback when cached outputs don’t match current config |
| **Auto model assignment** | New model-call steps and suggestions pick a bucket-appropriate model |
| **Click step + click model** | Faster than dropdown for A/B model comparison |
| **Drag reorder + drag suggestions** | Spatial editing matches the linear mental model |
| **Follow during execute** | Reduces “where is it running?” anxiety on long chains |
| **Comments on steps** | Document intent without affecting execution |
| **Persistent IndexedDB** | No explicit Save button — changes persist automatically |

---

## Learning curve analysis

### Easy early wins (low friction)

1. Add endpoint → discover models
2. Enter prompt → insert a Step Suggestion → Execute
3. Read Trace → tweak prompt block → partial re-run

The app is designed so **run-first, configure-second** works. Validation tab and “no model” badges guide fixes without blocking exploration.

### Medium complexity (1–2 sessions)

- Understanding **artifact namespaces** (`step_namespace.text`)
- **Prompt blocks** and **previous output** vs **history reads**
- **Model buckets** and when to override
- **Import/export** with remap

### Advanced (ongoing)

- **Capsule interface** design (ports, slots, bindings)
- **Loop groups** with JSON exit conditions
- **Extract to Capsule** / **Convert to Capsule** workflow
- Composing verification pipelines (criteria → answer → verify → drift check)

### Common friction points

| Friction | Mitigation in UI |
| --- | --- |
| CORS / endpoint blocked | Test access button, status badges, CorsProxyBanner, manual model add |
| XML/tag prompt model unfamiliar | Help dialogs, suggestions with working defaults, rendered prompt in trace |
| Many buttons per step card | Tooltips, icon semantics (play / play-from / refresh), always-visible actions |
| Capsule indirection | Interface tab, test run panel, duplicate-before-edit for locked Capsules |
| Dense inspector tabs | Sub-tabs scoped by step type; empty states with hints |

### Intuitiveness summary

**Strengths:** linear chain maps well to “pipeline” intuition; trace-first debugging; suggestions as templates; click-to-assign models; stale honesty; partial runs for iteration.

**Tradeoffs:** power features (history reads, Capsules, loops) add conceptual surface area; accordion left pane hides sections; artifact key syntax is programmer-adjacent.

**Overall:** Lorca reads as a **craft tool for people who want to see the wires** — slightly more to learn upfront than a chat box, but substantially more control and visibility once the artifact/prompt model clicks.

---

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| ⌘Z / Ctrl+Z | Undo pipeline edit |
| ⌘⇧Z / Ctrl+Y | Redo |
| ⌘↵ / Ctrl+↵ | Execute Pipeline (or Cancel if running) |
| Shift+click | Extend step selection range |
| Click | Select step |

Header **?** opens the in-app help dialog with layout, typical flow, and tips.

---

## Related docs

- [README](../README.md) — quick start, architecture, CORS proxy
- [Core concepts](../README.md#core-concepts) — artifacts, trace, Capsules
- In-app **?** and **? References** (prompt editor) for contextual help
