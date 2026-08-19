# Local Focus Countdown Design

Date: 2026-08-18
Status: Approved

## Goal

Add a complete but lightweight local countdown tool to the pet interaction menu. The timer helps the local user focus for a short period and presents an independent completion reminder without adding or changing a pet animation.

## Product Boundaries

- The countdown is local-only and never enters the realtime sync protocol.
- The feature does not change the pet action state machine or pet resource-pack contract.
- Only one countdown can exist at a time.
- The feature does not include task names, history, statistics, automatic break cycles, or Pomodoro reports.
- The first version uses visual reminders only and does not play audio.

## Entry Point

Replace the existing `打招呼` interaction-menu entry with `专注一下`.

- The entry remains available regardless of pairing or peer presence.
- Use a purpose-built transparent PNG timer illustration in the existing black, white, and red interaction-menu visual language.
- Do not use text, emoji, Unicode symbols, or a colored square as the visible menu icon.

## Setup Surface

Opening `专注一下` uses the existing centered composer-surface lifecycle so the pet window geometry is restored after closing.

Suggested logical surface size: `440 x 320` pixels.

Content hierarchy:

1. Eyebrow: `专注计时`
2. Title: `留一小段时间给自己`
3. Large selected duration, defaulting to `25:00`
4. Presets: `15分钟`, `25分钟`, `45分钟`, `60分钟`
5. Minute stepper with minus and plus icon buttons
6. Secondary `取消` and primary `开始专注` commands

Duration rules:

- Minimum: 1 minute
- Maximum: 180 minutes
- Step: 1 minute
- Selecting a preset updates the stepper and large time display.
- When a countdown already exists, the menu entry opens its running controller instead of starting a replacement flow.

## Running Presentation

After starting, restore the pet surface and render a compact timer pill near the pet.

- Target size: approximately `92 x 30` logical pixels.
- Content: a timer asset and `MM:SS` remaining time.
- The anchor follows the pet stage, while text and hit targets remain legible rather than scaling without bounds with the character.
- Clicking the pill opens a compact controller with `暂停` or `继续` and `结束计时`.
- Remote message and surprise surfaces have display priority. The timer continues while its pill is temporarily hidden.
- In static edge-hidden mode, show only the static micro mascot and a static remaining-time pill. Do not introduce mascot animation, pulsing, or blinking.

## Completion Reminder

Completion uses a dedicated UI overlay and never dispatches a pet action.

Animation sequence:

1. Timer illustration appears with a short scale-and-fade entrance.
2. Two thin rings expand and fade.
3. A restrained set of black, white, and red paper accents rises and settles.
4. The completion card unfolds below the illustration.

The entrance lasts approximately 2.4 seconds. Respect `prefers-reduced-motion` by replacing the sequence with an immediate fade-in.

Card copy:

- Eyebrow: `专注完成`
- Title: `这一小段，认真完成了`
- Body: `辛苦啦，休息一下吧。`
- Actions: `知道啦` and `再来一次`

Behavior:

- The expanded card remains for 12 seconds.
- Without input, it collapses into a static timer icon with a red unread dot; clicking the icon restores the card.
- `再来一次` immediately starts the same duration.
- In edge-hidden mode, project the card inward from the screen edge while keeping the micro mascot static.
- When another modal/composer or a remote notice owns the transient surface, queue the completion reminder and display it after that surface closes.

## Click-Through And Window Behavior

- Only the timer pill, controller, completion card, and collapsed unread icon are desktop interactive regions.
- Transparent parts of the rectangular webview remain click-through.
- Persisted click-through preference must not be changed by opening or acknowledging timer UI.
- Hiding the pet window to the tray does not stop the timer.

## Timer State And Recovery

Model timer state independently from pet state:

- `idle`
- `running`
- `paused`
- `completed-unacknowledged`

Use an absolute `endsAt` timestamp for running timers. Do not derive correctness from decrementing a counter every second.

- Recalculate remaining time from the current clock on every UI tick.
- On system resume or large clock jumps, complete immediately when `endsAt` has passed.
- Persist active or paused countdown state locally.
- On application restart, resume a valid timer.
- If the timer elapsed while the process was closed, show one completion reminder after startup.
- A completed reminder is acknowledged exactly once.

## Visual Language

- Match the existing composer shell: warm white `#fafaf6`, near-black `#111`, red accent `#f6534d`, 7px corner radius, 1.5px border, restrained shadow, and zero letter spacing.
- Use the existing composer typography scale rather than decorative display type.
- Keep timer controls compact and use familiar minus, plus, pause, play, and close icons where applicable.
- Avoid nested cards and avoid large decorative backgrounds.

## Acceptance Criteria

- The interaction menu contains exactly six entries and `专注一下` replaces `打招呼`.
- Preset and custom durations from 1 through 180 minutes start correctly.
- Running, paused, resumed, ended, repeated, and completed flows are available with no ambiguous state.
- Sleep, reload, tray hiding, and restart recovery use the persisted absolute deadline.
- Completion reminder is an independent UI animation and does not request a pet action.
- Message, surprise, settings, and edge-hidden surfaces do not visually collide with timer UI.
- Click-through remains correct and only visible controls block pointer input.
- Reduced-motion users receive a static completion transition.
- New behavior has focused unit, integration, Rust geometry, and end-to-end visual coverage.
