# Requirements Document

## Introduction

This feature enhances the existing custom prompt functionality in the Obsidian Task Extractor plugin by adding a "Reset to Default" button alongside the custom prompt text area. This allows users to easily revert their custom prompt modifications back to the plugin's default prompt without having to manually clear the field or remember the original text.

## Requirements

### Requirement 1

**User Story:** As a plugin user, I want to be able to reset my custom prompt back to the default prompt, so that I can easily undo my customizations without losing the original prompt text.

#### Acceptance Criteria

1. WHEN the user clicks the "Reset to Default" button THEN the system SHALL replace the current custom prompt text with the default prompt text
2. WHEN the user clicks the "Reset to Default" button THEN the system SHALL save the settings automatically using the existing debounced save mechanism
3. WHEN the user clicks the "Reset to Default" button THEN the system SHALL update the text area display to show the default prompt immediately
4. WHEN the custom prompt field is empty THEN the system SHALL still show the "Reset to Default" button for consistency
5. WHEN the custom prompt field contains the exact default prompt text THEN the system SHALL still allow the reset operation to work normally

### Requirement 2

**User Story:** As a plugin user, I want the "Reset to Default" button to be clearly labeled and positioned near the custom prompt field, so that I can easily find and use this functionality.

#### Acceptance Criteria

1. WHEN viewing the settings page THEN the system SHALL display a "Reset to Default" button adjacent to the custom prompt text area
2. WHEN viewing the settings page THEN the button SHALL be clearly labeled as "Reset to Default" 
3. WHEN viewing the settings page THEN the button SHALL follow the existing plugin's UI styling conventions
4. WHEN the user hovers over the button THEN the system SHALL provide appropriate visual feedback consistent with other buttons in the settings

### Requirement 3

**User Story:** As a plugin user, I want to understand what the default prompt contains, so that I can make informed decisions about whether to reset or keep my customizations.

#### Acceptance Criteria

1. WHEN the user views the custom prompt setting THEN the system SHALL provide a description that mentions the reset functionality
2. WHEN the custom prompt field is empty THEN the system SHALL continue to use the default prompt for task extraction as it currently does
3. WHEN the user resets to default THEN the system SHALL populate the text area with the actual default prompt text (not leave it empty)