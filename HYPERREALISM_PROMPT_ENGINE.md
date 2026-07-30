# HYPERREALISM PROMPT ENGINE
### A complete training document for generating photoreal image prompts
**Version 1.0 — Companion module to the AI Visual Production System**

---

## 0. WHAT THIS DOCUMENT IS

This is a **knowledge file**. Load it into an LLM (Claude Project, Custom GPT knowledge base, system prompt, or ComfyUI prompt-assistant node) to program that model to write prompts that produce images indistinguishable from photographs.

It is not a style guide. It is a **capture simulator**. Every rule in this document exists to force one behavioral shift in the model writing the prompt:

> **Stop describing an image. Start reconstructing the event that produced it.**

A photograph is physical evidence that a body stood in a room holding a device while photons behaved lawfully. Every realism failure traces back to a prompt that described a *picture* instead of specifying *that event*.

**How to use it:**
- Read §1–§3 to understand the operating logic.
- Use §4–§11 as the layer libraries you draw from when building.
- Use §12 for assembly order (word order changes output — this is not optional).
- Use §13 for scenario templates.
- Use §14 for tool-specific translation.
- Use §16–§18 for diagnosis and repair when a generation fails.

---

## 1. THE SIX LAWS OF HYPERREALISM

These override all other instincts. When a rule elsewhere in this document conflicts with these, these win.

**LAW 1 — Realism is camera behavior, not resolution.**
"8K, ultra detailed, hyperrealistic, masterpiece" produces *rendered* images. "Shot on a Canon EOS R6, 35mm at f/2, 1/60s handheld, ISO 3200" produces *photographs*. Quality adjectives describe an outcome; capture specs describe a cause. Always specify the cause.

**LAW 2 — The model's default is statistical perfection. Perfection is the tell.**
Left alone, a model produces: centered subject, even fill light, poreless skin, no obstruction, perfect horizon, no motion, symmetrical composition, ideal exposure. Every one of those is a marker of synthesis. Your job is to break each one deliberately, in a way a real camera would break it.

**LAW 3 — Light has one origin and obeys inverse-square falloff.**
Real light comes from somewhere identifiable. It gets dimmer with distance, fast. It leaves some part of the frame underexposed and some part clipped. If your prompt does not name a source, a direction, a shadow behavior, and a highlight behavior, the model will invent ambient global illumination — the single most reliable AI tell in existence.

**LAW 4 — One flaw, deliberately chosen, beats five flaws stacked.**
Two imperfections read as authentic. Five read as parody or as a "gritty filter." Budget your flaws (§11). Spend them where a real camera would actually fail.

**LAW 5 — Specificity defeats averaging.**
"A city street" summons the average of every city street in the training data — which is nowhere, and looks like nowhere. "A cracked sidewalk outside a shuttered dry cleaner, faded orange awning, one bent parking meter" summons a place. Every generic noun in your prompt is a request for an average. Replace them.

**LAW 6 — Subjects unaware of the camera photograph better than subjects performing for it.**
The instant a subject "poses," "looks confidently at the camera," or "smiles warmly," you have requested a stock photo. Direct behavior, not expression: what are their hands doing, where is their weight, what were they doing one second ago.

---

## 2. THE REALISM EQUATION

Every hyperreal prompt is the sum of eight resolved variables. Missing variables get filled by the model's average. Resolve all eight.

```
PHOTOREALISM =
    CAPTURE SYSTEM        (what device, what glass, what settings)
  + OPTICAL BEHAVIOR      (how that glass actually renders and fails)
  + LIGHT PHYSICS         (one source, one direction, measurable falloff)
  + SUBJECT BEHAVIOR      (unaware, mid-action, weighted, specific)
  + SPATIAL EVIDENCE      (proof the camera occupied a real position in a real room)
  + MATERIAL TRUTH        (surfaces behaving per their physics)
  + COLOR SCIENCE         (a named response curve, not "vibrant colors")
  + IMPERFECTION BUDGET   (1–2 flaws, chosen, not sprinkled)
```

**Diagnostic use:** when an image fails, it fails in exactly one or two of these eight. Identify which. Repair only that. Do not rewrite the prompt.

---

## 3. THE THREE PILLARS (INHERITED)

Hyperrealism sits inside the parent system. All three pillars still apply:

- **STRUCTURE** — camera, lens, light, composition, material. The engineering layer. §4–§11 below are the expanded structure library.
- **REFERENCE** — the aesthetic DNA. Borrow *technique* (light behavior, color response, subject relationship), never subject or brand.
- **VISION** — why the image exists, who it's for, what it should make them feel. If unresolved, the image will be technically correct and emotionally inert.

A hyperreal image with no Vision is a well-executed photograph of nothing.

---

## 4. LAYER 1 — THE CAPTURE SYSTEM

Name the device. The device carries an entire rendering signature: sensor size, color science, noise character, dynamic range, lens behavior. Naming it is the highest-leverage token in a realism prompt.

### 4.1 Device signature library

| Device class | Specify as | Renders as |
|---|---|---|
| Modern flagship phone | "shot on an iPhone 15 Pro, main camera, computational HDR" | Deep focus, lifted shadows, slightly over-sharpened, cool-neutral, everything in focus |
| Older phone | "shot on an iPhone 6, small sensor, aggressive noise reduction" | Soft detail, smeared shadow noise, limited dynamic range, cyan-shifted |
| Front-facing selfie | "front-facing phone camera at arm's length, wide lens distortion" | Nose/hand enlargement, soft corners, high perspective distortion |
| Full-frame mirrorless | "full-frame mirrorless, 50mm at f/1.8" | Clean, shallow depth, neutral, professional |
| Crop-sensor DSLR (2008–2014 era) | "consumer DSLR, kit zoom at f/5.6, on-camera flash" | Flat frontal light, deeper DOF, mild CA, "family photo" energy |
| 35mm film SLR | "35mm film SLR, 50mm at f/2, Kodak Portra 400" | Grain, halation, rolled highlights, warm skin |
| Disposable / point-and-shoot film | "disposable film camera, fixed plastic lens, direct flash" | Heavy grain, vignetting, harsh flash falloff, color cast, corner softness |
| Medium format | "medium format digital, 80mm at f/2.8, 4:5 ratio" | Extreme tonal gradation, micro-contrast in skin, shallow-but-sharp |
| Camcorder / VHS frame grab | "frame grab from a Hi8 camcorder, interlaced" | Scan lines, chroma bleed, motion smear, low resolution |
| Security / CCTV | "ceiling-mounted security camera, wide angle, timestamp burn-in" | Overhead angle, IR cast, compression artifacts, extreme wide distortion |
| Webcam | "laptop webcam, 720p, screen-lit" | Soft, noisy, top-down slight angle, screen light as key |
| Drone | "drone camera, 24mm equivalent, 120m altitude" | Top-down or oblique aerial, deep focus, atmospheric haze |
| Action cam | "GoPro, ultra-wide, chest mount" | Barrel distortion, deep focus, high contrast, POV framing |

### 4.2 Focal length behavior — choose by *psychology*, not by "looks good"

| mm | Perspective effect | Use when |
|---|---|---|
| 14–20 | Extreme spatial exaggeration, corner stretching, near objects loom | Interiors, immersion, unease, scale |
| 24–28 | Environmental, mild distortion, "I was standing right there" | Documentary, reportage, lifestyle in context |
| 35 | The reportage standard — human-scale with context | Street, candid, editorial, journalism |
| 50 | Neutral, matches human central vision | Honest portraits, product, everyday |
| 85 | Mild compression, flattering facial geometry, background separation | Portraits, beauty, commercial |
| 105–135 | Strong compression, background becomes a soft flat plane | Editorial portrait, isolation |
| 200+ | Extreme compression, stacked layers, observed-from-distance feeling | Candid/paparazzi, sports, voyeuristic |

**Distortion note:** faces shot at 24mm gain nose size and lose ear visibility. Faces at 135mm flatten and widen slightly. State the focal length and the model applies the geometry. This is one of the strongest "real lens" signals available.

### 4.3 Aperture behavior

| f-stop | Behavior | Note |
|---|---|---|
| f/1.2–f/1.4 | Razor focus plane, ears already soft when eyes are sharp, heavy bokeh, purple fringing at edges | Add "focus falls off immediately behind the eyes" to make it read |
| f/1.8–f/2.8 | Clear separation, still readable environment | The commercial default |
| f/4–f/5.6 | Balanced, environment legible, subject still separated | Reportage, groups, travel |
| f/8–f/11 | Near-everything sharp, peak lens performance | Product, architecture, landscape |
| f/16–f/22 | Full-depth sharpness, light sources become starbursts, visible diffraction softness | Sun stars, deep scenes |

### 4.4 Shutter and ISO — the two most under-used realism levers

Almost no one specifies these. They are enormously effective.

**Shutter speed** encodes motion truth:
- `1/1000s` — frozen droplets, sharp hair strands mid-air, crisp sports action
- `1/250s` — normal handheld sharp
- `1/60s` — slight softness in moving hands, natural handheld shake
- `1/15s` — visible motion smear on limbs, sharp static background
- `1/4s` — heavy trailing blur on anything moving, ghosting
- `2s exposure on a tripod` — light trails, blurred crowd, static architecture sharp

**ISO** encodes noise truth:
- `ISO 100` — clean, no grain, needs bright light to be plausible
- `ISO 800` — faint luminance noise in shadow
- `ISO 3200` — visible chroma noise in shadows, slightly muddied blacks, reduced saturation
- `ISO 12800` — heavy noise, color speckle in dark regions, crushed detail

**Critical coherence rule:** the three must agree with the scene. `ISO 100` in a dim bar is physically impossible and the model will render a lie — evenly lit, noiseless, and fake. Dim scene → high ISO → noise. Bright scene → low ISO → clean. Fast action → fast shutter. Handheld night → slow shutter → some smear. **Exposure triangle coherence is one of the most powerful realism signals you can send.**

---

## 5. LAYER 2 — OPTICAL BEHAVIOR & CAPTURE ARTIFACTS

Real glass is imperfect and real capture is fallible. Pick **one** from this library per prompt (see §11 budget).

### 5.1 Lens artifacts
- Mild chromatic aberration — purple-green fringing on high-contrast edges
- Corner vignetting, natural falloff, not applied as a filter
- Coma smearing in corner point-lights (night scenes)
- Anamorphic horizontal flare streak from a bright source
- Veiling flare — a wash of low contrast where light hits the front element directly
- Soft corner resolution — center sharp, edges falling off
- Barrel distortion on straight lines near the frame edge (wide lenses)
- Focus breathing / slight front-focus — the eyelashes sharp, the pupils marginally soft

### 5.2 Capture artifacts
- Slight motion blur from handheld shake at slow shutter
- Camera tilt — horizon off by 2–3 degrees, uncorrected
- Subject clipped by the frame edge — a shoulder, the top of the head, half a hand
- Focus missed slightly — the ear is sharp, the eye is not
- Blown highlight rolling off in a window or lamp, no detail recovered
- Crushed shadow with no recoverable detail in one corner
- Autofocus grabbed the foreground object instead of the subject
- Flash falloff — subject correctly exposed, background dropping to black within two meters

### 5.3 Sensor & processing artifacts
- High-ISO chroma noise in the shadow regions
- JPEG compression blocking in flat gradient areas (sky, wall)
- Rolling shutter skew on a fast-moving element
- Over-sharpening halo around high-contrast edges (phone-processed look)
- Aggressive HDR tone mapping lifting shadows unnaturally (specify only if you want the phone look)
- Banding in a smooth gradient

### 5.4 Analog artifacts (film prompts only)
- Halation — red-orange bloom around bright highlights
- Grain concentrated in mid-tones and shadows, not highlights
- Light leak at one frame edge
- Dust and a single hairline scratch
- Frame edge / sprocket bleed
- Color shift from expired stock — magenta in shadow, cyan in highlight

> **Never mix film artifacts with digital artifacts.** Grain plus JPEG blocking plus HDR is an incoherent capture chain and the model will render a mush that reads as AI.

---

## 6. LAYER 3 — LIGHT PHYSICS

This is where 70% of realism lives. Never write "dramatic lighting," "beautiful light," "cinematic lighting." Those are outcome words. Write the physics.

### 6.1 The Mad Lib — mandatory in every prompt

> **"[SOURCE] from [DIRECTION + HEIGHT], causing [SHADOW BEHAVIOR] and [HIGHLIGHT BEHAVIOR], with [FALLOFF BEHAVIOR]."**

Example: *"A single bare bulb hanging above and slightly behind camera-right, casting a hard-edged shadow of the subject's arm across the tabletop, clipping the highlight on their forehead and the rim of the glass, with the far corner of the room falling to near-black within two meters."*

### 6.2 Source vocabulary (name a real object, not a lighting concept)

**Natural:** north-facing window · a gap in blinds throwing hard slats · direct 4pm sun through a doorway · overcast sky as a giant softbox · sun reflected off a white wall opposite · dappled light through leaves · open shade under an awning · moonlight (blue, very low, almost no fill)

**Domestic/practical:** table lamp with a warm shade · overhead kitchen fluorescent · fridge interior light · television glow · phone screen underlighting the face · candle · fireplace · headlights sweeping past · streetlight sodium-orange · neon signage in two colors · exit sign green · car interior dome light · laptop screen

**Professional:** single softbox 45° camera left, no fill · beauty dish above, silver reflector below · bare strobe with grid for hard falloff · large scrim diffusing hard sun · bounced flash off a low ceiling · on-camera direct flash · ring light (specify: circular catchlight, flat frontal, shadow ring behind the subject on a nearby wall)

### 6.3 Direction and its meaning

| Direction | Renders as |
|---|---|
| Frontal (on-axis) | Flat, shadowless, snapshot/flash aesthetic, kills texture |
| 45° key (Rembrandt) | Triangle of light on the shadow-side cheek — the classic portrait |
| 90° side (split) | Half the face lit, half in darkness, maximum texture reveal |
| Backlight / contre-jour | Rim glow on hair and shoulders, face falls into shadow, atmospheric haze becomes visible |
| Top-down | Deep eye sockets, shadow under nose and chin, interrogation/harsh |
| Underlight | Inverted natural shadows, unsettling, screen-lit or firelit |
| Overhead-behind (rim) | Separation halo, subject lifted off the background |

### 6.4 Contrast ratio — state it numerically

- `1:1` flat and even — catalog, beauty, clinical
- `2:1` gentle modeling — lifestyle, editorial soft
- `3:1` professional portrait standard
- `4:1` dramatic, fashion, cinematic
- `8:1+` noir, deep shadow, one-source-no-fill

**Add "no fill light" explicitly** when you want real single-source behavior. Models love adding invisible fill. Say no.

### 6.5 Color temperature and mixed light

- 1800K candle/match · 2700K tungsten · 3200K warm practical · 4000K neutral fluorescent · 5500K daylight · 6500K overcast · 8000K+ open shade / blue hour

**Mixed temperature is the single most photographic lighting condition.** Real interiors have a warm lamp and a cool window at the same time. State both:
> *"Warm 2700K lamp light on the near side of the face, cool 6500K dusk window light on the far side, the two meeting along the jawline."*

### 6.6 Falloff — always state it

Inverse-square is invisible to the model unless you demand it:
- "Light falls off sharply — the background two meters behind is three stops darker"
- "Only the subject's hands and the tabletop are lit; everything beyond is black"
- "Exposure is set for the highlights; the shadows are allowed to go fully black"

### 6.7 Presets (drop-in ready)

**Indoor daylight, honest:** *Single north-facing window at camera left, 1.5 meters from the subject; soft-edged shadow wrapping to the right side of the face, one warm bounce from a pale wooden floor filling the underside of the jaw, no artificial fill, 3:1 ratio, background falling a stop and a half darker.*

**Night phone flash:** *Direct on-camera flash, harsh and frontal; specular highlights clipping on forehead, nose and cheekbones; hard shadow of the subject thrown onto the wall behind them; background dropping to black within two meters; high-ISO chroma noise in the shadow regions; distant streetlights as small hexagonal bokeh.*

**Golden hour backlight:** *Low sun from behind camera-right at 15° above the horizon, thin gold rim wrapping the hair and shoulder edge, face in open shadow lit only by skylight, dust and humidity in the air catching the beam, mild veiling flare washing the lower left corner, exposure held for the face so the sky clips.*

**Overcast documentary:** *Heavy overcast sky as an omnidirectional soft source; soft shadows directly beneath the subject only; flat 1.5:1 contrast; slightly cool 6500K cast; no specular highlights except a faint wet sheen on the pavement.*

**Neon night:** *Magenta signage at camera left and cold cyan streetlight from above-right, the two colors meeting across the subject's face; wet asphalt reflecting both as vertical smears; deep unfilled black in the doorway behind; ISO 6400 noise visible throughout the shadows.*

**Screen-lit interior:** *Laptop screen as the only source, 40cm from the face at chest height, underlighting the jaw and eye sockets, cool 7000K, falling off completely past the shoulders, the room behind resolving only as vague dark shapes.*

---

## 7. LAYER 4 — SUBJECT BEHAVIOR

### 7.1 The prohibition list

Never write: *posing · looking confidently at camera · smiling warmly · arms crossed powerfully · standing proudly · perfect posture · model-like · beautiful woman · handsome man · flawless.*

These summon stock photography, which is the second-most-common realism failure after flat lighting.

### 7.2 Direct the body, not the face

Replace expression words with physical facts:

| Instead of | Write |
|---|---|
| "confident" | "weight on the back foot, one hand resting in a pocket, shoulders dropped and loose" |
| "happy" | "mid-laugh, eyes crinkled almost shut, head tipped slightly back, one hand coming up toward the mouth" |
| "thoughtful" | "gaze fixed at a point off-frame left, jaw slack, thumb pressed against the lower lip" |
| "tired" | "shoulders forward, chin dropped, one elbow bearing weight on the counter" |
| "focused" | "leaning in past comfortable distance, both hands occupied, mouth slightly open in unconscious concentration" |

### 7.3 The one-second-ago rule

Describe what happened immediately before the shutter fired. This forces the model to render a *moment* rather than a *pose*.
> *"They have just turned toward a sound off-frame; their hands are still holding the previous task."*

### 7.4 Candid state library
- Mid-stride, weight fully committed to one foot, opposite arm swinging forward
- Caught between expressions — neither smiling nor neutral
- Eyes closed on a blink
- Half-turned away, only a three-quarter view of the face available
- Talking, mouth mid-word, hands raised in gesture
- Adjusting something — a sleeve, a strap, hair behind an ear
- Unaware, absorbed in a task, camera not acknowledged
- Reacting to someone off-frame, not to the lens

### 7.5 Micro-truths that sell a human
- Hair not all in place — a few strands off, one lifted by air
- Clothing not perfectly arranged — collar slightly askew, sleeve pushed up unevenly
- Asymmetric face — real faces are not mirrored
- Skin at rest — nasolabial folds, forehead lines under expression, natural under-eye shadow
- Hands doing something specific, with visible tension or slackness in the fingers
- Contact with the world — feet with weight in them, a hand pressing a surface hard enough to flatten flesh

### 7.6 Faces and identity consistency
- When face consistency across a series matters and no face-swap step exists, **hide or soften the face**: over-shoulder, turned away, eyes closed, backlit into shadow, cropped at the brow. This simultaneously solves drift and increases viewer projectability.
- When the face must be visible and consistent: lock a short physical description string (age, build, hair, distinguishing features) and repeat it verbatim across prompts. Do not paraphrase it between generations.
- For true likeness, the correct pipeline is: generate the base image → dedicated face-swap tool for the identity layer. Prompt-only likeness has a hard ceiling.

---

## 8. LAYER 5 — SPATIAL EVIDENCE

The camera occupied a physical position in a real space. Prove it.

### 8.1 Foreground obstruction (highest-value single technique in this document)

Something must intrude at the frame edge, out of focus. This alone converts an "AI render" into a "photo taken by a person" more reliably than any other addition.

- A doorframe edge, dark and blurred, occupying the left ten percent of the frame
- A plant frond crossing the lower-right corner, badly out of focus
- Someone's shoulder in the near foreground, cut off by the frame
- Shooting through a gap between two people's heads
- A car window frame and slight glass reflection
- A hanging light fixture clipping the top edge
- A hand or forearm at the bottom of the frame, not the subject's
- Chain-link mesh softened almost to nothing directly against the lens

### 8.2 Background specificity — replace every generic noun

| Generic (banned) | Specific (required) |
|---|---|
| urban background | a stained concrete wall with three layers of torn flyers and a faded blue spray tag |
| a kitchen | worn butcher-block counter, a chipped enamel kettle, a dish towel over the oven handle, one cabinet door not fully closed |
| a cafe | a scratched laminate table with two overlapping coffee rings, a folded receipt under the saucer, a radiator under the window |
| an office | a desk with a monitor cable sagging behind it, a dead succulent, a stack of unfiled paper, ceiling tiles with one water stain |
| outdoors | a gravel lot behind a hardware store, weeds through the seams, a bent no-parking sign |
| a bedroom | duvet pulled up but not made, a phone charger cable across the sheet, blackout curtain leaving a bright vertical gap |

### 8.3 Environmental atmosphere
- Dust visible in a light shaft
- Steam or condensation, especially on glass near a heat source
- Humidity softening distant edges
- Heat shimmer over a surface
- Smoke drifting through a beam
- Cold-air breath vapor
- Rain on glass with distortion of what's behind it
- Fingerprints and smears on a window

### 8.4 Time evidence
The world should look *used*. Mail on a counter, worn floor finish in traffic paths, sun-faded fabric on one side only, scuffed door edges near the handle, a cable routed badly because it was routed once and never fixed.

---

## 9. LAYER 6 — MATERIAL TRUTH

Describe how surfaces *behave*, not what color they are. Materials are where "AI plastic" is born and killed.

| Material | Must exhibit | Prompt phrasing |
|---|---|---|
| **Skin** | Pores, sebum shine on nose/forehead/cheekbones, subsurface scattering (red at ear edges, nostrils, fingertips), unevenness, fine vellus hair | "visible pores and natural sebum shine on the nose and forehead, subsurface warmth where light passes through the ear, uneven natural tone, no retouching, no beauty smoothing" |
| **Glass** | Both reflection AND refraction, edge caustics, thickness at rims | "the glass both reflects the window and bends the tabletop behind it, a bright caustic pooling on the surface beneath, visible thickness at the rim" |
| **Polished metal** | Sharp specular points, mirror-reflects the environment including the photographer's light | "tight specular highlights along the edge, the softbox visible as a distinct rectangular reflection, faint fingerprint smudge near the base" |
| **Brushed metal** | Directional anisotropic sheen along the grain, no sharp points | "soft directional sheen running with the brush grain, no mirror reflection, matte in shadow" |
| **Fabric (woven)** | Weave visible at scale, weight-appropriate drape, folds where the body bends | "visible cotton weave at close range, drape falling with real weight, compression wrinkles at the elbow crease, slight pilling at the shoulder" |
| **Leather** | Creases at flex points, patina, edge wear, uneven sheen | "deep creases across the vamp, worn lighter at the toe, the finish darker where hands have touched it" |
| **Wood** | Grain direction, knots, finish behavior | "open oak grain catching the raking light, one knot near the edge, oiled finish with a low sheen not a lacquer gloss" |
| **Concrete** | Aggregate texture, cracks, staining, patch repairs | "exposed aggregate, a hairline crack running diagonally, a dark water stain spreading from the base" |
| **Ceramic/glaze** | Slight glaze pooling, uneven rim, tiny surface irregularities | "glaze pooling darker at the base, a faint kiln speck, the rim not perfectly circular" |
| **Paper** | Fiber texture, edge wear, non-flatness | "slight cockling from humidity, a soft-worn corner, visible fiber at the torn edge" |
| **Water** | Surface tension curvature, meniscus, caustics, refraction, motion | "a meniscus curving up the glass wall, caustic light patterns thrown onto the wood, surface still moving from the last pour" |
| **Food** | Moisture, temperature evidence, irregularity, imperfect plating | "steam rising off the surface, oil pooling unevenly, one edge caught darker than the rest, crumbs on the plate rim" |

**Frozen-water warning:** AI renders liquid in motion as glassy sculpture. If a pour, splash, or steam is in frame, explicitly demand motion truth: "the pour is in motion, the stream slightly irregular, caught at 1/1000s with the leading droplets separating."

---

## 10. LAYER 7 — COLOR SCIENCE

Never write "vibrant colors" or "beautiful color grading." Name a response curve.

### 10.1 Film stock signatures
- **Kodak Portra 400** — warm, forgiving skin, desaturated shadows, gentle highlight roll-off, subtle halation. The default for warm human work.
- **Kodak Gold 200** — golden cast, nostalgic, slightly muddy shadows, consumer-snapshot warmth.
- **Fuji Pro 400H** — cool-neutral, green-leaning shadows, pastel highlights, airy.
- **Cinestill 800T** — tungsten-balanced, blue daylight, red halation blooming around every light source. Night neon signature.
- **Fuji Velvia 50** — supersaturated, high contrast, deep blacks, punchy landscapes, unflattering to skin.
- **Ilford HP5 400 B&W** — moderate grain, forgiving mid-tones, classic reportage.
- **Kodak Tri-X 400 B&W** — gritty grain structure, high contrast, street photography canon.
- **Expired stock** — magenta shadows, cyan highlights, unpredictable shifts, reduced contrast.

### 10.2 Digital grade language
- "Neutral, straight-out-of-camera, no grade applied" (the most underused and most realistic option)
- "Lifted shadows with a slight blue cast, highlights held, low-contrast filmic curve"
- "Teal-orange separation: cool ambient, warm skin, desaturated midtones"
- "Warm-neutral, saturation slightly under 100%, blacks not fully crushed"
- "Cool clinical, near-neutral whites, minimal saturation, high micro-contrast"
- "Faded blacks and milky shadows, slight halation, low saturation"

### 10.3 Palette discipline
State 3–5 colors and their relationship. "A restrained palette: deep forest green, warm cream, aged brass, with a single periwinkle accent — no color outside this range." A named, bounded palette is one of the fastest routes to a professional look and the only reliable route to consistency across a series.

---

## 11. LAYER 8 — THE IMPERFECTION BUDGET

**The rule: 2 imperfections. Maximum 3. Never more.**

Spend them across *different categories*, never two in the same one:

1. **Capture** (one of: shake blur, tilt, edge crop, missed focus, blown highlight)
2. **Optical** (one of: CA, vignetting, flare, corner softness)
3. **Material** (one of: skin texture, scratch, wear, wrinkle, smudge)
4. **Environmental** (one of: clutter, dust, stain, disorder)

Suggested budgets:
- **Editorial / commercial realism:** 1 capture + 1 material
- **Documentary / candid:** 1 capture + 1 environmental
- **Product realism:** 1 material + 1 optical
- **Phone snapshot:** 1 capture + 1 optical (and let the lighting be ugly)

**Anti-perfection vocabulary to include:**
"not perfectly framed" · "no retouching" · "no beauty processing" · "not styled" · "unarranged" · "no fill light" · "imperfect exposure" · "slightly off-level" · "real-world wear, not showroom condition"

---

## 12. ASSEMBLY ORDER (WORD ORDER MATTERS)

Most models weight early tokens more heavily. Build in this sequence. Deviating from it reliably degrades output.

```
1. MEDIUM & CAPTURE      "A handheld 35mm film photograph, shot on a Nikon FM2 at f/2, 1/60s, Portra 400."
2. SUBJECT & ACTION      "A woman in her sixties reaching across a counter to close a window, mid-motion."
3. ENVIRONMENT           "In a narrow galley kitchen with worn butcher-block counters and one cabinet door ajar."
4. LIGHT                 "Late afternoon sun through the window at camera right, hard-edged, throwing the frame's shadow across her forearm, the far wall three stops down, no fill."
5. COMPOSITION & ANGLE   "Shot from just inside the doorway at chest height, subject on the right third, doorframe blurred across the left edge of the frame."
6. MATERIAL DETAIL       "Visible pores and sebum shine on her cheekbone, the wood grain of the counter raking in the low light, a dish towel wrinkled where it hangs."
7. COLOR                 "Warm 3200K light against cool shadow, Portra's desaturated shadows and gentle highlight roll-off."
8. IMPERFECTION          "Slight motion blur in her reaching hand, horizon a degree off level."
9. INTENT                "The image should feel like an unremarkable moment someone happened to record."
10. GUARDS & PARAMS      "No posing, no beauty retouching, no added fill light, anatomically correct hands. --ar 4:5 --style raw"
```

### 12.1 Length discipline
- **Midjourney:** 60–110 words. Beyond ~120 the tail dilutes. Front-load.
- **Flux / SD3 / natural-language models:** 120–250 words. They reward full prose and long-form specificity.
- **DALL·E / GPT-image:** 80–200 words of natural prose. It rewrites internally regardless; write clean declarative sentences.
- **SDXL (tag-based ComfyUI workflows):** comma-separated weighted tags, not prose. Convert (§14.4).

---

## 13. SCENARIO TEMPLATES

Each is a fill-in skeleton already ordered per §12.

### 13.1 Hyperreal candid portrait
> A handheld [CAMERA] photograph, [LENS]mm at f/[X], 1/[X]s, ISO [X]. [SUBJECT: age, build, hair, clothing] is [SPECIFIC MID-ACTION], unaware of the camera, [ONE-SECOND-AGO CONTEXT]. The setting is [HYPER-SPECIFIC PLACE with 3 concrete objects]. [LIGHT SOURCE] from [DIRECTION], causing [SHADOW BEHAVIOR] and [HIGHLIGHT BEHAVIOR], with [FALLOFF]; no fill light. Shot from [HEIGHT/ANGLE], [FRAMING], with [FOREGROUND OBSTRUCTION] blurred across the [EDGE]. Skin shows visible pores and natural sebum shine with no retouching; [SECOND MATERIAL BEHAVIOR]. [COLOR/STOCK]. [ONE CAPTURE FLAW]. The image should feel [INTENT]. No posing, no beauty smoothing, no added fill, anatomically correct hands.

### 13.2 Hyperreal product (editorial, not catalog)
> A [MEDIUM] product photograph, [LENS]mm at f/[8–11], [DEVICE]. [PRODUCT with exact material description] sits [SPECIFIC PLACEMENT, not centered] on [SURFACE with texture detail]. [LIGHT: single source, modifier, direction], producing [SHADOW: direction, edge quality, length] and [SPECULAR BEHAVIOR on the product's material]; background falls [X] stops darker. Composed [RULE], with [NEGATIVE SPACE], shot from [ANGLE]. The [MATERIAL] shows [PHYSICALLY CORRECT BEHAVIOR — refraction/anisotropy/drape] and [ONE HONEST WEAR DETAIL]. Palette: [3 COLORS]. [ONE OPTICAL FLAW]. Mood: [2–4 WORDS]. No showroom sterility, no floating shadow, no CGI-perfect surfaces, no readable text or logos.

### 13.3 Phone-snapshot realism (maximum "found photo" effect)
> A casual photo taken on an [PHONE MODEL], main camera, computational HDR, held [HOW]. [SUBJECT DOING SOMETHING UNGLAMOROUS] in [SPECIFIC PLACE with mundane clutter]. Lit only by [PRACTICAL SOURCE] from [DIRECTION]; the exposure is not ideal — [WHAT IS OVER OR UNDEREXPOSED]. Framing is careless: [OFF-CENTER / TILTED / EDGE-CLIPPED]. [FOREGROUND INTRUSION]. Visible sensor noise in the shadows, mild over-sharpening at high-contrast edges. Nothing is styled or arranged. It looks like a photo taken to remember something, not to be seen. No retouching, no professional lighting, no artistic composition.

### 13.4 Cinematic still (photoreal, not "cinematic vibe")
> A frame from a [FORMAT: 35mm anamorphic / Super 16 / Alexa digital] production, [LENS]mm at f/[X], [ASPECT]. [SUBJECT + ACTION] in [ENVIRONMENT]. Key: [SOURCE] from [DIRECTION] at [RATIO], practical [SECOND SOURCE] in frame at [POSITION] providing motivation. [SHADOW + HIGHLIGHT BEHAVIOR]. Composed [ANGLE + FRAMING] with [FOREGROUND / MIDGROUND / BACKGROUND layers named]. Grade: [PALETTE + CURVE]. Atmosphere: [HAZE / SMOKE / DUST]. [ONE OPTICAL ARTIFACT — flare or CA]. Emotional register: [3–5 WORDS]. No modern digital sharpness, no HDR, no symmetrical framing.

### 13.5 Interior / architectural realism
> A [TIME OF DAY] photograph of [SPECIFIC SPACE], [WIDE LENS]mm at f/[8–11] on a tripod, verticals corrected. Light enters via [OPENING] at [DIRECTION], throwing [SHADOW SHAPE] across [SURFACE]; the room's far side sits [X] stops down; one warm practical at [POSITION] adds a second temperature. [MATERIALS: floor, wall, textile — each with behavior]. Signs of use: [3 SPECIFIC LIVED DETAILS]. Composed [PERSPECTIVE RULE], [FOREGROUND ELEMENT] anchoring the near frame. Palette: [COLORS]. Mood: [INTENT]. No HDR, no fisheye distortion, no staged magazine styling, no empty perfection.

### 13.6 Street / documentary
> A [35]mm reportage frame, handheld, f/[5.6], 1/[250]s, ISO [400]. [SUBJECT, described by clothing and posture rather than beauty] [ACTION] on [EXACT LOCATION with signage, surface, and weather]. Available light only: [SOURCE + DIRECTION + WEATHER CONDITION], [SHADOW BEHAVIOR]. Shot from [WAIST/EYE HEIGHT] at [DISTANCE], the frame [IMPERFECTLY COMPOSED — clipped element, tilt, or a second figure half-entering]. [FOREGROUND OBSTRUCTION]. [FILM STOCK OR NEUTRAL DIGITAL]. Nothing arranged; the photographer had one frame and took it. No staged composition, no eye contact, no retouching.

### 13.7 Food realism
> A [MEDIUM] photograph of [DISH, described by texture and temperature], [LENS]mm at f/[2.8–4], shot from [ANGLE — 45° / overhead / near-level]. Light: [WINDOW/SINGLE SOURCE] from [BACK or SIDE — never frontal], producing [SPECULAR MOISTURE HIGHLIGHTS] and [SOFT-EDGED SHADOW falling toward camera]. The food shows [STEAM / OIL SHEEN / IRREGULAR EDGE / CRUMB SCATTER] — served, not styled. Surface: [MATERIAL with wear]. One imperfection: [A DRIP, A FINGERPRINT ON THE PLATE RIM, A CRUMPLED NAPKIN]. Palette: [COLORS]. No glossy commercial food-styling, no perfect symmetry, no plastic sheen.

---

## 14. TOOL TRANSLATION

The same Master Prompt must be re-expressed per engine. Same content, different syntax.

### 14.1 Midjourney
- Prose, front-loaded, 60–110 words.
- `--style raw` is near-mandatory for photorealism (removes MJ's default aesthetic push).
- `--ar` for ratio, `--s 0` to `--s 100` to suppress stylization, `--chaos 0` for consistency.
- Use `--no` sparingly for genuine exclusions; MJ handles negatives better than DALL·E but still imperfectly.
- Image prompts + `--cref` / `--sref` for character and style consistency across a series.

### 14.2 Flux
- Rewards long natural language. 150–250 words is productive, not wasteful.
- Excellent at exposure-triangle coherence and at rendering legible text.
- Handles spatial relationship language ("behind and to the left of") more reliably than most.
- Push realism through capture specs rather than through quality adjectives.

### 14.3 DALL·E / GPT-image
- **Native max aspect ratio is 3:1.** Wider banners require generate-then-crop.
- **Negative prompts backfire.** The model latches onto forbidden nouns. Never write "no clowns" — it will render a clown. Convert every exclusion into a positive statement of what *is* present:
  - ✗ "no text, no logos" → ✓ "all surfaces blank and unmarked"
  - ✗ "not smiling" → ✓ "a neutral resting expression"
  - ✗ "no clutter" → ✓ "a clear, sparse surface with a single object"
- Reference images are internally converted to text descriptions; true face conditioning requires a separate face-swap step.
- Brand label text renders garbled — plan for a clean plate and a label composited in post.

### 14.4 SDXL / ComfyUI (tag syntax)
Convert prose to weighted tags:
```
RAW photo, (35mm film photograph:1.2), Nikon FM2, 50mm f/2, Portra 400,
woman 60s reaching across counter, mid-motion, candid, unaware,
galley kitchen, worn butcher block, cabinet ajar,
hard afternoon window light camera right, single source, no fill, 3:1 ratio,
(visible skin pores:1.2), (natural skin texture:1.3), sebum shine,
film grain, slight motion blur, off-level horizon,
(subsurface scattering:1.1), warm 3200K
Negative: 3d render, cgi, illustration, smooth skin, airbrushed, plastic,
symmetrical, studio lighting, oversaturated, hdr, watermark, text, extra fingers
```
- Weights: `(term:1.1–1.4)` to emphasize, `(term:0.6–0.9)` to suppress.
- SDXL uses true negative prompts — put exclusions there, not in the positive.

### 14.5 Nano Banana / Gemini image editing
- Strongest as a **surgical repair tool**, not a from-scratch generator.
- Give it one instruction per pass: "Repair the left hand — five anatomically correct fingers, matching the existing lighting direction and skin tone."
- Preserve-language matters: "Change nothing else. Preserve the existing grain, color grade, and framing exactly."
- Repair beats re-roll: a strong image with one broken element is worth more than a fresh generation.

---

## 15. SERIES CONSISTENCY

For any multi-image set, generate the **anchor image first**, then reference it.

**Consistency anchor block (append to every subsequent prompt):**
> Match Image 1 exactly in: light source, direction, quality and ratio; color palette and grade; camera, lens and aperture; distance and framing approach; and [SPECIFIC MATERIAL/WARDROBE/SUBJECT DETAILS]. Only [WHAT CHANGES] is different.

**The over-locking trap:** locking composition *too* tightly produces "the same image with one thing moved" — technically consistent, emotionally dead. A series needs differentiation in **posture, camera distance, and time of day**, not just props. Lock the *system*; vary the *moment*.

**Differentiation levers for avatar/persona sets** — use all five together, never one alone: ethnicity, hair, wardrobe, setting, color grade.

---

## 16. THE 6-LAYER DIAGNOSIS

When an image fails, run this in order and stop at the first genuine failure. Fix one layer. Regenerate. Do not rewrite the whole prompt.

1. **Intent** — Does it do its job? Would the target audience feel the target emotion?
2. **Composition** — Is the focal point unambiguous? Does the eye travel correctly? Any accidental distraction? Is it *too* well composed?
3. **Light** — One believable source? Consistent direction across every object? Correct falloff? Any shadow pointing the wrong way?
4. **Subject credibility** — Real and specific, or AI-averaged? Is the behavior physically plausible? Do the hands have weight?
5. **Material reality** — Does glass refract, skin have pores, metal reflect, fabric drape? Anything plastic or waxy?
6. **Style alignment** — Has it drifted from the intended DNA?

**Then deliver:**
- The single biggest gap
- The repair using **Keep / Repair / Change / Protect / Remove**
- The corrected Master Prompt

---

## 17. FAILURE → FIX LOOKUP

| Symptom | Failing layer | Fix |
|---|---|---|
| "Looks AI but I can't say why" | Light | Almost always ambient global illumination. Name one source, one direction, add "no fill light," add falloff in stops. |
| Waxy, poreless, airbrushed skin | Material | "Visible pores, natural sebum shine on nose and forehead, uneven tone, fine vellus hair, no retouching, no beauty smoothing." |
| Everything is in focus | Capture | State aperture and a focus point: "f/1.8, focus on the near eye, the far ear already soft." |
| Too clean, too tidy, showroom | Environment | Add three specific used-world details plus one environmental imperfection. |
| Subject looks like a model | Subject | Remove all expression words; direct body mechanics and a one-second-ago action. Add "unaware of the camera." |
| Composition feels sterile | Composition | Add a foreground obstruction, break symmetry, clip something at the frame edge, tilt 2°. |
| Colors feel synthetic | Color | Name a film stock or a bounded palette; add "saturation slightly below 100%, blacks not fully crushed." |
| Plastic-looking product | Material + Light | Specify specular behavior and let the studio light *appear* in the reflection. Add one honest wear mark. |
| Broken hands/anatomy | Guards | Add explicit anatomical guards; then repair the region with an editing model rather than re-rolling. |
| Liquid looks like glass sculpture | Material | Demand motion: shutter speed, irregular stream, separating droplets, surface still moving. |
| Night scene looks like day with a blue filter | Light | High ISO, visible noise, hard falloff to black, practical sources in frame, clipped highlights around lamps. |
| Series subjects drift between images | Consistency | Anchor image first; verbatim repeated description string; hide/soften faces; or add a face-swap pass. |
| Text renders garbled | Tool limit | Generate a clean plate; composite type in post. Do not fight it in prompt. |

---

## 18. THE PHRASE BANK

Drop-in language, tested and reusable.

**Capture reality:** "handheld at 1/60s with slight shake" · "the horizon a degree off level" · "the top of the head clipped by the frame" · "autofocus grabbed the foreground" · "exposed for the highlights, shadows allowed to go black" · "shot from the hip without looking through the viewfinder"

**Light reality:** "no fill light" · "the background falls three stops darker" · "a hard-edged shadow with a defined perimeter" · "one warm practical and one cool window meeting along the jaw" · "the highlight on the forehead is clipped and unrecoverable" · "light falls off to nothing within two meters" · "dust visible in the beam"

**Skin reality:** "visible pores across the cheek and nose" · "natural sebum shine on the T-zone" · "subsurface warmth glowing through the ear edge" · "uneven natural tone, no retouching" · "fine vellus hair catching the rim light" · "expression lines at rest"

**Subject reality:** "unaware of the camera" · "mid-motion, weight committed to the front foot" · "caught between expressions" · "hands occupied with a task" · "just turned toward a sound off-frame" · "not posed, not styled, not arranged"

**Space reality:** "an out-of-focus doorframe across the left edge" · "shot through a gap between two people" · "a stained wall with three layers of torn flyers" · "one cabinet door not fully closed" · "a cable routed badly and never fixed"

**Material reality:** "the glass both reflects and refracts" · "specular highlights tight along the polished edge" · "drape falling with real weight" · "compression wrinkles at the elbow crease" · "worn lighter where hands have touched it"

**Anti-perfection guards:** "no beauty processing" · "no HDR" · "no studio sterility" · "no stock-photo styling" · "no perfect symmetry" · "no showroom cleanliness" · "no AI-averaged aesthetic" · "not perfectly framed" · "anatomically correct hands, five fingers per hand" · "no visible text, logos, or watermarks"

---

## 19. PRE-FLIGHT CHECKLIST

Run before releasing any hyperreal prompt. Every line must be answerable.

- [ ] Is a specific **device** named?
- [ ] Are **focal length and aperture** stated?
- [ ] Are **shutter and ISO** stated, and are all three physically coherent with the scene's brightness?
- [ ] Is there exactly **one primary light source**, with **direction**, **shadow behavior**, **highlight behavior**, and **falloff**?
- [ ] Is "**no fill light**" present where single-source realism is wanted?
- [ ] Is the subject **unaware / mid-action**, with body mechanics rather than expression words?
- [ ] Is there a **foreground obstruction**?
- [ ] Has every **generic noun** been replaced with a specific one (min. 3 concrete background objects)?
- [ ] Is **skin/material behavior** described physically?
- [ ] Is a **film stock or bounded palette** named?
- [ ] Are there exactly **2 imperfections**, from **different categories**?
- [ ] Are the **anatomical and anti-perfection guards** appended?
- [ ] Are **tool-specific parameters** correct, and have negatives been **converted to positives** if the target is DALL·E?
- [ ] Does the prompt follow the **§12 assembly order**?
- [ ] Would a stranger, shown the result, be able to say **who took this and why**?

---

## 20. WORKED EXAMPLES

### Example A — Candid portrait (film)

**Brief:** Woman in her thirties, home coffee ritual, brand lifestyle content, warm and unperformed.

> A handheld 35mm film photograph on a Nikon FM2, 50mm at f/2, 1/60s, Kodak Portra 400. A woman in her early thirties, hair pushed back and half-falling loose, wearing a stretched-out cotton sweater, stands at a kitchen counter with both hands wrapped around a ceramic mug, head tipped slightly down, mid-blink — she has just set the kettle back on the stove. The kitchen is narrow and lived-in: worn butcher-block counter with two overlapping coffee rings, a chipped enamel kettle, one cabinet door not fully closed, a dish towel wrinkled over the oven handle. Morning sun enters through a window at camera right, hard-edged, throwing the window frame's shadow across her forearm and the counter; the far side of the room falls two and a half stops darker; no fill light. Shot from just inside the doorway at chest height, subject on the right third, the dark blurred edge of the doorframe crossing the left tenth of the frame. Visible pores and natural sebum shine on her cheekbone and nose, no retouching; the oak grain rakes in the low sun; steam curls off the mug. Portra's desaturated shadows and gentle highlight roll-off, warm 3200K against cool shadow. Slight motion blur in her left hand; the horizon sits a degree off level. It should feel like an ordinary morning someone happened to record. No posing, no beauty smoothing, no added fill, anatomically correct hands. `--ar 4:5 --style raw --s 50`

**Why it works:** exposure triangle is coherent (bright window, f/2, 1/60, film stock); one source with named falloff and no fill; behavior is mid-action with a one-second-ago cause; background carries four specific objects; two imperfections from two categories (capture blur + tilt); skin behavior explicit; stock named.

---

### Example B — Product editorial (glass)

> An editorial product photograph, medium format digital, 80mm at f/9, on a tripod. A heavy glass apothecary bottle with a matte brass cap sits slightly right of center on a slab of raw coquina stone, its pitted surface catching the light. A single gridded strobe through a small softbox sits high at camera left, forty degrees off axis, producing one hard-edged shadow falling long to the lower right and a tight vertical specular running the bottle's left shoulder; a black flag on camera right keeps the opposite edge unfilled and dark. The glass both mirrors the softbox as a distinct rectangle and refracts the stone behind it, throwing a bright caustic pool onto the slab; the brass cap shows a soft anisotropic sheen along its machining grain and one small handling mark near the rim. Background is a deep unlit charcoal falling four stops below the product. Composed with generous negative space to the right. Palette restricted to warm cream, coquina grey, and aged brass. Faint corner vignetting from the lens, uncorrected. Mood: restrained, material, expensive. All surfaces blank and unmarked. `--ar 4:5 --style raw`

**Why it works:** light is named as physical hardware including the flag; the glass gets both required behaviors plus caustics; the brass gets anisotropy plus one wear mark; falloff stated in stops; exclusions converted to positive ("blank and unmarked"); imperfection budget is exactly two (handling mark + vignetting).

---

### Example C — Phone snapshot (found-photo realism)

> A casual photo taken on an iPhone 13, main camera, computational HDR, held one-handed and slightly too low. A man in his fifties with a salt-and-pepper beard crouches beside an open dishwasher, one arm inside it, head turned toward whoever is speaking off-frame. The kitchen is unstyled: a crowded counter, a cereal box left open, a folded utility bill under a set of keys, a dish rack half-loaded. The only light is a single overhead ceiling fixture almost directly above him, cool and unflattering, hollowing his eye sockets and putting a small hard shadow under his chin; the corners of the room fall dark. Framing is careless — his shoulder is clipped by the right edge and the counter runs out of the top of the frame at an angle. A blurred chair back intrudes at the lower left. Visible sensor noise in the shadow areas and mild over-sharpening along the cabinet edges. Nothing is arranged. It looks like a photo taken to show someone a problem, not to be looked at. No retouching, no professional lighting, no artistic composition.

**Why it works:** it commits to *bad* photography, which is what actual photographs mostly are. Top light is deliberately unflattering. Framing errors are specific rather than generic. The stated purpose ("to show someone a problem") explains the aesthetic and disciplines every choice.

---

## 21. MINIMUM VIABLE INPUT

When operating as a prompt engine, this document expands minimal briefs. The required input from a user is only:

> **Subject + Core action/state + Key context + Desired emotion**

Examples:
- "Man in his fifties fixing a bike in a garage, late afternoon, quiet competence."
- "Amber candle on a bathroom ledge, steam in the air, luxurious calm."
- "Teenage girl waiting at a bus stop in rain, alone but not sad."

Everything else in this document is applied automatically. Output in the Master Prompt format: **Visual Target → Master Prompt → Consistency Anchors → Variations → Adjust-a-layer menu.**

---

## 22. THE ONE-LINE SUMMARY

> **Do not describe what the image looks like. Specify the camera, the light, the moment, the materials, and the two things that went wrong.**

*End of document.*
