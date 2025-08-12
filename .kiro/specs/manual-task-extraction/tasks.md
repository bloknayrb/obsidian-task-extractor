# Implementation Plan

- [x] 1. Add defaultTaskType setting to types and default settings
  - Add `defaultTaskType: string` field to ExtractorSettings interface
  - Set default value to "Task" in DEFAULT_SETTINGS
  - Update validateSettings function to validate the new field
  - _Requirements: 7.1, 7.2, 7.3_

- [x] 2. Register manual task extraction command in main plugin
  - Add command registration in onload() method of TaskExtractorPlugin
  - Set command ID as "task-extractor:extract-current-note"
  - Set command name as "Extract tasks from current note"
  - Create command callback that calls manual processing method
  - _Requirements: 1.1, 2.1, 2.2_

- [ ] 3. Implement manual processing method in TaskProcessor
  - Add processFileManually(file: TFile) method to TaskProcessor class
  - Implement file validation (markdown check, file exists)
  - Bypass frontmatter type filtering logic
  - Bypass duplicate prevention logic (don't mark as processed)
  - Use existing extractMultipleTasksFromContent method for LLM processing
  - _Requirements: 1.1, 3.1, 3.2, 5.1, 5.2, 5.3_

- [ ] 4. Add user feedback notices for manual command
  - Add notice when command starts: "Extracting tasks from current note..."
  - Add success notice showing number of tasks created
  - Add notice when no tasks found: "No tasks found in current note"
  - Add error notices for validation failures (no active file, non-markdown)
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 5. Implement source note linking in task creation
  - Modify createTaskNote method to include source note link
  - Add [[wikilink]] to task content using source filename without .md extension
  - Ensure link is clearly identifiable in task note structure
  - Respect existing linkBack setting for backward compatibility
  - _Requirements: 6.1, 6.2, 6.3_

- [ ] 6. Add defaultTaskType to task note frontmatter generation
  - Modify frontmatter generation logic to include Type field with defaultTaskType value
  - Ensure Type field is added to all created task notes
  - Update task creation to use configured default value
  - _Requirements: 7.1, 7.2, 7.3_

- [ ] 7. Create enhanced frontmatter configuration UI section
  - Add "Task Notes Frontmatter" section to ExtractorSettingTab
  - Create UI for managing frontmatter fields (add, remove, edit)
  - Add setting for configuring defaultTaskType value
  - Implement field validation for frontmatter field names and types
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 8. Add frontmatter field management functionality
  - Implement add field button that creates new FrontmatterField entries
  - Implement remove field functionality for existing fields
  - Create field editing UI with key, type, default value, and required settings
  - Add validation for field configurations and display error feedback
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 9. Update task creation logic to use configured frontmatter fields
  - Modify createTaskNote method to generate frontmatter based on configured fields
  - Apply field types, default values, and required field validation
  - Handle field type-specific formatting (date, select, boolean, text)
  - Ensure backward compatibility with existing task creation
  - _Requirements: 8.4, 8.5_

- [ ] 10. Add error handling for manual command execution
  - Implement try-catch blocks around manual processing logic
  - Handle file access errors and display appropriate notices
  - Handle LLM processing errors with existing retry logic
  - Log errors to console while showing user-friendly notices
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 11. Write unit tests for manual processing functionality
  - Test command registration and callback execution
  - Test manual processing method with various file types and states
  - Test frontmatter field configuration and validation
  - Test source note linking functionality
  - _Requirements: 1.1, 3.1, 6.1, 8.1_

- [ ] 12. Write integration tests for end-to-end manual extraction
  - Test complete workflow from command execution to task creation
  - Test frontmatter customization affects created tasks
  - Test error scenarios and user feedback
  - Test interaction with existing automatic processing
  - _Requirements: 1.1, 4.1, 8.4_