# Phase 1 Optimization Tests

## Test Plan Overview

These tests validate the three Phase 1 optimizations:
1. File Processing Debounce
2. Service Polling Optimization  
3. Settings UI Performance

## Test 1: File Processing Debounce

### Expected Behavior
- Multiple rapid file changes should be batched into a single processing call
- Only the final change should trigger processing after 2-second delay
- Pending timeouts should be cleared on plugin unload

### Test Steps
1. **Setup**: Create a test markdown file with proper frontmatter
2. **Rapid Changes**: Simulate 5 rapid file modifications within 1 second
3. **Verification**: Confirm only 1 processing call occurs after 2-second delay
4. **Cleanup Test**: Verify pending timeouts are cleared on unload

### Test Implementation
```typescript
// Test file content
const testContent = `---
Type: Email
---
Test content for Bryan Kolb to review the documents.`;

// Expected: Only final change should be processed
// Expected: 2-second delay before processing
// Expected: No memory leaks from pending timeouts
```

## Test 2: Service Polling Optimization

### Expected Behavior
- No automatic polling on plugin load
- Services detected on-demand when needed
- 30-minute cache TTL respected
- Backward compatibility with existing detectServices() calls

### Test Steps
1. **No Initial Polling**: Verify no network calls on plugin startup
2. **On-Demand Detection**: Trigger service detection and verify single call
3. **Cache TTL**: Verify cached results used within 30 minutes
4. **Cache Expiry**: Verify new detection after 30+ minutes
5. **Backward Compatibility**: Verify detectServices() still works

### Test Implementation
```typescript
// Expected: No network calls during onload()
// Expected: getService('ollama') makes HTTP call only once per 30min
// Expected: detectServices() still returns Map<string, LLMService>
```

## Test 3: Settings UI Performance

### Expected Behavior
- Setting changes debounced to 500ms
- Multiple rapid changes result in single save operation
- All settings still persist correctly

### Test Steps
1. **Debounce Verification**: Make 5 rapid setting changes
2. **Single Save**: Verify only 1 saveSettings() call after 500ms
3. **Persistence**: Verify final setting value is saved correctly
4. **All Settings**: Test debouncing works for all setting types

### Test Implementation
```typescript
// Expected: 5 rapid changes → 1 save call after 500ms
// Expected: Final setting value persists correctly
// Expected: Works for text, toggle, slider, and dropdown settings
```

## Test Execution Plan

### Phase 1: Manual Testing (Development Environment)
1. Load plugin in Obsidian development environment
2. Monitor console logs for network calls and processing events
3. Use browser dev tools to track timing and frequency
4. Verify no errors or memory leaks

### Phase 2: Behavioral Verification
1. Create test notes with appropriate frontmatter
2. Simulate rapid file changes and setting modifications
3. Measure actual vs expected timing
4. Verify functionality remains intact

### Phase 3: Performance Measurement
1. Measure startup time before/after optimizations
2. Monitor background CPU usage over 10-minute period
3. Track memory usage during normal operation
4. Document performance improvements

## Success Criteria

### File Processing Debounce
- ✅ Rapid file changes batched (max 1 processing call per 2 seconds)
- ✅ No processing during rapid editing sessions
- ✅ Final change always processed correctly
- ✅ No memory leaks from pending timeouts

### Service Polling Optimization
- ✅ Zero network calls during plugin startup
- ✅ Services detected only when provider is used
- ✅ Cache prevents redundant calls within 30 minutes
- ✅ All existing functionality preserved

### Settings UI Performance
- ✅ Setting changes debounced to reduce save frequency
- ✅ UI remains responsive during rapid changes
- ✅ All settings persist correctly
- ✅ No functional regressions

## Failure Scenarios & Fixes

### If File Debounce Fails
- **Issue**: Multiple processing calls for rapid changes
- **Fix**: Verify debouncer Map correctly tracks and clears timeouts
- **Issue**: Processing never occurs
- **Fix**: Ensure timeout callback properly calls onFileChanged()

### If Service Polling Fails
- **Issue**: Services not detected when needed
- **Fix**: Verify getService() method properly calls detectSingleService()
- **Issue**: Cache not working
- **Fix**: Check TTL calculation and cache key consistency

### If Settings Debounce Fails
- **Issue**: Multiple save calls for rapid changes
- **Fix**: Verify debouncedSave() properly clears existing timeout
- **Issue**: Settings not persisting
- **Fix**: Ensure timeout callback properly calls saveSettings()

## Test Environment Setup

### Required Files
- Test markdown file with Email frontmatter
- Plugin loaded in development Obsidian instance
- Console logging enabled for debugging

### Monitoring Tools
- Browser Developer Tools (Network tab)
- Obsidian Developer Console
- Performance monitoring for timing verification

### Test Data
```markdown
---
Type: Email
From: test@example.com
---
Please review this document, Bryan Kolb.
```

This test plan ensures our optimizations work correctly without breaking existing functionality.