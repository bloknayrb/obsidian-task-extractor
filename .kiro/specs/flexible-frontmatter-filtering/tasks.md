# Implementation Plan

- [x] 1. Add configurable frontmatter field setting to types and defaults
  - Update `ExtractorSettings` interface in `src/types.ts` to include `triggerFrontmatterField: string`
  - Add the new field to `DEFAULT_SETTINGS` with value "Type" for backward compatibility
  - _Requirements: 1.1, 1.4_

- [x] 2. Update task processing logic to use configurable frontmatter field
  - Modify `onFileChanged()` method in `src/task-processor.ts` to use `this.settings.triggerFrontmatterField` instead of hardcoded "Type"
  - Update `getUnprocessedFiles()` method to use the configurable field for filtering
  - Ensure case-insensitive comparison is maintained
  - _Requirements: 1.1, 1.5_

- [x] 3. Add frontmatter field selector to settings UI
  - Add new setting control in `addProcessingSection()` method of `src/settings.ts`
  - Create text input field with appropriate placeholder and description
  - Implement onChange handler with debounced save
  - Position after "Trigger note types" setting
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 4. Create enhanced slider component with input field
  - Create helper method `addSliderWithInput()` in `src/settings.ts`
  - Implement bidirectional synchronization between slider and number input
  - Add validation for numeric input with min/max bounds
  - Include visual layout with slider and input side by side
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 5. Replace advanced settings sliders with enhanced slider-input components
  - Update Max Tokens setting to use new `addSliderWithInput()` method
  - Update Temperature setting with enhanced component
  - Update Timeout setting with enhanced component  
  - Update Retry Attempts setting with enhanced component
  - Ensure all validation and bounds checking works correctly
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 6. Update manifest.json version number
  - Check current version in manifest.json and update to appropriate next version
  - Ensure version follows semantic versioning principles
  - Verify consistency with any other version references in the codebase
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 7. Add input validation and error handling
  - Implement validation for frontmatter field name (non-empty, valid YAML key format)
  - Add bounds checking and error messages for numeric inputs in enhanced sliders
  - Ensure graceful fallback to defaults if invalid values are encountered
  - Test edge cases like empty strings and out-of-range values
  - _Requirements: 1.4, 3.6_

- [x] 8. Write unit tests for new functionality
  - Test frontmatter field configuration saves and loads correctly
  - Test task processing uses the configured field instead of hardcoded "Type"
  - Test slider-input synchronization works in both directions
  - Test input validation prevents invalid values
  - Test backward compatibility with existing configurations
  - _Requirements: 1.1, 1.4, 1.5, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_