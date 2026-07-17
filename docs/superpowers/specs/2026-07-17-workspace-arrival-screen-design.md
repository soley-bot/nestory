# Workspace Arrival Screen Design

## Goal

Give `/workspace` a calm, cinematic sense of arrival while preserving its single
operational job: identify the signed-in workspace and send the user to the
role-appropriate entry route.

The page remains an authenticated transition surface, not a dashboard or a
marketing page. It must not introduce navigation, secondary actions, metrics,
or duplicated workspace content.

## Approved Direction

Use the existing blue-hour apartment photograph at
`/marketing/login-property-building-blue-hour.png` as a full-bleed background.
The building stays visually dominant on the left, while the workspace card is
placed over the quieter sky area on the right at desktop widths.

The lit windows are the signature element: they connect the photographic scene
to Nestory's role as the operating layer behind real properties.

## Visual System

- Midnight: `#0a1622`
- Slate: `#153047`
- Warm window amber: `#d6a35d`
- Frost: `#f4f7fa`
- Restrained blue: `#8fb8ff`

Retain the existing Inter typography and established Nestory type scale. Do not
add another font for this one-page treatment.

The image receives a dark directional scrim that is strongest behind the card
and light enough over the building to preserve the warm window detail. The card
uses a translucent midnight surface, a quiet light border, restrained blur, and
soft shadow. It must remain visually compact rather than becoming a hero panel.

## Layout

Desktop layout:

```text
+---------------------------------------------------------------+
|                                                               |
|  blue-hour apartment building          +-------------------+  |
|  with warm illuminated windows         | ADMIN WORKSPACE   |  |
|                                        | Organization name |  |
|                                        |                   |  |
|                                        | Open workspace    |  |
|                                        +-------------------+  |
|                                                               |
+---------------------------------------------------------------+
```

At wide widths, use a bounded content container and align the card toward the
right without pinning it to the viewport edge. At tablet and mobile widths,
center the card horizontally and bias the background position so useful
building detail remains visible. Preserve comfortable viewport-edge padding
and the existing minimum full-height behavior.

## Content And Interaction

Keep the existing content and routing behavior:

- `{Role} workspace` eyebrow
- organization name as the single `h1`
- `Open workspace` link to the role-derived entry path

Do not change authentication, workspace lookup, role formatting, link target,
or prefetch behavior. The action remains the only interactive control.

The link receives a restrained hover lift or tonal change and a clear keyboard
focus ring. Its label remains `Open workspace` so the action language stays
consistent with the existing flow and tests.

## Motion

Use one atmospheric background movement and one entry sequence:

- The background image slowly drifts or scales over approximately 14 seconds.
  The movement must be subtle enough that the architecture appears alive, not
  animated.
- The card fades in and rises a short distance once when the page loads.
- Button feedback remains quick and local; it does not join the ambient loop.

Under `prefers-reduced-motion: reduce`, remove the background movement and card
translation. The page must render immediately in its final composition.

## Implementation Boundaries

- Keep the page as an App Router server component.
- Use `next/image` for the full-bleed local asset and retain useful responsive
  sizing and priority loading for this above-the-fold image.
- Scope page-specific animation and scrim rules so they do not alter the login,
  signup, setup, dashboard, or marketing surfaces.
- Reuse existing color contracts where they fit, but keep the photo treatment
  local when global auth variables would couple unrelated entry pages.
- Do not add dependencies, client state, timers, or JavaScript-driven motion.

## Verification

Implementation is complete when:

1. The existing role-to-entry-path tests still pass for admin, manager, and
   member users.
2. The page retains one `h1`, no dashboard shell, no navigation, and one clear
   primary action.
3. Desktop visual verification confirms the building remains visible on the
   left and the card is readable over the right-side sky.
4. Mobile visual verification confirms the card stays inside the viewport and
   the background crop remains intentional.
5. Light theme, dark theme, keyboard focus, and reduced-motion behavior remain
   readable and usable.
6. The touched page and styles pass the focused lint/test checks required by
   `docs/verification.md`.

