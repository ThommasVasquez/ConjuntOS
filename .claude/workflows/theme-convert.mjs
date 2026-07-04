export const meta = {
  name: 'theme-convert-landing',
  description: 'Make every ConjuntOS landing component work in both light and dark theme',
  phases: [
    { title: 'Convert', detail: 'one agent per component swaps hardcoded colors for theme tokens' },
    { title: 'Verify', detail: 'adversarial pass: catch remaining hardcoded colors + contrast issues' },
  ],
}

const DIR = 'src/components/landing'
const FILES = [
  'src/app/page.tsx',
  `${DIR}/Navbar.tsx`,
  `${DIR}/Hero.tsx`,
  `${DIR}/FeaturesCollage.tsx`,
  `${DIR}/StorySection.tsx`,
  `${DIR}/CraftsmanshipSection.tsx`,
  `${DIR}/TeamSection.tsx`,
  `${DIR}/ProductsSection.tsx`,
  `${DIR}/BentoFeatures.tsx`,
  `${DIR}/ShowcaseSection.tsx`,
  `${DIR}/FaqSection.tsx`,
  `${DIR}/Footer.tsx`,
]

const SPEC = `
You are converting ONE file of the ConjuntOS landing so it looks correct in BOTH the light and dark theme.
The theme flips CSS variables via a \`.light\` / \`.dark\` class on <html>. Tailwind semantic tokens already exist and flip automatically:
  bg-primary        -> page/section background (#000 dark / #fff light)
  bg-primary-light  -> elevated card background
  text-text         -> primary text (#fff dark / #000 light)
  text-text-muted   -> near-primary muted text
  border-border     -> subtle theme border
  bg-accent / text-on-accent -> solid accent button (inverts per theme)
  text-accent       -> accent-colored text/detail

EXACT MAPPINGS (apply to className strings AND inline style color values):
- bg-[#000000] | bg-black | bg-[#0A0A0A]  (page/section fill)   -> bg-primary
- bg-[#141414] | bg-[#171717] | bg-[#0A0A0A] (card fill)         -> bg-primary-light
- text-white                                                     -> text-text
- text-white/70 | /80 | /60 | /50 | /40  (muted body)           -> text-text/70 (keep the same /NN opacity)
- border-white/10 | /5 | /20                                     -> border-text/10 (keep the /NN)
- bg-white/5 | /10  (glass fill)                                 -> bg-text/5 (keep the /NN)
- text-[#FFFFFF] used as an accent/detail                        -> text-accent
- selection:bg-[#FFFFFF]/30 selection:text-white                 -> selection:bg-text/20 selection:text-primary

JUDGMENT RULES — do NOT blindly swap these:
- Gradient scrims that DARKEN a photo for text legibility (e.g. from-[#000000] via-[#000000]/80 to-transparent layered over an <Image> or a background photo) MUST STAY DARK in both themes. Leave those hex/black gradient stops untouched. Text over photos stays text-white.
- Keep the classes 'liquid-glass' and 'liquid-glass-card' — they are already theme-aware in CSS.
- Leave lucide icon color classes alone (a global CSS rule colors them).
- 'text-glow' (white text-shadow): remove it ONLY if the element is now themed text on a plain (non-image) themed background, where a white glow would look wrong in light mode. Otherwise keep it.

HARD CONSTRAINTS:
- ONLY change color-related Tailwind classes and inline style color values.
- Do NOT touch: GSAP/animation code, refs, hooks, imports, JSX structure, image src, text content, or any component logic.
- Preserve every non-color class exactly and keep the file compiling.
`

const OUT = {
  type: 'object',
  additionalProperties: false,
  required: ['file', 'changed', 'summary'],
  properties: {
    file: { type: 'string' },
    changed: { type: 'boolean', description: 'true if you edited the file' },
    summary: { type: 'string', description: 'one-line description of the color swaps made' },
    remainingHardcoded: { type: 'array', items: { type: 'string' }, description: 'any hardcoded colors intentionally left (with reason)' },
  },
}

const results = await pipeline(
  FILES,
  (file) =>
    agent(
      `${SPEC}\n\nConvert this file now: ${file}\nRead it, apply the mappings with Edit, then report what you changed.`,
      { label: `convert:${file.split('/').pop()}`, phase: 'Convert', schema: OUT }
    ),
  (conv, file) =>
    agent(
      `${SPEC}\n\nADVERSARIAL VERIFY of ${file} (already converted). Re-read the file and:\n` +
        `1. Find any REMAINING theme-breaking hardcoded colors (bg-[#000000], text-white on a themed bg, bg-black, border-white, etc.) that are NOT legitimate photo scrims — and fix them with Edit per the mappings.\n` +
        `2. Check it will read correctly in LIGHT mode (no white text on white bg, no invisible elements).\n` +
        `3. Do not break compilation or logic.\n` +
        `Report the final state.`,
      { label: `verify:${file.split('/').pop()}`, phase: 'Verify', schema: OUT }
    ).then((v) => ({ file, convert: conv, verify: v }))
)

const touched = results.filter(Boolean)
log(`Theme conversion done: ${touched.length}/${FILES.length} files processed`)
return touched.map((r) => ({ file: r.file, convert: r.convert?.summary, verify: r.verify?.summary, remaining: r.verify?.remainingHardcoded }))
