# Visual polish plan

## Direction

Sprout Shine should feel like a calm, tactile learning table: warm paper, garden greens,
clear hierarchy, and small physical responses. Delight belongs at meaningful moments —
building an answer, finding a pattern, completing a task — rather than on every page.

## Interaction language

- Immediate feedback uses 120–160 ms press and selection responses.
- State changes use 220–300 ms fades or short transforms.
- Correct answers and session milestones use one restrained 400–600 ms flourish.
- Sounds are quiet, locally generated, optional, and never used to punish mistakes.
- Reduced-motion preferences remove spatial movement while preserving state clarity.
- Touch targets remain at least 44 px and hover effects only apply to hover-capable pointers.

## Tablet-first layout

- Child sessions remain stacked in portrait and become a coach/workbook split view in
  landscape-sized containers.
- Parent pages use the extra width for a useful two-column hierarchy rather than stretching
  forms and text.
- Child shells include iPad safe-area padding and keep primary controls within easy reach.

## Study Time boundary

The browser experience must never imply it can lock an iPad. The parent dashboard will
describe Study Time as an iPad-app capability and expose an integration-ready UI state.
The native app will implement enforcement with Family Controls, Managed Settings, and
Device Activity after Apple grants the distribution entitlement.

## Verification

- Svelte type and accessibility checks.
- Unit tests and production build.
- Browser walkthrough at iPad portrait, iPad landscape, and laptop sizes.
- Keyboard focus, reduced motion, coarse-pointer layout, and sound-off behaviour.
