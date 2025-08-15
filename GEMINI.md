# Gemini Code Assistant Context

This document provides context for the Gemini Code Assistant to understand the **obsidian-task-extractor** project.

## Project Overview

**obsidian-task-extractor** is an [Obsidian](https://obsidian.md/) plugin that extracts actionable tasks from notes using Large Language Models (LLMs). It is written in TypeScript and uses `esbuild` for bundling and `vitest` for testing.

The plugin supports multiple LLM providers, including:

*   **Cloud-based:** OpenAI (GPT models), Anthropic (Claude models)
*   **Local:** Ollama, LM Studio

### Core Functionality

*   **Automatic Task Extraction:** The plugin monitors notes for changes. When a note's frontmatter matches a configured "trigger type" (e.g., `Type: Email`), it reads the content and sends it to the selected LLM to extract tasks.
*   **Customizable Frontmatter:** Users can define a template for the frontmatter of the task notes that get created. This includes custom fields, default values, and required fields.
*   **Manual Extraction:** A command is available to manually trigger task extraction on the currently open note, bypassing the automatic trigger rules.
*   **LLM Provider Management:** The plugin can auto-detect local LLM services (Ollama, LM Studio) and allows users to configure API keys for cloud services. It includes logic for retries and fallbacks between providers.
*   **Settings UI:** A comprehensive settings panel allows users to configure the plugin's behavior, including LLM provider, model, prompts, and task formatting.

### Key Files

*   `main.ts`: The main entry point for the Obsidian plugin. It handles loading/unloading, settings, and event registration.
*   `src/task-processor.ts`: Contains the core logic for processing notes, calling the LLM, and creating task notes.
*   `src/llm-providers.ts`: Manages all interactions with the different LLM APIs, including service detection, request formatting, and response handling.
*   `src/settings.ts`: Implements the settings UI using Obsidian's `PluginSettingTab` API.
*   `src/types.ts`: Defines the TypeScript interfaces and default settings used throughout the plugin.
*   `package.json`: Defines project metadata, dependencies, and scripts.
*   `esbuild.config.mjs`: The build script configuration for `esbuild`.
*   `vitest.config.ts`: The configuration for the `vitest` testing framework.

## Building and Running

The project uses `npm` for dependency management and scripting.

### Key Commands

*   **Install Dependencies:**
    ```bash
    npm install
    ```

*   **Development Build:**
    This command watches for file changes and automatically rebuilds the plugin.
    ```bash
    npm run dev
    ```

*   **Production Build:**
    This command creates an optimized production build of the plugin.
    ```bash
    npm run build
    ```

*   **Run Tests:**
    ```bash
    npm run test
    ```

*   **Run Tests in Watch Mode:**
    ```bash
    npm run test:watch
    ```

## Development Conventions

*   **Language:** The project is written entirely in **TypeScript**.
*   **Code Style:** The presence of `eslint` in `package.json` suggests that the project uses a linter to enforce code style. Adhere to the existing style.
*   **Modularity:** The codebase is well-structured into modules with clear responsibilities. New functionality should follow this pattern.
*   **Testing:** The project uses `vitest` for unit and integration testing. Mocks for the Obsidian API are located in `test/mocks/obsidian.ts`. New features should be accompanied by tests.
*   **Error Handling:** The plugin includes robust error handling, with notices displayed to the user and detailed logs in the developer console.
*   **Logging:** A `DebugLogger` is implemented to provide detailed, structured logs when debug mode is enabled. Use this for troubleshooting.
