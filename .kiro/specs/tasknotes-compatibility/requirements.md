# Requirements Document

## Introduction

This feature will modify the Task Extractor plugin to have "out of the box" compatibility with the TaskNotes Obsidian plugin while maintaining the ability to configure it to work with existing user workflows. TaskNotes is a popular task management plugin that treats each task as an individual Markdown file with YAML frontmatter, and uses specific field names and values that differ from our current defaults.

The goal is to make our plugin immediately useful for TaskNotes users without requiring configuration, while preserving backward compatibility for existing users through configuration options.

## Requirements

### Requirement 1: Default TaskNotes-Compatible Frontmatter Schema

**User Story:** As a TaskNotes user, I want the Task Extractor plugin to create tasks that work immediately with TaskNotes without any configuration, so that I can start extracting tasks right away.

#### Acceptance Criteria

1. WHEN the plugin is installed for the first time THEN the default frontmatter fields SHALL match TaskNotes schema exactly
2. WHEN a task is extracted THEN the frontmatter SHALL include the field `title` instead of `task` for the task name
3. WHEN a task is extracted THEN the frontmatter SHALL include `status` with default value `open` instead of `inbox`
4. WHEN a task is extracted THEN the frontmatter SHALL include `priority` with values `low`, `normal`, `high` instead of `low`, `medium`, `high`, `urgent`
5. WHEN a task is extracted THEN the frontmatter SHALL include TaskNotes-specific fields: `due`, `scheduled`, `contexts`, `projects`, `tags`, `dateCreated`, `dateModified`
6. WHEN a task is extracted THEN the frontmatter SHALL use TaskNotes date format (YYYY-MM-DD) for date fields
7. WHEN a task is extracted THEN the frontmatter SHALL include `archived: false` as a boolean field

### Requirement 2: TaskNotes-Compatible Status Values

**User Story:** As a TaskNotes user, I want extracted tasks to use the same status values that TaskNotes recognizes, so that they appear correctly in TaskNotes views and workflows.

#### Acceptance Criteria

1. WHEN the plugin uses default settings THEN the available status options SHALL be `open`, `in-progress`, `done`
2. WHEN a task is extracted with high urgency THEN the status SHALL default to `open`
3. WHEN the LLM determines a task is already completed THEN the status SHALL be set to `done`
4. WHEN the LLM determines a task is in progress THEN the status SHALL be set to `in-progress`
5. WHEN no status can be determined THEN the status SHALL default to `open`

### Requirement 3: TaskNotes-Compatible Priority Values

**User Story:** As a TaskNotes user, I want extracted tasks to use TaskNotes priority values, so that priority-based filtering and sorting works correctly.

#### Acceptance Criteria

1. WHEN the plugin uses default settings THEN the available priority options SHALL be `low`, `normal`, `high`
2. WHEN the LLM extracts a task with "high" priority THEN the priority SHALL be set to `high`
3. WHEN the LLM extracts a task with "medium" priority THEN the priority SHALL be mapped to `normal`
4. WHEN the LLM extracts a task with "urgent" priority THEN the priority SHALL be mapped to `high`
5. WHEN no priority can be determined THEN the priority SHALL default to `normal`

### Requirement 4: Enhanced Field Mapping for TaskNotes Fields

**User Story:** As a TaskNotes user, I want extracted tasks to include TaskNotes-specific fields like contexts, projects, and scheduling information, so that I can use all TaskNotes features.

#### Acceptance Criteria

1. WHEN a task is extracted THEN the frontmatter SHALL include a `contexts` field as an array for task contexts
2. WHEN a task is extracted THEN the frontmatter SHALL include a `projects` field as an array for project associations
3. WHEN a task is extracted THEN the frontmatter SHALL include a `scheduled` field for when the task should be worked on
4. WHEN a task is extracted THEN the frontmatter SHALL include `dateCreated` with the current date in YYYY-MM-DD format
5. WHEN a task is extracted THEN the frontmatter SHALL include `dateModified` with the current date in YYYY-MM-DD format
6. WHEN the LLM extracts project information THEN it SHALL be added to the `projects` array
7. WHEN the LLM extracts context information THEN it SHALL be added to the `contexts` array

### Requirement 5: Backward Compatibility Configuration

**User Story:** As an existing Task Extractor user, I want to be able to configure the plugin to work with my existing task format, so that I don't lose my current workflow when upgrading.

#### Acceptance Criteria

1. WHEN a user has existing settings from a previous version THEN their custom frontmatter fields SHALL be preserved
2. WHEN a user wants to use the old format THEN they SHALL be able to configure field mappings to match their existing workflow
3. WHEN a user has custom status values THEN they SHALL be preserved in the configuration
4. WHEN a user has custom priority values THEN they SHALL be preserved in the configuration
5. WHEN upgrading from a previous version THEN the plugin SHALL detect existing settings and preserve them
6. WHEN a user wants to switch to TaskNotes format THEN they SHALL be able to reset to TaskNotes defaults via a settings button

### Requirement 6: Template and Preset System

**User Story:** As a user, I want to be able to quickly switch between different task management system formats, so that I can easily adapt the plugin to different workflows.

#### Acceptance Criteria

1. WHEN accessing plugin settings THEN there SHALL be a "Templates" section with preset configurations
2. WHEN selecting the "TaskNotes" template THEN all frontmatter fields SHALL be configured for TaskNotes compatibility
3. WHEN selecting the "Legacy Task Extractor" template THEN all frontmatter fields SHALL match the previous plugin format
4. WHEN selecting the "Getting Things Done (GTD)" template THEN frontmatter fields SHALL be optimized for GTD workflow
5. WHEN applying a template THEN the user SHALL be warned if it will overwrite existing custom configurations
6. WHEN applying a template THEN the user SHALL be able to preview the changes before confirming

### Requirement 7: Enhanced LLM Prompt for TaskNotes Fields

**User Story:** As a user, I want the LLM to extract TaskNotes-specific information like contexts and projects, so that my tasks are properly categorized and organized.

#### Acceptance Criteria

1. WHEN the default prompt is used THEN it SHALL instruct the LLM to identify project information for the `projects` field
2. WHEN the default prompt is used THEN it SHALL instruct the LLM to identify context information for the `contexts` field
3. WHEN the default prompt is used THEN it SHALL instruct the LLM to identify scheduled dates separate from due dates
4. WHEN the default prompt is used THEN it SHALL instruct the LLM to use TaskNotes-compatible status and priority values
5. WHEN the LLM identifies multiple projects THEN they SHALL be returned as an array
6. WHEN the LLM identifies multiple contexts THEN they SHALL be returned as an array
7. WHEN the LLM cannot determine projects or contexts THEN these fields SHALL be empty arrays

### Requirement 8: Migration and Upgrade Support

**User Story:** As an existing user upgrading to the TaskNotes-compatible version, I want clear guidance on how the changes will affect my workflow, so that I can make informed decisions about my configuration.

#### Acceptance Criteria

1. WHEN upgrading from a previous version THEN the plugin SHALL display a migration notice explaining the changes
2. WHEN upgrading THEN the user SHALL be offered the choice to keep existing settings or migrate to TaskNotes format
3. WHEN choosing to migrate THEN the user SHALL see a preview of how their frontmatter will change
4. WHEN migration is complete THEN the user SHALL receive confirmation of the changes made
5. WHEN migration fails THEN the user SHALL be able to revert to their previous settings
6. WHEN the user wants to understand the changes THEN there SHALL be documentation explaining the differences between formats