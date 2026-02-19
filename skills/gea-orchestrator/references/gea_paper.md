# Group-Evolving Agents (GEA)

**Source**: arxiv:2602.04837 (UC Santa Barbara)

## Abstract
Open-ended self-improving agents autonomously modify their own structural designs. GEA treats a group of agents as the fundamental evolutionary unit, enabling explicit experience sharing and reuse.

## Key Performance Metrics
- **SWE-bench Verified**: 71.0% (Matches top human-designed frameworks).
- **Polyglot Benchmark**: 88.3%.
- **Bug Repair Efficiency**: 1.4 iterations average (vs. 5.0 for standard agents).

## Architectural Components
1. **Experience Archive**: Stores evolutionary traces from all parent group members.
2. **Reflection Module**: Analyzes collective history to identify group-wide patterns.
3. **Updating Module**: Allows agents to modify their own code based on reflection insights.

## Proven Methodologies
- **Collective History Pooling**: Gaining access to the breakthroughs and mistakes of all group members.
- **Cross-Model Transferability**: Performance gains are maintained even when underlying models (Claude/GPT/Gemini) are swapped.
- **Experience Filtering**: Using high-quality experiences as signals and filtering out noise for creative generation tasks.
