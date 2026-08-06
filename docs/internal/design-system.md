# Oynk console design system

## Character

The console uses a precise deep-neutral workspace with restrained coral brand accents. Green indicates successful state only; amber indicates attention or delay; red indicates failure or destructive state. Borders and tonal separation provide hierarchy, with shadows reserved for drawers and overlays.

## Semantic tokens

Console tokens live under `.console-shell` in `apps/web/src/index.css`:

- Canvas: `--console-bg`
- Surfaces: `--console-surface`, `--console-elevated`, `--console-muted`
- Borders: `--console-border`, `--console-border-strong`
- Text: `--console-text`, `--console-text-secondary`, `--console-text-muted`
- Brand and state: `--console-brand`, `--console-success`, `--console-warning`, `--console-danger`

## Typography

- Page headings are compact and high contrast.
- Supporting copy is smaller and muted, with readable line height.
- Financial values use tabular numerals.
- Addresses, hashes, and technical identifiers use monospace presentation.
- Navigation labels use dense operational sizing, not marketing typography.

## Shape and spacing

- Controls use approximately 8px radii.
- Operational panels use 10–12px radii.
- Pills are reserved for environment, chain, direction, and status.
- The sidebar is dense; page content uses responsive 16–36px gutters.
- Tables remain full width with horizontal scrolling; mobile uses semantic transaction cards.

## Interaction

- Standard transitions are 140–160ms.
- Focus remains visible on controls and navigation.
- Mobile navigation locks background scroll, receives focus on opening, closes with Escape, and restores focus.
- Reduced-motion preferences disable nonessential motion globally.

## Status language

Use explicit operational text: `Indexing in progress`, `Latest run was partial`, `Latest run failed`, and exact index timestamps. Never communicate status with color alone.

