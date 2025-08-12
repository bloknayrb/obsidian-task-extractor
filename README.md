# Obsidian Task Extractor

An Obsidian plugin that extracts actionable tasks from notes using Large Language Models (LLMs). Supports multiple LLM providers including cloud and local options.

## Features

### Multi-Provider LLM Support
- **OpenAI** - GPT models via API
- **Anthropic** - Claude models via API  
- **Ollama** - Local LLM runner with auto-detection
- **LM Studio** - Local LLM server with model management

### Task Detection
- Processes notes with specific frontmatter types
- Task extraction for specific individuals
- Configurable note types and trigger conditions
- Duplicate prevention system
- **Manual task extraction** command for on-demand processing
- **File/folder exclusion** with flexible patterns

### Customizable Frontmatter
- Template-based task note generation
- Custom field types: text, date, select, boolean
- Default values and validation
- Support for dynamic values (e.g., current date)

### Additional Features
- On-demand service detection for local LLMs
- Automatic fallback between providers
- Retry logic with linear backoff
- Custom prompt engineering
- Error handling and recovery

### Performance Features
- Modular architecture with lazy loading
- Reduced background CPU usage by eliminating continuous polling
- Memory management with caching and cleanup
- File processing optimization via debouncing and batch operations
- Non-blocking UI with debounced settings

### Quality & Reliability Improvements (v2.0)
- **Race Condition Prevention** - Atomic file processing with proper cleanup and timeout protection
- **Enhanced Type Safety** - Comprehensive type guards and runtime validation, eliminated unsafe casting
- **Optimized Batch Processing** - Controlled concurrency with memory monitoring and progress feedback
- **Standardized Error Handling** - Custom error classes with user-friendly messages and recovery strategies
- **Memory Management** - Automatic cleanup, size limits, and leak prevention for long-running sessions
- **String Operation Optimization** - 20%+ performance improvement through precompiled regex patterns
- **Structured Logging** - Comprehensive debugging with contextual information and performance timing

## Installation and Setup

### Installation

#### Method 1: Manual Installation
1. Download the latest release from GitHub
2. Extract to `.obsidian/plugins/task-extractor/` in your vault
3. Enable the plugin in Obsidian Settings → Community Plugins

#### Method 2: Development Setup
```bash
# Clone and setup
git clone https://github.com/bryanjkolb/obsidian-task-extractor.git
cd obsidian-task-extractor
npm install

# Build
npm run build

# For development with auto-rebuild
npm run dev
```

### Basic Configuration

1. Open **Settings → Task Extractor**
2. Choose your **LLM Provider**:
   - **Cloud providers**: Add your API key
   - **Local providers**: Ensure Ollama/LM Studio is running
3. Set your **Owner Name** (who tasks should be assigned to)
4. Configure **Tasks Folder** location
5. Customize **Trigger Note Types** as needed

## Configuration

### LLM Provider Setup

#### OpenAI
- Get API key from [OpenAI Platform](https://platform.openai.com)
- Default model: `gpt-4o-mini`
- Add API key in plugin settings

#### Anthropic
- Get API key from [Anthropic Console](https://console.anthropic.com)
- Default model: `claude-3-haiku-20240307`
- Add API key in plugin settings
- **Optional**: Configure a custom Anthropic URL for proxies or special endpoints.

#### Ollama (Local)
1. Install [Ollama](https://ollama.ai/)
2. Pull a model: `ollama pull llama3.2`
3. Start Ollama service
4. Plugin will auto-detect available models

#### LM Studio (Local)
1. Install [LM Studio](https://lmstudio.ai/)
2. Download and load a model
3. Start the local server (default: http://localhost:1234)
4. Plugin will auto-detect loaded models

### Frontmatter Customization

The plugin generates task notes with customizable frontmatter. Default fields include:

```yaml
task: "Task title extracted by LLM"
status: "todo"
priority: "medium"
due: "2025-01-15"  # If date mentioned
project: "Project name"  # If identified
client: "Client name"  # If mentioned
created: "2025-08-08"  # Auto-generated
tags: "task"
```

#### Adding Custom Fields
1. Go to **Settings → Task Note Frontmatter**
2. Click **Add Field**
3. Configure:
   - **Key**: Frontmatter field name
   - **Type**: text, date, select, boolean
   - **Default Value**: Used when LLM doesn't provide value
   - **Required**: Whether field must be present

#### Field Types
- **Text**: Free-form text input
- **Date**: ISO date format (YYYY-MM-DD)
- **Select**: Dropdown with predefined options
- **Boolean**: True/false values

#### Special Values
- `{{date}}` - Replaced with current date
- LLM extractions override default values when available

### Trigger Configuration

Notes are processed when they have frontmatter matching trigger types:

```yaml
---
Type: Email  # This will trigger processing
---
```

**Default trigger types**: `Email`, `MeetingNote`, `Meeting Note`, `Meeting Notes`

**Customization**: Add/remove trigger types in settings (comma-separated list)

#### Flexible Frontmatter Field Configuration

**NEW**: You can now customize which frontmatter field is used for filtering notes:

```yaml
---
Category: Email     # Custom field instead of "Type"
NoteType: Meeting   # Or any other field name
---
```

**Configuration**:
1. Go to **Settings → Processing Settings**
2. Set **Frontmatter field for filtering** to your preferred field name
3. Ensure your notes use this field consistently

**Benefits**:
- Adapt to existing note templates and workflows
- Use more descriptive field names that match your system
- Maintain consistency with other plugins or tools
- Backward compatible - defaults to "Type" if not configured

**Validation**: Field names must follow YAML key format (letters, numbers, underscores, hyphens, dots)

### File/Folder Exclusions

**NEW**: Prevent specific files or folders from being processed with flexible exclusion rules:

#### Excluded Paths (Exact Matches)
Specify exact file or folder paths to exclude:
```
Templates/
Archive/Old Notes/
Private/secrets.md
```

#### Exclusion Patterns (Wildcards)
Use glob patterns for flexible matching:
```
*.template.md     # All template files
**/drafts/**     # Any drafts folder and contents  
Archive/**       # Entire Archive folder
temp?.md         # temp1.md, temp2.md, etc.
```

#### Wildcard Support
- `*` - Matches any characters except `/` (single directory level)
- `**` - Matches any characters including `/` (multiple directory levels)
- `?` - Matches exactly one character

#### Configuration
1. Go to **Settings → File/Folder Exclusion Settings**
2. Add comma-separated paths or patterns
3. Both exact paths and patterns can be used together
4. Changes apply immediately to new file processing

#### Use Cases
- **Templates**: Exclude template files from being processed
- **Archives**: Skip old/completed notes  
- **Personal**: Exclude private or sensitive folders
- **Drafts**: Skip work-in-progress notes
- **System**: Exclude generated or temporary files

### Advanced Settings

#### Performance Tuning
- **Max Tokens**: Control response length (100-2000) - Enhanced slider with input field
- **Temperature**: Creativity level (0=deterministic, 1=creative) - Enhanced slider with input field
- **Timeout**: Request timeout in seconds (10-120) - Enhanced slider with input field
- **Retry Attempts**: Failed request retries (1-5) - Enhanced slider with input field

**NEW**: Enhanced slider components provide both slider and direct numeric input with:
- Bidirectional synchronization between slider and input field
- Real-time validation with bounds checking
- Visual feedback for invalid values
- Improved accessibility and user experience

#### Local LLM Settings
- **Service URLs**: Configure custom endpoints
- **Model Refresh Interval**: How often to check for new models
- **Auto-detection**: Automatic service availability monitoring

#### Processing Options
- **Process Edits**: React to note modifications (not just creation)
- **Link Back**: Include source note links in tasks
- **Processed Marker**: Frontmatter key to prevent reprocessing

### Custom Prompts

Override the default task extraction prompt for specialized use cases:

```
You are a task extraction assistant specialized in [your domain]. 
Look for tasks specifically assigned to [Owner Name].
Focus on [specific criteria]...
```

**Configuration**:
1. Go to **Settings → Task Note Frontmatter**
2. Enter your custom prompt in the **Custom Prompt** text area
3. Use **Reset to Default** button to restore the original prompt
4. Leave empty to use the built-in default prompt

**Reset Functionality**: The reset button automatically substitutes your configured owner name into the default prompt and refreshes the UI immediately.

## Usage

### Manual Task Extraction

You can manually extract tasks from any note using the command palette:

1. Open the note you want to process
2. Open Command Palette (Ctrl/Cmd + P)
3. Search for "Extract tasks from current note"
4. Press Enter to execute

**Features**:
- Works on any markdown note (ignores frontmatter trigger types)
- Processes the currently active note immediately
- Provides user feedback through notifications
- Handles errors gracefully with console logging

**Use Cases**:
- Process notes that don't match your trigger types
- Extract tasks from imported or legacy notes
- Test task extraction on specific content
- Override automatic processing rules

### Automatic Processing

Notes are automatically processed when they match your configured trigger types and frontmatter settings. See the Configuration section for details on setting up automatic processing.

## Usage Examples

### Example 1: Email Processing
```yaml
---
Type: Email
From: client@example.com
Subject: Project Updates
---

Hi Bryan,

Please review the attached documents and send feedback by Friday.
Also, can you schedule a follow-up meeting for next week?

Thanks!
```

**Generated Task**:
```yaml
---
task: "Review attached documents and send feedback"
status: "todo"
priority: "high"
due: "2025-08-15"  # Next Friday
project: "Project Updates"
client: "client@example.com"
created: "2025-08-08"
tags: "task"
---

Review the attached documents and send feedback by Friday. Also schedule a follow-up meeting for next week.

Source: [[Emails/Project Updates - client@example.com]]

> Justification excerpt:
> Please review the attached documents and send feedback by Friday
```

### Example 2: Meeting Notes
```yaml
---
Type: Meeting Note
Meeting: Weekly Team Sync
Date: 2025-08-08
---

## Action Items
- Bryan: Update the documentation by end of week
- Sarah: Coordinate with design team
- Mike: Fix the deployment pipeline

## Next Steps
Bryan will present the new features in next week's demo.
```

**Generated Task**:
```yaml
---
task: "Update documentation by end of week"
status: "todo" 
priority: "medium"
due: "2025-08-08"
project: "Weekly Team Sync"
tags: "task"
---

Update the documentation by end of week as discussed in the team meeting.

Source: [[Meetings/Weekly Team Sync - 2025-08-08]]

> Justification excerpt:
> Bryan: Update the documentation by end of week
```

## Troubleshooting

### Common Issues

#### "No models available" for Local LLMs
- **Ollama**: Run `ollama pull llama3.2` to download a model
- **LM Studio**: Load a model in the LM Studio interface
- Check service URLs in plugin settings

#### "API key not configured"
- Add valid API key in plugin settings
- Verify key has appropriate permissions
- Check API key format (starts with `sk-` for OpenAI)

#### Tasks not being created
1. Check note has correct `Type` frontmatter
2. Verify trigger types in settings match your notes
3. Ensure LLM can identify tasks for the specified owner name
4. Check console logs for detailed error messages

#### Service detection issues
- Verify local services are running on correct ports
- Check firewall/network settings
- Try manual service URL configuration
- Restart plugin after starting local services

### Debug Mode & Logging

The plugin includes logging and debugging capabilities for troubleshooting:

#### Enable Debug Mode
1. Go to **Settings → Task Extractor → Debug Settings**
2. Toggle **Enable Debug Mode**
3. Configure **Max Log Entries** (default: 1000)

#### Debug Features
- Conditional logging with minimal performance impact when disabled
- Correlation tracking for related operations
- Logging coverage for major decision points and operations
- Automatic log rotation to manage memory usage
- Structured logging with contextual information

#### Log Categories
- **file-processing**: File filtering, validation, and processing events
- **llm-call**: LLM prompt construction, API calls, and response parsing
- **task-creation**: Task note creation and validation
- **validation**: Data validation and parsing results
- **error**: Detailed error information with stack traces

#### Viewing Logs
- **Console**: Open Developer Console (Ctrl+Shift+I) and filter by "TaskExtractor"
- **Export**: Use debug logger's export functionality to save logs as text
- **Real-time**: Monitor operations as they happen with correlation tracking

### Performance Issues

- Reduce **Max Tokens** for faster responses
- Increase **Timeout** for slow local models
- Use smaller/faster models for local inference
- Adjust **Model Refresh Interval** to reduce background checks

## Architecture

### Modular Design
The plugin uses a modular architecture:

- **main.ts** - Plugin orchestration and backward compatibility layer
- **src/types.ts** - Shared type definitions and constants
- **src/llm-providers.ts** - LLM provider management with on-demand detection
- **src/task-processor.ts** - Debounced file processing and batch operations

### Performance Features
- **Debounced Processing**: 2-second delays prevent redundant file processing during rapid edits
- **On-Demand Service Detection**: Services detected only when needed, cached for 30 minutes
- **Batch Operations**: Large vault scans process files in groups of 5 with 100ms delays
- **Optimized Settings**: 500ms debounced saves reduce I/O operations
- **Proper Cleanup**: All timeouts and caches cleaned up on plugin unload

### Backward Compatibility
All existing APIs are preserved exactly, ensuring zero breaking changes for users upgrading from previous versions.

## Development

### Building from Source

```bash
# Install dependencies
npm install

# Development build (watches for changes)
npm run dev

# Production build
npm run build

# Version bump
npm version patch  # Updates manifest.json and versions.json
```

### Project Structure

```
obsidian-task-extractor/
├── main.ts              # Plugin orchestration and compatibility layer
├── src/
│   ├── types.ts         # Shared interfaces and constants
│   ├── llm-providers.ts # LLM provider management and caching
│   ├── task-processor.ts# File processing and task extraction
│   └── settings.ts      # Settings UI components (integrated)
├── manifest.json        # Plugin metadata
├── package.json         # Dependencies and scripts
├── tsconfig.json        # TypeScript configuration (includes src/)
├── esbuild.config.mjs   # Build configuration
├── version-bump.mjs     # Version management script
└── README.md            # Documentation
```

### API Integration

The plugin provides a unified interface for multiple LLM providers:

```typescript
// Example LLM call
const result = await this.callLLM(systemPrompt, userPrompt);

// Service detection
const services = await this.detectServices();
const available = this.getAvailableServices();
```

### Extension Points

- **Custom Providers**: Add new LLM providers in `callLLM` method
- **Field Types**: Extend frontmatter field types
- **Prompt Templates**: Customize extraction prompts
- **Post-processing**: Add custom task note formatting

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

- **Issues**: [GitHub Issues](https://github.com/bryanjkolb/obsidian-task-extractor/issues)
- **Discussions**: [GitHub Discussions](https://github.com/bryanjkolb/obsidian-task-extractor/discussions)
- **Documentation**: This README and in-plugin help

## Changelog

### v2.2.0 - File/Folder Exclusion System (2025-08-12)

#### New Features
- File/folder exclusion system to prevent processing of specific files or folders
- Exact path matching for file/folder exclusions (e.g., `"Templates/"`, `"Archive/Old Notes/"`)
- Glob pattern support for wildcard patterns (`*.template.md`, `**/drafts/**`, `Archive/**`)
- Combined exact paths and patterns for flexible exclusion rules

#### Technical Implementation  
- Cross-platform compatibility with normalized path separators for Windows, Mac, and Linux
- Early exclusion checks in processing pipeline to minimize overhead
- Glob-to-regex conversion with proper escaping and anchoring
- Input sanitization to prevent invalid patterns with user feedback

#### User Experience
- Settings UI with examples and descriptions
- Changes apply immediately without plugin restart
- Debug logging for excluded files when debug mode is enabled
- Backward compatibility with empty defaults for existing installations

#### Quality Assurance
- All existing tests pass with exclusion pattern validation
- Full TypeScript integration with proper interfaces
- Error handling for invalid patterns with console warnings
- Minimal overhead for empty exclusion lists

### v2.1.4 - Enhanced API Error Handling (2025-08-11)

#### Bug Fixes & Improvements
- Improved API key validation for empty/whitespace-only keys
- Auto-detection and correction of invalid Anthropic URLs to use `/v1/messages` endpoint  
- Specific error messages for different HTTP status codes (404, 401, 400, 403, 429)
- Pre-flight configuration validation to prevent API calls with invalid configurations
- OpenAI key format validation requiring "sk-" prefix

#### Technical Improvements  
- Debug logging with request details and configuration information
- Error messages include specific steps to fix configuration issues
- Provider settings validation before making API requests
- Error tracking and correlation for troubleshooting API issues

### v2.1.2 - Performance-Optimized Debug Logging (2025-01-08)

#### Performance Optimizations
- Entry reuse system for reduced garbage collection pressure
- Automatic log rotation with configurable cleanup intervals
- Pre-allocated arrays and circular reference detection for export operations
- Conditional logging with performance tracking

#### Additional Features  
- Real-time monitoring of logging overhead and memory utilization
- Automatic pool management and reference leak prevention
- Efficient string building with size limits to prevent memory issues
- Manual memory cleanup and optimization methods

#### Technical Improvements
- Dynamic pool sizing (max 100 entries) with periodic cleanup
- Safe serialization preventing infinite loops during export
- Array optimization to reduce memory fragmentation
- Average logging time and utilization percentage monitoring

### v2.1.1 - Debug Logging Infrastructure (2025-01-08)

#### New Features
- Logging infrastructure with correlation tracking and memory management
- Debug logging integration with minimal performance impact when disabled
- Categorized logs (file-processing, llm-call, task-creation, validation, error) with contextual data
- Related operations share correlation IDs for workflow tracing
- Automatic log rotation and cleanup to prevent memory issues

#### Technical Improvements
- Conditional logging with minimal performance impact when debug mode is disabled
- Logging coverage for major decision points, file filtering, LLM calls, and task creation
- Error logging with stack traces and contextual information
- Debug mode toggle and max entries configuration in settings UI

#### Testing
- Test suite verifying debug logging functionality
- Performance tests confirm minimal overhead when debug mode is disabled
- Tests ensure proper correlation ID tracking across operations

### v2.1.0 - Flexible Frontmatter Filtering & Enhanced UI (2025-01-08)

#### New Features
- Flexible frontmatter field configuration for customizing which field triggers processing (defaults to "Type" for backward compatibility)
- Bidirectional slider-input synchronization with real-time validation
- Bounds checking, NaN handling, and visual feedback for input validation
- 41 unit and integration tests for reliability and maintainability

#### Technical Improvements
- YAML key validation for frontmatter field names with graceful fallback
- UI components with accessibility and user experience improvements
- Error handling and validation throughout the application
- Full backward compatibility - existing configurations work unchanged

### v2.0.0 - Quality & Reliability Improvements (2025-01-08)

#### Major Improvements
- Eliminated code duplication through unified method extraction
- Fixed race conditions with atomic file processing and proper cleanup with timeout protection  
- Improved type safety with type guards and runtime validation, eliminated unsafe casting
- Optimized batch processing with controlled concurrency, memory monitoring and progress feedback
- Standardized error handling with error management system using custom error classes and recovery strategies
- Implemented memory management with monitoring, periodic cleanup, and configurable size limits to prevent memory leaks
- Optimized string operations with precompiled regex patterns and combined operations
- Logging and debugging system with contextual information, timing, and debug capabilities

#### Performance Improvements
- Automatic cleanup prevents indefinite memory growth during long sessions
- Improved filename sanitization and string operations
- Eliminated race conditions and file processing conflicts
- Retry mechanisms with exponential backoff
- Debouncer map size management with reasonable limits

#### New Features
- Debug system with contextual information and performance timing
- Real-time monitoring of memory usage and cleanup operations
- Error information with provider, model, and file context
- User notifications for batch operations with >10 files
- Built-in tools to verify optimization improvements

#### Developer Experience
- Runtime validation prevents errors and ensures data integrity
- Built-in benchmarking and memory statistics commands
- Export, clear, and search functionality for troubleshooting
- User-configurable memory limits, log levels, and debug options

### Previous Versions
- **v1.x**: Initial release with multi-provider LLM support and performance optimizations

## Roadmap

- [ ] Task priority learning from user feedback
- [ ] Integration with external task management systems
- [ ] Voice-to-task extraction via speech recognition
- [ ] Multi-language support for international teams
- [ ] Advanced analytics and task pattern recognition

---

Made for the Obsidian community
