# Project Constitution — Injection Block Format

This file is the single source of truth for the `## Project Constitution` injection block format. Any delegating root context (e.g., the Dungeon Master, or the Wayblade delivery skill) wraps the resolved constitution contents in this format when handing off to constitution-bearing agents (Pathfinder, Bitsmith, Ruinor).

Wrap the resolved constitution's contents under a `## Project Constitution` heading and follow with the exact reminder line so the receiving agent knows to apply it:

```
## Project Constitution

{verbatim contents of the resolved .claude/constitution.md}

These principles govern this repository. Plans and implementations that violate either principle will be rejected by Ruinor.
```

The `## Project Constitution` heading and the reminder line are fixed and must appear verbatim. The `{verbatim contents of the resolved .claude/constitution.md}` line is a placeholder: replace it with the full contents of the constitution file each consumer resolves at delegation time (consumers differ in how they resolve that path). When no constitution file resolves, no block is emitted at all — consumers skip injection silently rather than producing an empty or placeholder block.
