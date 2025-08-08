# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian plugin that leverages LLMs to extract todo items from notes. The plugin supports multiple LLM providers including OpenAI, Anthropic, Ollama (local), and LM Studio (local).

## Key Features

- **Multi-provider LLM support**: OpenAI, Anthropic, Ollama, and LM Studio
- **Task extraction**: Analyzes notes and extracts actionable todo items
- **Frontmatter integration**: Adds Project and Client fields to task note frontmatter
- **Inline checklist option**: Can insert `- [ ] Task Title` checklists in original notes
- **Local LLM endpoints**: 
  - Ollama: `http://localhost:11434/api/generate`
  - LM Studio: `http://localhost:1234/v1/chat/completions`

## Architecture

The main plugin file is `obsidian_task_extractor.ts`. The core functionality revolves around:

1. **Provider-specific LLM calling**: The `callLLM` function branches by provider to handle different API formats
2. **Task extraction**: LLM analyzes note content to identify actionable tasks
3. **Metadata handling**: Extracts project and client information, defaulting to null if not present
4. **Note creation**: Creates new task notes with proper frontmatter structure

## Development Notes

- This is a TypeScript-based Obsidian plugin
- No package.json or build configuration detected yet - plugin appears to be in early development
- Plugin supports both cloud-based and local LLM providers for privacy/offline usage
- Settings include provider choice, model configuration, and inline checklist toggle