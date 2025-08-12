# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an Obsidian plugin that leverages LLMs to extract todo items from notes. The plugin supports multiple LLM providers including OpenAI, Anthropic, Ollama (local), and LM Studio (local).

## Key Features

- **Multi-provider LLM support**: OpenAI, Anthropic, Ollama, and LM Studio
- **Comprehensive Anthropic model support**: Complete 2024-2025 Claude model lineup including latest models (claude-opus-4-1-20250805, claude-sonnet-4-20250514, claude-3-7-sonnet-20250219) with cost-optimized default (claude-3-5-haiku-20241022)
- **Dynamic model fetching**: Automatically retrieves available models from cloud providers
- **Smart settings UI**: Dropdowns for model selection with loading states and error handling  
- **Task extraction**: Analyzes notes and extracts actionable todo items
- **File/folder exclusions**: Comprehensive exclusion system with exact paths and glob patterns
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
3. **File exclusion system**: Filters out files based on exact paths and glob patterns before processing
4. **Metadata handling**: Extracts project and client information, defaulting to null if not present
5. **Note creation**: Creates new task notes with proper frontmatter structure
6. **Debug logging system**: Comprehensive logging infrastructure with performance optimizations

### Model Selection and Defaults

The plugin now includes comprehensive support for Anthropic's model lineup:
- **Default model**: claude-3-5-haiku-20241022 (optimized for cost-effectiveness and speed)
- **Available models**: All current Claude models from 2024-2025 releases including Opus 4.1, Sonnet 4, and Claude 3.7 series
- **Automatic fallbacks**: Graceful handling when preferred models are unavailable
- **Smart model detection**: Automatically fetches and caches available models from cloud providers

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
- `TaskProcessor`: File processing, exclusion filtering, and task extraction event logging  
- `LLMProviderManager`: API call logging and service detection tracking

### File/Folder Exclusion System

The exclusion system (`src/task-processor.ts`) provides:

- **Exact path matching**: Direct file/folder path exclusions (e.g., `"Templates/"`, `"private.md"`)
- **Glob pattern support**: Wildcard patterns (`*.template.md`, `**/drafts/**`, `Archive/**`)
- **Cross-platform compatibility**: Normalized path separators for Windows/Mac/Linux
- **Performance optimization**: Early exclusion checks to minimize processing overhead
- **Pattern validation**: Input sanitization and error handling for invalid patterns

Key exclusion methods:
- `isPathExcluded()`: Checks exact path matches with folder handling
- `matchesExclusionPattern()`: Glob pattern matching with regex conversion
- `isFileExcluded()`: Combined exclusion check integrating both methods
- `globToRegex()`: Converts glob patterns to regex with proper escaping

## Security & Dependencies

### Security Posture
- **Zero vulnerabilities**: Regular `npm audit` confirms no known security issues
- **Dependency management**: All dependencies kept up-to-date with security patches
- **API key protection**: Enhanced credential validation and masking in debug logs
- **Input sanitization**: All user inputs are validated before processing
- **Secure storage**: Uses Obsidian's secure storage APIs for configuration
- **Enhanced API security**: Pre-flight validation prevents malformed API requests

### Current Dependency Versions (as of v2.1.5)
- **esbuild**: ^0.25.8 (critical security fixes included)
- **vite**: 7.1.1 (latest stable)
- **vitest**: ^3.2.4 (comprehensive testing framework)
- **TypeScript**: ^5.9.2 (modern language features)
- **ESLint**: ^9.33.0 with TypeScript support ^8.39.1

### Development Environment
- **Modern tooling**: ESLint 9.x with TypeScript integration
- **Type safety**: Full TypeScript coverage with CodeMirror declarations
- **Testing**: 50+ tests with Vitest ensuring reliability
- **Security auditing**: Automated dependency vulnerability scanning
- **Enhanced error handling**: Improved API error validation and debugging

## Development Notes

- This is a TypeScript-based Obsidian plugin with full build configuration
- Plugin supports both cloud-based and local LLM providers for privacy/offline usage
- Settings include provider choice, model configuration, inline checklist toggle, and debug options
- Enhanced Anthropic integration with comprehensive model support including latest 2025 releases
- Default model optimized for cost-effectiveness (claude-3-5-haiku-20241022) while supporting advanced models for complex tasks
- Debug logging can be enabled in settings with configurable maximum entry limits
- Performance optimizations ensure minimal impact on plugin operation when debug mode is disabled
- Security-first development with regular dependency audits and vulnerability fixes