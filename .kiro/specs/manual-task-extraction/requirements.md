# Requirements Document

## Introduction

This feature adds a manual command to the Obsidian Task Extractor plugin that allows users to run task extraction on the currently active note. The command will be accessible through the command palette and can be assigned a custom hotkey for quick access. This gives users more control over when task extraction occurs, complementing the existing automatic processing based on frontmatter triggers.

## Requirements

### Requirement 1

**User Story:** As a user, I want to manually trigger task extraction on the current note via a command, so that I can process notes on-demand without relying solely on automatic frontmatter-based triggers.

#### Acceptance Criteria

1. WHEN the user invokes the "Extract tasks from current note" command THEN the system SHALL process the currently active note for task extraction
2. WHEN no note is currently active THEN the system SHALL display an appropriate error message
3. WHEN the command is executed THEN the system SHALL use the same task extraction logic as the automatic processing
4. WHEN the command is executed THEN the system SHALL respect all existing plugin settings (owner name, LLM provider, frontmatter templates, etc.)

### Requirement 2

**User Story:** As a user, I want to assign a custom hotkey to the manual task extraction command, so that I can quickly trigger task extraction without navigating through menus.

#### Acceptance Criteria

1. WHEN the plugin is loaded THEN the system SHALL register a command that appears in Obsidian's hotkey settings
2. WHEN the user assigns a hotkey to the command THEN the system SHALL execute task extraction when the hotkey is pressed
3. WHEN the hotkey is pressed and no note is active THEN the system SHALL display an appropriate error message

### Requirement 3

**User Story:** As a user, I want the manual command to work regardless of the note's frontmatter type, so that I can extract tasks from any note when needed.

#### Acceptance Criteria

1. WHEN the manual command is executed THEN the system SHALL process the note regardless of its frontmatter type
2. WHEN the manual command is executed on a note without frontmatter THEN the system SHALL still attempt task extraction
3. WHEN the manual command is executed THEN the system SHALL bypass the frontmatter type filtering that applies to automatic processing

### Requirement 4

**User Story:** As a user, I want visual feedback when the manual command is executed, so that I know the system is processing my request and can see the results.

#### Acceptance Criteria

1. WHEN the manual command starts processing THEN the system SHALL display a notice indicating task extraction has started
2. WHEN task extraction completes successfully THEN the system SHALL display a notice showing the number of tasks extracted
3. WHEN task extraction fails THEN the system SHALL display an error notice with relevant details
4. WHEN no tasks are found in the note THEN the system SHALL display a notice indicating no tasks were found

### Requirement 5

**User Story:** As a user, I want the manual command to always create new tasks regardless of previous processing, so that I can re-extract tasks when notes are updated or when I want fresh task creation.

#### Acceptance Criteria

1. WHEN the manual command is executed THEN the system SHALL always attempt to create new tasks regardless of previous processing
2. WHEN the manual command is executed on a previously processed note THEN the system SHALL create new tasks without checking for duplicates
3. WHEN the manual command completes THEN the system SHALL NOT mark the note as processed for duplicate prevention

### Requirement 6

**User Story:** As a user, I want all created tasks to include a link back to the source note, so that I can easily navigate back to the original context.

#### Acceptance Criteria

1. WHEN a task is created (manually or automatically) THEN the system SHALL include a [[wikilink]] to the source note in the task content
2. WHEN a task is created THEN the link SHALL use the source note's filename without the .md extension
3. WHEN a task is created THEN the source link SHALL be clearly identifiable within the task note structure

### Requirement 7

**User Story:** As a user, I want all created tasks to have a configurable "Type" field with a default value of "Task", so that I can categorize and filter my task notes consistently.

#### Acceptance Criteria

1. WHEN a task is created THEN the system SHALL add a "Type" field to the frontmatter with the configured default value
2. WHEN no custom Type value is configured THEN the system SHALL use "Task" as the default value
3. WHEN the user configures a different default Type value THEN the system SHALL use that value for all newly created tasks

### Requirement 8

**User Story:** As a user, I want to customize the frontmatter field names, types, and requirements for task notes, so that I can adapt the plugin to my personal note-taking system.

#### Acceptance Criteria

1. WHEN I access the plugin settings THEN the system SHALL provide a "Task Notes Frontmatter" configuration section
2. WHEN I configure frontmatter fields THEN the system SHALL allow me to specify field names, data types, and whether each field is required
3. WHEN I configure frontmatter fields THEN the system SHALL validate that required fields are properly configured
4. WHEN a task is created THEN the system SHALL apply the configured frontmatter template with the specified field names and types
5. WHEN a required frontmatter field cannot be populated THEN the system SHALL display an appropriate error message