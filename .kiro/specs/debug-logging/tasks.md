# Implementation Plan

- [x] 1. Create DebugLogger core infrastructure





  - Create `src/debug-logger.ts` with DebugLogEntry interface and DebugLogger class
  - Implement basic logging functionality with log(), getLogs(), clearLogs(), and exportLogs() methods
  - Add correlation ID generation with startOperation() method
  - Implement memory management with cleanup() method and maxEntries limit
  - _Requirements: 1.2, 5.3, 5.5_

- [x] 2. Extend settings system for debug mode





  - Add debugMode and debugMaxEntries fields to ExtractorSettings interface in src/types.ts
  - Update DEFAULT_SETTINGS with debug mode disabled by default and maxEntries of 1000
  - Update validateSettings() function to handle new debug settings
  - _Requirements: 1.1, 1.4_

- [x] 3. Add debug settings UI





  - Create debug section in ExtractorSettingTab with debug mode toggle
  - Add debug max entries slider with input validation
  - Implement settings persistence using existing debouncedSave mechanism
  - _Requirements: 1.1, 3.1_

- [x] 4. Integrate debug logging into TaskProcessor




- [x] 4.1 Add debug logger injection to TaskProcessor constructor


  - Modify TaskProcessor constructor to accept optional DebugLogger instance
  - Add conditional logging checks to ensure zero overhead when debug mode is disabled
  - _Requirements: 5.1_

- [x] 4.2 Implement file processing event logging


  - Log file processing start/end with correlation IDs in onFileChanged method
  - Log file filtering decisions (skipped files with reasons) in file validation logic
  - Log frontmatter validation results and trigger type matching
  - _Requirements: 2.1, 2.2, 4.1_

- [x] 4.3 Add task extraction and creation logging


  - Log LLM prompt construction and task extraction attempts
  - Log task parsing results and validation outcomes
  - Log task note creation success/failure with file paths
  - _Requirements: 2.3, 2.4, 4.2_

- [x] 5. Integrate debug logging into LLMProviderManager



- [x] 5.1 Add debug logger injection to LLMProviderManager constructor


  - Modify LLMProviderManager constructor to accept optional DebugLogger instance
  - Add conditional logging throughout LLM call methods
  - _Requirements: 5.1_

- [x] 5.2 Implement LLM API call logging


  - Log API request payloads (with masked API keys) in callLLM method
  - Log API response data and token usage information
  - Log retry attempts with backoff delays and fallback provider usage
  - _Requirements: 2.5, 4.2, 4.5_

- [x] 5.3 Add service detection logging


  - Log provider availability checks and model discovery in detectSingleService
  - Log connection status for local providers (Ollama/LM Studio)
  - Log service cache updates and model refresh events
  - _Requirements: 4.5_

- [ ] 6. Create log viewer UI component
- [ ] 6.1 Build log display interface in settings
  - Create scrollable log viewer container in ExtractorSettingTab
  - Implement chronological log display with timestamps and formatting
  - Add basic filtering by log level (info/warn/error) and category
  - _Requirements: 3.1, 3.2, 3.5_

- [ ] 6.2 Add log management controls
  - Implement clear logs button with confirmation dialog
  - Add export logs functionality to save logs as text file
  - Create auto-scroll toggle for real-time log monitoring
  - _Requirements: 3.4_

- [ ] 7. Wire debug logger into main plugin
  - Initialize DebugLogger in TaskExtractorPlugin.onload() when debug mode is enabled
  - Pass debug logger instance to TaskProcessor and LLMProviderManager constructors
  - Implement lazy initialization to avoid overhead when debug mode is disabled
  - _Requirements: 1.2, 5.1_

- [x] 8. Add comprehensive error handling and validation logging


  - Log detailed error context with stack traces for error-level entries
  - Add validation error logging for settings and frontmatter issues
  - Implement graceful degradation when logging itself fails
  - _Requirements: 2.6, 4.4, 5.4_

- [x] 9. Implement performance optimizations
  - Add memory management with automatic log rotation based on maxEntries
  - Optimize log data serialization to minimize memory usage
  - Ensure conditional logging has zero performance impact when disabled
  - _Requirements: 5.2, 5.3, 5.5_
  - _Note: Some performance optimizations were included in task 8 implementation_

- [ ] 10. Add security and privacy protections
  - Implement API key masking to show only last 4 characters in logs
  - Add safeguards against logging sensitive personal information from notes
  - Ensure logs are memory-only and not persisted to disk
  - _Requirements: 5.5_
  - _Note: Some security features were included in task 8 implementation_