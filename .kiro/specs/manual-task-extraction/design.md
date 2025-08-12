# Design Document

## Overview

This design adds manual task extraction functionality to the Obsidian Task Extractor plugin through a command that can be triggered via hotkey or command palette. The feature extends the existing architecture by adding a command handler that bypasses automatic processing filters and includes enhanced frontmatter customization capabilities.

## Architecture

The manual task extraction feature integrates with the existing modular architecture:

- **TaskExtractorPlugin (main.ts)**: Registers the new command and handles command execution
- **TaskProcessor (src/task-processor.ts)**: Extended with a new method for manual processing that bypasses duplicate prevention
- **ExtractorSettingTab (src/settings.ts)**: Enhanced with a new "Task Notes Frontmatter" configuration section
- **Types (src/types.ts)**: Updated with new settings for frontmatter customization

## Components and Interfaces

### Command Registration

The plugin will register a new Obsidian command:
- **Command ID**: `task-extractor:extract-current-note`
- **Command Name**: "Extract tasks from current note"
- **Callback**: Executes manual task extraction on the active file

### Manual Processing Method

A new method `processFileManually(file: TFile)` will be added to TaskProcessor:
- Bypasses frontmatter type filtering (processes any note)
- Bypasses duplicate prevention (always creates new tasks)
- Uses the same LLM extraction logic as automatic processing
- Provides user feedback through notices

### Enhanced Frontmatter Configuration

The settings interface will be extended with a comprehensive frontmatter customization section:

#### FrontmatterField Interface (existing, to be enhanced)
```typescript
interface FrontmatterField {
  key: string;
  defaultValue: string;
  type: 'text' | 'date' | 'select' | 'boolean';
  options?: string[]; // for select type
  required: boolean;
}
```

#### Default Task Type Configuration
A new setting will be added to specify the default "Type" value for created tasks:
- **Setting**: `defaultTaskType: string`
- **Default Value**: "Task"
- **Usage**: Applied to all created task notes

### Source Note Linking

Task notes will include a link back to the source note:
- Link format: `[[source-note-name]]`
- Placement: In the task note content or as a frontmatter field
- Configuration: Controlled by existing `linkBack` setting

## Data Models

### Extended ExtractorSettings

```typescript
interface ExtractorSettings {
  // ... existing fields ...
  
  // New fields for enhanced frontmatter
  defaultTaskType: string; // Default "Type" value for tasks
  frontmatterFields: FrontmatterField[]; // Enhanced field configuration
}
```

### Task Creation Data Flow

1. **Command Execution**: User triggers command via hotkey/palette
2. **File Validation**: Check if active file exists and is markdown
3. **Content Extraction**: Read file content without frontmatter filtering
4. **LLM Processing**: Use existing task extraction logic
5. **Task Creation**: Create task notes with:
   - Configured frontmatter fields
   - Default "Task" type value
   - Source note link
   - No duplicate prevention marking

## Error Handling

### Command-Level Error Handling
- **No Active File**: Display notice "No active note to process"
- **Non-Markdown File**: Display notice "Active file is not a markdown note"
- **Processing Error**: Display notice "Error extracting tasks - see console"

### Processing-Level Error Handling
- **LLM Failure**: Use existing retry logic and error handling
- **File Creation Error**: Log error and continue with remaining tasks
- **Invalid Frontmatter**: Use default values and log warning

### User Feedback
- **Start Processing**: "Extracting tasks from current note..."
- **Success**: "Created X task note(s)"
- **No Tasks Found**: "No tasks found in current note"
- **Error**: "Error extracting tasks - see console"

## Testing Strategy

### Unit Tests
- **Command Registration**: Verify command is properly registered
- **Manual Processing Logic**: Test bypass of filters and duplicate prevention
- **Frontmatter Generation**: Test field configuration and default values
- **Source Linking**: Verify link creation and format

### Integration Tests
- **End-to-End Command Execution**: Test full workflow from command to task creation
- **Settings Integration**: Test frontmatter customization affects task creation
- **Error Scenarios**: Test handling of invalid files and processing errors

### Manual Testing
- **Hotkey Assignment**: Verify command appears in hotkey settings
- **Various Note Types**: Test on notes with and without frontmatter
- **Multiple Tasks**: Test extraction of multiple tasks from single note
- **Settings Changes**: Test that frontmatter changes affect new tasks

## Implementation Phases

### Phase 1: Core Command Infrastructure
- Register command in main plugin
- Add basic manual processing method
- Implement file validation and user feedback

### Phase 2: Enhanced Processing Logic
- Extend TaskProcessor with manual processing method
- Implement bypass logic for filters and duplicate prevention
- Add source note linking functionality

### Phase 3: Frontmatter Customization
- Add defaultTaskType setting
- Enhance settings UI with frontmatter configuration section
- Implement field validation and management

### Phase 4: Integration and Polish
- Integrate all components
- Add comprehensive error handling
- Implement user feedback system
- Add tests and documentation

## Security Considerations

- **File Access**: Only process files user explicitly selects via command
- **Input Validation**: Validate frontmatter field configurations
- **Error Exposure**: Avoid exposing sensitive information in error messages

## Performance Considerations

- **On-Demand Processing**: Manual command only processes when explicitly triggered
- **Single File Processing**: Only processes active file, not batch processing
- **Existing Optimizations**: Leverage existing debouncing and caching mechanisms

## Backward Compatibility

- **Existing Settings**: All current settings remain unchanged
- **Automatic Processing**: Existing automatic processing continues to work
- **API Compatibility**: No breaking changes to existing interfaces