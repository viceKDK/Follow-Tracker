# Follow Tracker Design System

`extension/design-tokens.css` is the single source of truth for the product palette, typography, radii and shadows.

## Palette

| Role | Token | Value |
| --- | --- | --- |
| Brand | `--ft-brand` | `#635BFF` |
| Brand hover | `--ft-brand-hover` | `#5148E5` |
| Sidebar | `--ft-sidebar` | `#101828` |
| Primary text | `--ft-text` | `#182230` |
| Secondary text | `--ft-text-secondary` | `#667085` |
| Page | `--ft-page` | `#F6F7F9` |
| Surface | `--ft-surface` | `#FFFFFF` |
| Border | `--ft-border` | `#E4E7EC` |
| Success | `--ft-success` | `#12805C` |
| Warning | `--ft-warning` | `#B7640B` |
| Danger | `--ft-danger` | `#D33F5A` |

## Rules

- Use brand violet only for primary actions, focus and the active navigation state.
- Use success, warning and danger only when they communicate meaning; never as decoration.
- Product surfaces are white on the neutral page background. Do not add gradients.
- Use the Inter stack and only weights 400, 500, 600 and 700.
- Body text is 14px. Supporting text is 12–13px. Do not introduce UI copy below 12px.
- New CSS must consume `--ft-*` tokens instead of introducing a new brand or neutral color.
