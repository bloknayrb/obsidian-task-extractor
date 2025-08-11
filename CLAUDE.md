# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian plugin that leverages LLMs to extract todo items from notes. The plugin supports multiple LLM providers including OpenAI, Anthropic, Ollama (local), and LM Studio (local).

## Key Features

- **Multi-provider LLM support**: OpenAI, Anthropic, Ollama, and LM Studio
- **Dynamic model fetching**: Automatically retrieves available models from cloud providers
- **Smart settings UI**: Dropdowns for model selection with loading states and error handling  
- **Task extraction**: Analyzes notes and extracts actionable todo items
- **Frontmatter integration**: Fully customizable frontmatter templates with 8 field types
- **Notification management**: Single notifications (no spam) for missing API keys
- **Advanced debug logging**: Comprehensive debugging system with performance optimizations
- **Local LLM endpoints**: 
  - Ollama: `http://localhost:11434/api/generate`
  - LM Studio: `http://localhost:1234/v1/chat/completions`

## Architecture

The main plugin file is `obsidian_task_extractor.ts`. The core functionality revolves around:

1. **Provider-specific LLM calling**: The `callLLM` function branches by provider to handle different API formats
2. **Task extraction**: LLM analyzes note content to identify actionable tasks
3. **Metadata handling**: Extracts project and client information, defaulting to null if not present
4. **Note creation**: Creates new task notes with proper frontmatter structure
5. **Debug logging system**: Comprehensive logging infrastructure with performance optimizations

### Debug Logging System

The debug logging system (`src/debug-logger.ts`) provides:

- **Performance-optimized logging** with object pooling and memory management
- **Zero-overhead conditional logging** when debug mode is disabled
- **Correlation ID tracking** for following operations across components
- **Automatic log rotation** based on configurable entry limits
- **Memory-safe serialization** with circular reference detection
- **Performance metrics** for monitoring logging overhead
- **Security features** including API key masking and sensitive data protection

Key components:
- `DebugLogger`: Core logging class with performance optimizations
- `TaskProcessor`: File processing and task extraction event logging  
- `LLMProviderManager`: API call logging and service detection tracking

## Development Notes

- This is a TypeScript-based Obsidian plugin with full build configuration
- Plugin supports both cloud-based and local LLM providers for privacy/offline usage
- Settings include provider choice, model configuration, inline checklist toggle, and debug options
- Debug logging can be enabled in settings with configurable maximum entry limits
- Performance optimizations ensure minimal impact on plugin operation when debug mode is disabled