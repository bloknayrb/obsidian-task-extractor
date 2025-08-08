Got it — I’ll prepare a full update to your plugin code so it supports:

- **Local LLMs**: detection and calling of both Ollama and LM Studio endpoints.
- **Extra fields**: `Project` and `Client` added to the task note frontmatter, even if blank.
- **Inline checklist**: when the LLM identifies tasks, optionally insert a `- [ ] Task Title` checklist in the original note’s body.

Settings will include a provider choice (`openai | anthropic | ollama | lmstudio`), model configuration, and a toggle for inline checklist creation.

Local API specifics:
- Ollama: `http://localhost:11434/api/generate`
- LM Studio: `http://localhost:1234/v1/chat/completions`

The `callLLM` function will branch by provider to handle each API.

The prompt will request `project` and `client` values in JSON, defaulting to `null` if not in the note. These will always be included in the frontmatter, even if empty.
