# Composer Style Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both composer cards use the existing surprise visual language while removing the square backdrop and restoring reliable button hit testing.

**Architecture:** Render a full-window transparent composer surface beside the fixed pet surface, put the native interactive-region marker on the visible card, and use shared CSS classes/tokens for both cards. Express native composer sizes as logical pixels so the web viewport matches the design at any Windows scale factor.

**Tech Stack:** React, TypeScript, CSS, Tauri 2, Rust, Vitest.

## Global Constraints

- Preserve message and surprise protocols, validation, copy, and submit behavior.
- Preserve the existing surprise composer visual direction.
- Do not add dependencies or unrelated refactors.
- Keep transparent space outside the cards click-through.

---

### Task 1: Correct Composer Ownership and Hit Regions

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/message/MessageComposerPanel.tsx`
- Modify: `src/surprise/SurpriseComposerPanel.tsx`
- Test: `src/app/App.test.tsx`
- Test: `src/message/MessageComposerPanel.test.tsx`
- Test: `src/surprise/SurpriseComposerPanel.test.tsx`

**Interfaces:**
- Produces: `.composer-surface` as an `.app-shell` child and `.composer-card-shell[data-desktop-interactive-region]` as the complete visible hit target.

- [ ] Add failing tests proving composers are outside `.pet-surface` and the card, not the transparent surface, owns the interactive marker.
- [ ] Run focused tests and confirm the new assertions fail against the current nested layout.
- [ ] Render the active composer in a sibling `.composer-surface` and move the marker to each visible card.
- [ ] Run focused tests and confirm placement, keyboard behavior, submission, and cancellation pass.

### Task 2: Share the Existing Surprise Visual Language

**Files:**
- Modify: `src/app/app.css`
- Test: `src/message/MessageComposerPanel.test.tsx`
- Test: `src/surprise/SurpriseComposerPanel.test.tsx`

**Interfaces:**
- Consumes: `.composer-surface` and `.composer-card-shell` from Task 1.
- Produces: shared card, field, focus, secondary-action, and primary-action tokens/classes.

- [ ] Add source-contract assertions for transparent composer surfaces and shared card/action classes.
- [ ] Confirm the assertions fail while Message still uses the cream/orange visual system.
- [ ] Make both cards use the surprise surface, outline, radius, red focus state, and black/white action styles.
- [ ] Keep only content-specific grid and field sizing in message/surprise selectors.
- [ ] Run focused component and App tests.

### Task 3: Make Native Composer Sizes DPI-Correct

**Files:**
- Modify: `src-tauri/src/commands.rs`
- Test: `src-tauri/src/commands.rs`

**Interfaces:**
- Produces: logical `440x260` and `440x460` composer sizes converted by Tauri for the current monitor scale.

- [ ] Add failing Rust tests for 100%, 125%, and 150% logical-to-physical geometry expectations.
- [ ] Confirm the current fixed physical-size implementation fails the high-DPI cases.
- [ ] Set composer size with Tauri logical dimensions while preserving saved/restored pet position.
- [ ] Run focused and full Rust tests.

### Task 4: Visual, Interaction, and Build Verification

**Files:**
- Modify: `design-qa.md`

**Interfaces:**
- Consumes: completed message and surprise composer states.
- Produces: screenshots, interaction evidence, QA report, and updated debug executable.

- [ ] Render message at `440x260` and surprise at `440x460` with device scale factor 1.
- [ ] Capture both states and compare their shared visual tokens and transparent surroundings.
- [ ] Click message actions and both surprise footer actions; verify no click-through at their centers.
- [ ] Record any P0/P1/P2 findings in `design-qa.md`, fix them, and recapture until the report passes.
- [ ] Run `pnpm test`, `pnpm typecheck`, `pnpm build`, `cargo test`, `cargo check`, `cargo fmt --check`, and `git diff --check`.
- [ ] Rebuild `src-tauri/target-phase-e-product/debug/couple-desktop-pet.exe` and launch it for final verification.
