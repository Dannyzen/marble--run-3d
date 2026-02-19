---
name: gea-orchestrator
description: Coordinate groups of AI agents to share experiences and reuse innovations to autonomously improve. Use when you need to manage multiple sub-agents or perform complex, multi-step tasks that require group-wide learning and self-healing.
---

# GEA Orchestrator

This skill implements the Group-Evolving Agents (GEA) framework for collective agent improvement.

## Core Concepts

GEA treats a group of agents as the fundamental evolutionary unit, rather than individual agents. This enables explicit experience sharing and reuse.

- **Experience Archive**: A central repository (e.g., `intelligence.db`) where all agents log successful patterns, tool calls, and failed attempts.
- **Reflection Module**: An overseer process that analyzes the archive to identify group-wide patterns and generate evolution directives.
- **Evolution Directives**: High-level instructions derived from group experience that guide subsequent task attempts.

## Workflow

1. **Task Initialization**: Spawn multiple specialized agents (e.g., Draft, Red Team, Refine) for a single complex goal.
2. **Execution & Logging**: Each agent performs its role and logs all tool outputs, errors, and breakthroughs to the Experience Archive.
3. **Group Reflection**: Run a reflection step after the first iteration. Analyze WHY certain steps failed and WHAT made other steps succeed across the entire group.
4. **Self-Healing Update**: Apply the reflection insights to the next iteration. This pattern achieves a 1.4 iteration average for bug repair (vs. 5 iterations for non-grouped agents).

## References

- [GEA_PAPER.md](references/gea_paper.md): Detailed summary of arxiv:2602.04837.
