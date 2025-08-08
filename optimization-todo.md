# Task Extractor Plugin - Optimization TODO List

## Phase 1: Quick Wins (Week 1)

### File Processing Debounce
- [x] Create `fileChangeDebouncer` Map to track pending file changes
- [x] Implement `debounceFileChange()` method with 2-second delay
- [x] Replace direct `onFileChanged()` calls with debounced version
- [x] Add cleanup logic in `onunload()` to clear pending timeouts
- [x] Test with rapid file edits to verify batching works ✅

### Service Polling Optimization  
- [x] Replace interval-based polling with on-demand detection
- [x] Implement `getService()` method with 30-minute cache TTL
- [x] Create `detectSingleService()` for individual service checks
- [x] Remove `setupServiceMonitoring()` interval timer
- [x] Update service calls to use lazy loading approach
- [x] Test service detection still works when switching providers ✅

### Settings UI Performance
- [x] Add debouncing to setting change handlers (500ms delay)
- [x] Add cleanup logic for settings timeout on hide
- [x] Convert all async onChange handlers to use debounced save
- [x] Preserve special logic (cache clearing, UI refresh) while debouncing
- [x] Test settings UI responsiveness with complex configurations ✅

## Phase 2: Architecture Optimization (Week 2)

### File Structure Refactoring
- [x] Create `src/` directory for modular code
- [x] Extract types to `src/types.ts` (interfaces, constants)
- [x] Move LLM provider logic to `src/llm-providers.ts`
- [x] Extract task processing to `src/task-processor.ts`  
- [x] Move settings UI to `src/settings.ts`
- [x] Keep main plugin class in `main.ts` (orchestration only)
- [x] Update imports and build configuration
- [x] Test all functionality works after refactoring ✅

### Lazy Provider Initialization
- [x] Create modular provider management system
- [x] Implement on-demand service detection
- [x] Load provider-specific logic only when needed
- [x] Maintain backward compatibility with existing API
- [x] Test memory usage reduction on startup ✅
- [x] Verify provider switching still works correctly ✅

### Unified Caching Strategy
- [x] Maintain existing cache interfaces for compatibility
- [x] Centralize cache management in LLMProviderManager
- [x] Implement proper cache cleanup in modular components
- [x] Preserve existing cache behavior while improving organization
- [x] Add cleanup methods to all modular components
- [x] Test cache behavior remains consistent ✅

## Phase 3: Processing Optimization (Week 3)

### Batch File Processing
- [ ] Implement `chunkArray()` utility function
- [ ] Create `getUnprocessedFiles()` method
- [ ] Modify `scanExistingFiles()` to process in batches of 5
- [ ] Add 100ms delays between batches
- [ ] Test with large vaults to verify no UI blocking
- [ ] Monitor memory usage during batch processing

### Frontmatter Processing Optimization
- [ ] Implement regex-based `markFileProcessed()` method
- [ ] Handle files with existing frontmatter
- [ ] Handle files without frontmatter
- [ ] Add error handling for malformed frontmatter
- [ ] Test with various frontmatter formats
- [ ] Benchmark performance vs current implementation

### Retry Logic Optimization
- [ ] Modify `callLLM()` to respect user retry settings
- [ ] Replace exponential backoff with linear backoff
- [ ] Implement `shouldTryLocalFallback()` logic
- [ ] Streamline fallback provider selection
- [ ] Test retry behavior with network failures
- [ ] Verify user settings are still respected

## Testing & Validation

### Performance Testing
- [ ] Create benchmark suite for current implementation
- [ ] Measure startup time before/after optimizations
- [ ] Monitor background CPU usage over time
- [ ] Test memory usage with large vaults
- [ ] Benchmark file processing speed
- [ ] Document performance improvements

### Functionality Testing
- [ ] Test all LLM providers (OpenAI, Anthropic, Ollama, LM Studio)
- [ ] Verify task extraction accuracy unchanged
- [ ] Test all settings combinations
- [ ] Verify frontmatter customization works
- [ ] Test error handling and fallback scenarios
- [ ] Validate backward compatibility

### Integration Testing
- [ ] Test with various Obsidian vault sizes
- [ ] Test with different note structures
- [ ] Verify plugin loading/unloading
- [ ] Test concurrent file processing
- [ ] Validate settings persistence

## Deployment & Monitoring

### Release Preparation
- [ ] Update version in manifest.json
- [ ] Document breaking changes (if any)
- [ ] Create migration guide for users
- [ ] Update README with performance improvements
- [ ] Prepare rollback plan

### Post-Release Monitoring
- [ ] Monitor user feedback for performance issues
- [ ] Track error rates in console logs
- [ ] Validate expected performance improvements
- [ ] Address any regression issues
- [ ] Document lessons learned

## Phase 4: Cleanup (Post-Implementation)

### Remove Temporary Files
- [ ] Delete `efficiency-improvement-plan.md` (analysis document, no longer needed)
- [ ] Delete `optimization-todo.md` (this file, once all tasks completed)
- [ ] Remove any temporary test files created during development
- [ ] Clean up any backup files from refactoring
- [ ] Remove debug logging added during optimization

### Code Cleanup
- [ ] Remove commented-out old code
- [ ] Clean up unused imports after refactoring
- [ ] Remove temporary debugging variables
- [ ] Consolidate any duplicate utility functions
- [ ] Update code comments to reflect new architecture

### Documentation Updates
- [ ] Update inline code documentation
- [ ] Refresh README.md with new architecture notes
- [ ] Update any developer setup instructions
- [ ] Document new file structure in steering docs
- [ ] Archive old implementation notes

## Success Metrics

### Performance Targets
- [ ] Achieve 60% faster startup time
- [ ] Reduce background CPU usage by 83%
- [ ] Decrease memory usage by 40%
- [ ] Improve file processing speed by 50%

### Quality Targets
- [ ] Maintain 100% feature compatibility
- [ ] Zero breaking changes for existing users
- [ ] Improved code maintainability
- [ ] Reduced bug surface area

---

**Total Tasks**: 82
**Estimated Effort**: 3 weeks + cleanup
**Risk Level**: Medium (phased approach with rollback plan)

### Temporary Files Created (for cleanup tracking):
- `efficiency-improvement-plan.md` - Analysis document (delete after implementation)
- `optimization-todo.md` - This TODO list (delete when complete)
- `test-phase1-optimizations.md` - Test plan for Phase 1 (delete after testing complete)
- `main-old.ts` - Backup of original main.ts (delete after Phase 2 testing complete)