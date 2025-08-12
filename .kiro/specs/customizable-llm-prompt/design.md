# Design Document

## Overview

This design enhances the existing custom prompt functionality in the Obsidian Task Extractor plugin by adding a "Reset to Default" button to the settings UI. The feature will allow users to easily revert their custom prompt modifications back to the plugin's default prompt text with a single click.

The implementation leverages the existing settings infrastructure, including the debounced save mechanism and UI styling patterns already established in the plugin.

## Architecture

### Current Architecture Context

The plugin currently has:
- `ExtractorSettings.customPrompt: string` - stores the user's custom prompt
- `ExtractorSettingTab.addFrontmatterSection()` - renders the custom prompt UI
- `TaskProcessor.buildExtractionPrompt()` - uses custom prompt if provided, falls back to default
- Debounced save mechanism for settings changes

### Proposed Changes

The enhancement will modify only the settings UI layer (`ExtractorSettingTab`) without changing the core data structures or processing logic. The default prompt text will be extracted into a reusable constant to ensure consistency between the fallback logic and the reset functionality.

## Components and Interfaces

### 1. Default Prompt Constant

**Location:** `src/types.ts`

```typescript
export const DEFAULT_EXTRACTION_PROMPT = `You are a task extraction specialist. Extract actionable tasks from emails and meeting notes following these strict rules:

EXTRACTION RULES:
- Extract ONLY concrete, actionable tasks explicitly stated or clearly implied
- Use null for uncertain/missing information - DO NOT GUESS
- Extract tasks only for the specified person: {ownerName} (exact name)
- If no clear tasks exist, return {"found": false, "tasks": []}

PRIORITY GUIDELINES:
- high: explicit urgency/deadline mentioned
- medium: standard requests without time pressure  
- low: optional/background items

VALIDATION CONSTRAINTS:
- task_title: 6-100 characters, actionable phrasing
- task_details: max 300 characters, concrete description
- due_date: YYYY-MM-DD format only if explicitly mentioned
- source_excerpt: exact quote (max 150 chars) justifying extraction

Return valid JSON only. Be conservative - accuracy over completeness.`;
```

**Note:** The `{ownerName}` placeholder will be replaced at runtime with the actual owner name.

### 2. Settings UI Enhancement

**Location:** `src/settings.ts` - `addFrontmatterSection()` method

The custom prompt setting will be enhanced with:

1. **Updated Description:** Modify the setting description to mention the reset functionality
2. **Reset Button:** Add a button positioned after the text area
3. **Reset Handler:** Implement click handler that:
   - Replaces the text area value with the default prompt (with owner name substituted)
   - Triggers the existing `debouncedSave()` mechanism
   - Updates the settings object immediately for UI consistency

### 3. Task Processor Integration

**Location:** `src/task-processor.ts` - `buildExtractionPrompt()` method

Update the method to use the new constant instead of the hardcoded default prompt:

```typescript
private buildExtractionPrompt(sourcePath: string, content: string): { system: string, user: string } {
  const basePrompt = this.settings.customPrompt || 
    DEFAULT_EXTRACTION_PROMPT.replace('{ownerName}', this.settings.ownerName);
  // ... rest of method unchanged
}
```

## Data Models

No changes to existing data models are required. The feature uses the existing:

- `ExtractorSettings.customPrompt: string`
- `ExtractorSettings.ownerName: string` (for placeholder substitution)

## Error Handling

### Edge Cases

1. **Empty Owner Name:** If `ownerName` is empty, the placeholder substitution will result in an empty string, which is handled gracefully by the existing validation logic.

2. **Concurrent Settings Changes:** The existing debounced save mechanism handles rapid changes appropriately.

3. **UI State Consistency:** The reset operation updates both the text area value and the settings object immediately to prevent UI inconsistencies.

### Error Recovery

- If the reset operation fails, the UI will remain in its current state
- The existing error handling in the settings save mechanism will handle any persistence failures
- No additional error handling is required beyond the existing patterns

## Testing Strategy

### Unit Tests

**Location:** `test/settings.test.ts`

1. **Default Prompt Constant Test:**
   ```typescript
   test('DEFAULT_EXTRACTION_PROMPT contains required elements', () => {
     expect(DEFAULT_EXTRACTION_PROMPT).toContain('task extraction specialist');
     expect(DEFAULT_EXTRACTION_PROMPT).toContain('{ownerName}');
     expect(DEFAULT_EXTRACTION_PROMPT).toContain('Return valid JSON only');
   });
   ```

2. **Prompt Building Test:**
   ```typescript
   test('buildExtractionPrompt uses default when customPrompt is empty', () => {
     const settings = { ...DEFAULT_SETTINGS, customPrompt: '', ownerName: 'Test User' };
     const processor = new TaskProcessor(mockApp, settings, mockLLMProvider);
     const result = processor.buildExtractionPrompt('test.md', 'content');
     expect(result.system).toContain('Test User');
     expect(result.system).not.toContain('{ownerName}');
   });
   ```

3. **Prompt Building with Custom Prompt Test:**
   ```typescript
   test('buildExtractionPrompt uses custom prompt when provided', () => {
     const customPrompt = 'Custom extraction prompt';
     const settings = { ...DEFAULT_SETTINGS, customPrompt, ownerName: 'Test User' };
     const processor = new TaskProcessor(mockApp, settings, mockLLMProvider);
     const result = processor.buildExtractionPrompt('test.md', 'content');
     expect(result.system).toContain(customPrompt);
   });
   ```

### Integration Tests

**Location:** `test/integration.test.ts`

1. **Settings UI Reset Functionality:**
   - Test that clicking reset button updates the text area
   - Test that reset triggers debounced save
   - Test that reset works when custom prompt is empty
   - Test that reset works when custom prompt contains default text

### Manual Testing Scenarios

1. **Basic Reset Flow:**
   - Enter custom prompt text
   - Click "Reset to Default" button
   - Verify text area shows default prompt with owner name substituted
   - Verify settings are saved automatically

2. **Edge Case Testing:**
   - Test reset with empty custom prompt
   - Test reset with custom prompt matching default
   - Test reset with very long custom prompt
   - Test rapid clicking of reset button

3. **UI Consistency:**
   - Verify button styling matches other settings buttons
   - Verify button positioning is appropriate
   - Verify hover states work correctly

## Implementation Notes

### Code Organization

- The default prompt constant will be exported from `types.ts` for reusability
- The UI enhancement will be contained within the existing `addFrontmatterSection()` method
- No new files or major structural changes are required

### Backward Compatibility

- Existing custom prompts will continue to work unchanged
- The feature is purely additive and doesn't modify existing behavior
- Settings file format remains unchanged

### Performance Considerations

- The reset operation is a simple string replacement with minimal performance impact
- The existing debounced save mechanism prevents excessive save operations
- No additional network calls or heavy computations are introduced

### Accessibility

- The reset button will use appropriate ARIA labels for screen readers
- Keyboard navigation will work with the existing tab order
- Visual focus indicators will follow existing patterns