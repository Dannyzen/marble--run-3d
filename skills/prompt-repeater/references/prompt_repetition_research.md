# Prompt Repetition Improves Non-Reasoning LLMs

**Source**: arxiv:2512.14982

## Key Findings
- When **NOT** using reasoning mode, repeating the input prompt improves performance across major models (Gemini, GPT, Claude, DeepSeek).
- The technique does **NOT** increase the number of generated tokens or significantly impact latency.
- It is particularly effective for instruction-following in complex, non-deterministic workflows.

## Practical Implementation
To maximize performance on high-speed "worker" tasks:
1. State the core goal and constraints at the beginning.
2. Provide the necessary context.
3. Restate the core goal and constraints at the very end before the output marker.
