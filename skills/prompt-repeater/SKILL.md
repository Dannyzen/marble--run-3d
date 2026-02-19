---
name: prompt-repeater
description: Improve model performance on non-reasoning tasks by repeating input instructions. Use for high-speed automation, classification, or strict-format tasks where reasoning is disabled to boost instruction following.
---

# Prompt Repeater

This skill implements the Prompt Repetition optimization to boost the accuracy of non-reasoning tasks.

## Why Repeat?

Research (arxiv:2512.14982) shows that repeating instructions inside a prompt frame improves performance for models like Gemini, Claude, and GPT without increasing latency or significant token overhead when deep reasoning is not engaged.

## Implementation Pattern

When formatting instructions for a sub-agent or a high-speed tool task, wrap the core requirements in a "Double-Frame":

```text
[CORE_INSTRUCTION]
Your task is: [X]
Constraints: [Y]
Format: [Z]

... (Any extra context) ...

[INSTRUCTION_REPETITION]
REMINDER: Your task remains: [X]
Apply constraints [Y] and ensure output matches [Z].
```

## When to Use

- **Data Extraction**: When extracting structured data from large text blocks.
- **Classification**: When assigning labels to multiple items rapidly.
- **API Framing**: When preparing a prompt for a "cheap worker" model that lacks deep reasoning capabilities.
- **Moltbook Outreach**: When dropping high-signal comments that must strictly follow a community format.

## References

- [PROMPT_REPETITION_RESEARCH.md](references/prompt_repetition_research.md): Summary of arxiv:2512.14982.
