# Requirements Document

## Introduction

This feature enhances the Obsidian Task Extractor plugin by making the frontmatter filtering system more flexible and improving the user experience in the settings interface. Currently, the plugin is hardcoded to use the "Type" frontmatter field as the basis for filtering notes, which limits its adaptability to different user workflows. Additionally, the advanced settings use sliders without visible values, making it difficult for users to configure precise settings.

## Requirements

### Requirement 1

**User Story:** As a plugin user, I want to choose which frontmatter field to use as the basis for filtering notes, so that I can adapt the plugin to my existing note organization system.

#### Acceptance Criteria

1. WHEN the user opens the plugin settings THEN the system SHALL display a configurable field selector for frontmatter filtering
2. WHEN the user selects a different frontmatter field THEN the system SHALL update the filtering logic to use the selected field
3. WHEN the user saves the settings THEN the system SHALL persist the selected frontmatter field preference
4. IF no frontmatter field is selected THEN the system SHALL default to "Type" for backward compatibility
5. WHEN processing notes THEN the system SHALL filter based on the user-configured frontmatter field instead of hardcoded "Type"

### Requirement 2

**User Story:** As a plugin maintainer, I want to update the manifest.json version number to reflect the current plugin version, so that users can track plugin updates correctly.

#### Acceptance Criteria

1. WHEN reviewing the manifest.json file THEN the system SHALL have the correct current version number
2. WHEN the plugin is installed or updated THEN Obsidian SHALL display the accurate version information
3. WHEN comparing with package.json THEN the version numbers SHALL be consistent across configuration files

### Requirement 3

**User Story:** As a plugin user, I want to see and input specific numerical values in the advanced settings, so that I can configure precise settings instead of guessing with sliders.

#### Acceptance Criteria

1. WHEN the user views advanced settings THEN the system SHALL display current numerical values for all slider controls
2. WHEN the user adjusts a slider THEN the system SHALL show the updated numerical value in real-time
3. WHEN the user wants to input a specific value THEN the system SHALL provide input fields alongside sliders for precise entry
4. WHEN the user enters a value in an input field THEN the system SHALL update the corresponding slider position
5. WHEN the user moves a slider THEN the system SHALL update the corresponding input field value
6. IF the user enters an invalid value THEN the system SHALL provide clear validation feedback and prevent saving