# Design Document

## Overview

The debug logging feature adds comprehensive logging capabilities to the Obsidian Task Extractor plugin, allowing users to monitor and troubleshoot plugin behavior. The design integrates seamlessly with the existing modular architecture while maintaining performance and providing actionable insights.

## Architecture

### Core Components

#### 1. DebugLogger Class
A centralized logging service that handles all debug operations:
- **Location**: `src/debug-logger.ts`
- **Responsibilities**: Log entry creation, storage, formatting, and management
- **Integration**: Injected into existing components (TaskProcessor, LLMProviderManager)

#### 2. Settings Integration
Extends the existing settings system:
- **Debug Mode Toggle**: Boolean setting in ExtractorSettings
- **Settings UI**: New debug section in ExtractorSettingTab
- **Persistence**: Leverages existing settings save/load mechanism

#### 3. Log Viewer Interface
Embedded within the plugin settings:
- **Display**: Scrollable log viewer with timestamps
- **Controls**: Clear logs, export logs, toggle auto-scroll
- **Filtering**: Basic filtering by log level or component

## Components and Interfaces

### DebugLogger Interface

```typescript
interface DebugLogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  category: 'file-processing' | 'llm-call' | 'task-creation' | 'service-detection' | 'validation' | 'error';
  message: string;
  correlationId?: string; // Optional: track related operations
  data?: {
    filePath?: string;
    provider?: string;
    model?: string;
    tokenUsage?: number;
    requestPayload?: any;
    responseData?: any;
    error?: string;
    processingTime?: number;
    retryAttempt?: number;
    [key: string]: any;
  };
}

interface DebugLoggerConfig {
  enabled: boolean;
  maxEntries: number;
}

class DebugLogger {
  private logs: DebugLogEntry[] = [];
  private config: DebugLoggerConfig;
  private correlationCounter: number = 0;
  
  log(level: string, category: string, message: string, data?: any, correlationId?: string): void;
  startOperation(category: string, message: string, data?: any): string; // Returns correlationId
  getLogs(): DebugLogEntry[];
  clearLogs(): void;
  exportLogs(): string;
  cleanup(): void; // Remove old entries based on maxEntries
}
```

### Settings Extension

```typescript
interface ExtractorSettings {
  // ... existing settings
  debugMode: boolean;
  debugMaxEntries: number; // Default: 1000
}
```

### Integration Points

#### TaskProcessor Integration
- **File Processing Events**: Log when files are queued, processed, or skipped with correlation tracking
- **Task Extraction**: Log LLM prompts, responses, and parsing results with operation correlation
- **Task Creation**: Log successful/failed task note creation with file paths and timing
- **Validation Logging**: Log frontmatter validation failures with field-specific error details
- **User Workflow Tracking**: Log user-initiated actions like manual task extraction
- **Performance Monitoring**: Log processing times and bottleneck identification
- **Error Handling**: Log detailed error context with stack traces and correlation IDs

#### LLMProviderManager Integration
- **Service Detection**: Log provider availability and model discovery with correlation tracking
- **API Calls**: Log request payloads, response data, token usage, and response times
- **Fallback Logic**: Log when fallback providers are used with retry attempt tracking
- **Connection Monitoring**: Log local provider status (Ollama/LM Studio) with availability checks
- **Performance Tracking**: Log API response times and retry backoff strategies
- **Error Handling**: Log API errors with full context, stack traces, and correlation IDs

## Data Models

### Log Entry Structure
```typescript
interface DebugLogEntry {
  timestamp: number;           // Unix timestamp
  level: 'info' | 'warn' | 'error';
  category: string;           // Component/operation category
  message: string;            // Human-readable message
  correlationId?: string;     // Optional: track related operations
  data?: {                    // Optional structured data
    filePath?: string;
    provider?: string;
    model?: string;
    tokenUsage?: number;
    requestPayload?: any;
    responseData?: any;
    error?: string;
    processingTime?: number;
    retryAttempt?: number;
    [key: string]: any;
  };
}
```

### Log Categories
- **file-processing**: File detection, filtering, and processing decisions
- **llm-call**: LLM API interactions and responses
- **task-creation**: Task note generation and file operations
- **service-detection**: Provider availability and model discovery
- **validation**: Settings and frontmatter validation errors
- **error**: Error conditions and recovery attempts

## Request Correlation System

### Operation Tracking
The debug logger implements a correlation system to track related operations across async calls:

- **Correlation ID**: Groups related operations (e.g., file processing → LLM call → task creation)

### Workflow Examples
```typescript
// File processing workflow
const correlationId = logger.startOperation('file-processing', 'Processing file: note.md');
logger.log('info', 'file-processing', 'File passed trigger validation', { filePath: 'note.md' }, correlationId);

// LLM call with same correlation ID
logger.log('info', 'llm-call', 'API request sent', { provider: 'openai', requestPayload: {...} }, correlationId);
logger.log('info', 'llm-call', 'API response received', { responseData: {...}, tokenUsage: 150 }, correlationId);

// Task creation
logger.log('info', 'task-creation', 'Created task note', { filePath: 'Tasks/new-task.md' }, correlationId);
```

### Provider-Specific Debugging

#### Local Provider Monitoring
- **Connection Status**: Real-time monitoring of Ollama/LM Studio availability
- **Model Refresh**: Log when models are detected or become unavailable
- **Health Checks**: Periodic connectivity validation with timing data

#### Cloud Provider Debugging
- **API Response Times**: Track latency patterns across different models
- **Rate Limiting**: Log when rate limits are encountered
- **Token Usage**: Detailed tracking of token consumption patterns

#### Retry Logic Tracking
- **Attempt Logging**: Log each retry attempt with backoff delay information
- **Fallback Chains**: Track when and why fallback providers are used
- **Success/Failure Patterns**: Identify which providers/models are most reliable

## Error Handling

### Logging Failures
- **Graceful Degradation**: Logging failures never interrupt normal plugin operation
- **Silent Fallback**: If logging fails, continue without debug output
- **Memory Protection**: Automatic log rotation prevents memory exhaustion

### Error Context Capture
- **Stack Traces**: Include stack traces for error-level logs
- **Request/Response Data**: Capture full LLM interaction data for debugging
- **File Context**: Include file paths and frontmatter for processing errors

## Testing Strategy

### Unit Tests
- **DebugLogger Class**: Test log entry creation, storage, and cleanup
- **Settings Integration**: Test debug mode toggle and persistence
- **Memory Management**: Test log rotation and cleanup mechanisms

### Integration Tests
- **Component Integration**: Test logging integration with TaskProcessor and LLMProviderManager
- **Settings UI**: Test debug section rendering and controls
- **Performance Impact**: Verify minimal performance overhead when disabled

### Manual Testing
- **User Workflow**: Test complete debug workflow from enable to log review
- **Log Accuracy**: Verify logs accurately reflect plugin behavior
- **UI Responsiveness**: Ensure log viewer remains responsive with large log volumes

## Performance Considerations

### Memory Management
- **Log Rotation**: Automatic cleanup of old entries (default: 1000 entries, 24 hours)
- **Lazy Initialization**: Logger only initialized when debug mode is enabled
- **Efficient Storage**: Use circular buffer for log entries

### CPU Impact
- **Conditional Logging**: Zero overhead when debug mode is disabled
- **Async Operations**: Non-blocking log operations
- **Minimal Serialization**: Only serialize data when actually viewing logs

### Storage Efficiency
- **In-Memory Only**: Logs stored in memory, not persisted to disk
- **Structured Data**: Use efficient data structures for log storage
- **Cleanup Scheduling**: Regular cleanup to prevent memory leaks

## Implementation Phases

### Phase 1: Core Infrastructure
1. Create DebugLogger class with basic logging functionality
2. Extend ExtractorSettings with debug mode options
3. Add settings UI for debug mode toggle

### Phase 2: Integration
1. Integrate logging into TaskProcessor for file processing events
2. Add LLM call logging to LLMProviderManager
3. Implement error context capture

### Phase 3: User Interface
1. Create log viewer component in settings
2. Add log filtering and export functionality
3. Implement log management controls (clear, auto-scroll)

### Phase 4: Polish & Optimization
1. Add performance optimizations and memory management
2. Implement comprehensive error handling
3. Add user documentation and help text

## Security Considerations

### Data Sensitivity
- **API Keys**: Never log full API keys (mask all but last 4 characters)
- **Personal Data**: Be cautious about logging personal information from notes
- **LLM Responses**: Log LLM responses but consider privacy implications

### Data Retention
- **Automatic Cleanup**: Logs automatically expire after configured retention period
- **Manual Clearing**: Users can manually clear logs at any time
- **No Persistence**: Logs are not saved to disk, only kept in memory

## Backward Compatibility

### Settings Migration
- **Default Values**: Debug mode defaults to disabled for existing users
- **Graceful Fallback**: Missing debug settings use sensible defaults
- **No Breaking Changes**: All existing functionality remains unchanged

### API Compatibility
- **Optional Integration**: Logging integration is optional and non-breaking
- **Existing Methods**: All existing methods continue to work unchanged
- **Performance**: No performance impact when debug mode is disabled