# Implementation Plan

- [x] 1. Update default frontmatter fields to TaskNotes schema
  - Replace DEFAULT_FRONTMATTER_FIELDS constant with TaskNotes-compatible fields
  - Change 'task' field to 'title', update status/priority options, add new TaskNotes fields
  - Ensure existing users with custom fields are unaffected
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [x] 2. Update LLM extraction prompt for TaskNotes fields
  - Replace DEFAULT_EXTRACTION_PROMPT with TaskNotes-compatible version
  - Add instructions for extracting contexts, projects, and scheduled dates
  - Update prompt to use TaskNotes status ('open', 'in-progress', 'done') and priority ('low', 'normal', 'high') values
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [x] 3. Add value mapping in task processing
  - Update ExtractedTask interface to support new fields (scheduled_date, contexts array, projects array)
  - Add value mapping logic in extractFieldValue method (medium→normal, urgent→high priority mapping)
  - Enhance field processing to handle array fields for contexts and projects
  - Add boolean field handling for archived status
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [x] 4. Add comprehensive testing for TaskNotes compatibility
  - Create unit tests for new default fields and value mapping
  - Add integration tests for end-to-end TaskNotes task creation
  - Test backward compatibility for existing users with custom settings
  - Verify created tasks work with TaskNotes plugin expectations
  - _Requirements: All requirements validation_