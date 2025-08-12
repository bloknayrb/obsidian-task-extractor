# Implementation Plan

- [x] 1. Extract default prompt into reusable constant
  - Create `DEFAULT_EXTRACTION_PROMPT` constant in `src/types.ts` with the current hardcoded prompt text
  - Include `{ownerName}` placeholder for runtime substitution
  - Export the constant for use in other modules
  - _Requirements: 1.1, 3.3_

- [x] 2. Update task processor to use the new default prompt constant
  - Modify `buildExtractionPrompt()` method in `src/task-processor.ts` to use `DEFAULT_EXTRACTION_PROMPT`
  - Replace hardcoded prompt string with the imported constant
  - Ensure owner name placeholder substitution works correctly
  - _Requirements: 1.1, 3.3_

- [x] 3. Implement reset to default button in settings UI
  - Modify `addFrontmatterSection()` method in `src/settings.ts` to add reset button
  - Position button after the custom prompt text area
  - Style button consistently with existing UI patterns
  - Add appropriate button text "Reset to Default"
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 4. Implement reset button click handler
  - Create click handler that replaces text area value with default prompt
  - Substitute `{ownerName}` placeholder with actual owner name from settings
  - Update `this.settings.customPrompt` immediately for UI consistency
  - Trigger existing `debouncedSave()` mechanism to persist changes
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 5. Update custom prompt setting description
  - Modify the setting description to mention the reset functionality
  - Ensure description explains that empty field uses default prompt
  - Maintain clarity about the reset button's purpose
  - _Requirements: 3.1, 3.2_

- [x] 6. Write unit tests for default prompt constant
  - Create test in `test/settings.test.ts` to validate `DEFAULT_EXTRACTION_PROMPT` content
  - Test that constant contains required elements like "task extraction specialist"
  - Test that constant includes `{ownerName}` placeholder
  - Verify constant includes key instruction phrases
  - _Requirements: 1.1, 3.3_

- [x] 7. Write unit tests for prompt building logic
  - Test `buildExtractionPrompt()` uses default when `customPrompt` is empty
  - Test that owner name placeholder is correctly substituted
  - Test that custom prompt is used when provided
  - Test edge cases like empty owner name
  - _Requirements: 1.1, 3.2, 3.3_

- [x] 8. Write integration tests for reset functionality
  - Create tests to verify reset button updates text area value
  - Test that reset triggers debounced save mechanism
  - Test reset works when custom prompt is empty
  - Test reset works when custom prompt contains default text
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_