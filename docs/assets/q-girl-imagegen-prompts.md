# Q Girl Built-In Pet ImageGen Prompts

Reference image:

`docs/assets/references/q-girl-pet-reference.png`

Global prompt shared by every frame:

Use case: illustration-story
Asset type: desktop pet 2D animation frame

Generate one transparent-ready animation frame for a cute Q version long-haired girl desktop pet based on the provided reference image. The reference image is a style and character identity reference only. Do not copy exact pixels. Keep the same character concept: chibi young woman, very large head and small body, long dark brown hair, round glasses, large warm brown eyes, gentle slightly shy expression, pale gray-purple plaid layered top or dress, loose white pants, white shoes.

Style: polished cute anime chibi desktop mascot, soft hand-painted edges, clean readable silhouette, warm emotional expression, high consistency across frames.

Composition: full body centered, generous transparent padding, same camera angle, same approximate body size, same foot baseline, readable at 128px desktop height.

Background: perfectly flat solid #00ff00 chroma-key background for removal, no floor plane, no shadow.

Constraints: no watermark, no text, no extra characters, no unrelated props except the tiny laptop/keyboard only for act-typing. Keep the whole character inside frame. Preserve long hair, round glasses, gray-purple plaid clothing, white pants, white shoes.

Avoid: photorealism, realistic adult proportions, cropped head, cropped feet, missing glasses, wrong outfit, visible text, hard shadow, white background, checkerboard background, extra decorative icons everywhere.

Frame size target after processing: 768x960 PNG.

Action prompts:

idle-breathe: calm standing idle, tiny breathing motion, shoulders and chest rise gently, blink at the middle frames, hair tips sway subtly, return to the same pose for a seamless loop.
idle-look: quietly glances toward the user, head turns slightly, eyes look sideways then back, one hand gently adjusts round glasses, hair follows the head motion.
idle-stretch: sleepy little stretch, both arms lift and stretch, body rises, eyes close briefly, layered clothes and long hair settle back down.
walk: tiny chibi steps, left foot and right foot alternate, body weight shifts left and right, hair bounces softly, loop starts and ends at matching neutral pose.
drag: as if picked up and dragged, body hangs with feet slightly off baseline, arms and hair sway left then right, expression surprised but cute.
sleep: drowsy standing nap, eyes closed, body sinks slightly, head nods, hair droops softly, peaceful loop.
act-cute: acting cute and clingy, hands near cheeks, head tilts, cheeks blush more, tiny bounce forward, smile becomes sweeter, return to soft smile.
act-typing: tiny laptop or keyboard appears in front, both hands tap quickly, eyes focus on screen, then she looks up proudly with a small smile.
act-wave: friendly greeting, one hand waves clearly side to side, body leans forward slightly, long hair swings with the wave, warm smile.
act-hug: asking for a hug, arms open wide, small hop forward, expectant pause with bright eyes, then arms relax.
act-pout: cute angry pout, arms cross, cheeks puff, eyes glance aside, foot taps once, expression softens near the end.
act-drowsy: sleepy yawn, one hand rubs eye, head nods down, almost falls asleep, then wakes a little with embarrassed smile.

Current checked-in resource note:

The current `src/assets/pets/q-girl/` frames are temporary verification assets generated locally from the reference image with chroma-key removal and lightweight transforms. They keep the v2 code path verifiable but are not final ImageGen action frames. Replace them with 12 action groups x 30 final frames before claiming resource quality completion.
