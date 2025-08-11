# Design Document

## Overview

This design enhances the Obsidian Task Extractor plugin by introducing flexible frontmatter field selection, updating version management, and improving the advanced settings user interface. The changes maintain backward compatibility while providing users with greater customization options.

## Architecture

The solution involves modifications to three core areas:

1. **Settings Management** (`src/settings.ts`): Add UI controls for frontmatter field selection and enhanced slider inputs
2. **Task Processing** (`src/task-processor.ts`): Update filtering logic to use configurable frontmatter field
3. **Type Definitions** (`src/types.ts`): Add new configuration options to the settings interface
4. **Version Management** (`manifest.json`): Update to current version number

## Components and Interfaces

### Enhanced Settings Interface

```typescript
interface ExtractorSettings {
  // ... existing fields ...
  
  // New field for configurable frontmatter filtering
  triggerFrontmatterField: string; // defaults to "Type" for backward compatibility
  
  // ... existing fields remain unchanged ...
}
```

### Settings UI Components

The settings UI will be enhanced with:

1. **Frontmatter Field Selector**: A text input allowing users to specify which frontmatter field to use for filtering
2. **Enhanced Slider Controls**: Combination of sliders with accompanying number inputs for precise value entry
3. **Real-time Value Display**: Show current numerical values alongside all slider controls

### Task Processing Logic Updates

The `TaskProcessor` class will be modified to:

1. Use the configurable frontmatter field instead of hardcoded "Type"
2. Maintain backward compatibility by defaulting to "Type" when no field is specified
3. Update both file scanning and real-time processing to use the new field

## Data Models

### Settings Schema Changes

```typescript
// Addition to DEFAULT_SETTINGS
const DEFAULT_SETTINGS: ExtractorSettings = {
  // ... existing settings ...
  triggerFrontmatterField: 'Type', // New field with backward-compatible default
  // ... rest unchanged ...
};
```

### UI Component Models

```typescript
interface SliderWithInput {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}
```

## Implementation Details

### 1. Frontmatter Field Configuration

**Location**: `src/settings.ts` - Processing Settings section

- Add a new setting control after "Trigger note types"
- Text input field with validation
- Default value of "Type" for backward compatibility
- Clear description explaining the purpose

**Processing Logic**: `src/task-processor.ts`

- Replace hardcoded "Type" references with `this.settings.triggerFrontmatterField`
- Update both `onFileChanged()` and `getUnprocessedFiles()` methods
- Maintain case-insensitive comparison logic

### 2. Enhanced Slider Controls

**Location**: `src/settings.ts` - Advanced Settings section

For each advanced setting (maxTokens, temperature, timeout, retries):

- Create a container div for slider + input combination
- Add number input field alongside existing slider
- Implement bidirectional synchronization between slider and input
- Add validation for input fields with appropriate min/max constraints
- Display current value prominently

**UI Layout**:
```
Setting Name
Description
[Slider ────●────] [Input: 800]
```

### 3. Version Number Update

**Location**: `manifest.json`

- Update version number to reflect current plugin state
- Ensure consistency with any package.json version if present
- Follow semantic versioning principles

## Error Handling

### Frontmatter Field Validation

- **Empty Field**: Default to "Type" if user leaves field empty
- **Invalid Characters**: Accept any valid YAML key characters
- **Runtime Errors**: Graceful fallback to "Type" if configured field causes issues

### Slider Input Validation

- **Out of Range Values**: Clamp to min/max bounds with user notification
- **Invalid Input**: Prevent non-numeric input, show validation message
- **Synchronization Errors**: Ensure slider and input always stay in sync

### Backward Compatibility

- **Existing Configurations**: All existing settings continue to work unchanged
- **Migration**: No migration needed - new field defaults to current behavior
- **API Compatibility**: No breaking changes to existing interfaces

## Testing Strategy

### Unit Testing Areas

1. **Settings Persistence**: Verify new frontmatter field setting saves and loads correctly
2. **Processing Logic**: Test filtering with various frontmatter field configurations
3. **UI Synchronization**: Verify slider and input field stay synchronized
4. **Validation**: Test input validation and error handling

### Integration Testing

1. **End-to-End Processing**: Test complete workflow with custom frontmatter field
2. **Settings UI**: Verify all controls work correctly in Obsidian environment
3. **Backward Compatibility**: Test existing configurations continue working

### Manual Testing Scenarios

1. **Default Behavior**: Verify plugin works exactly as before with no configuration changes
2. **Custom Field**: Test with different frontmatter field names (e.g., "Category", "NoteType")
3. **Advanced Settings**: Test precise value entry via input fields
4. **Edge Cases**: Test with empty fields, invalid values, and boundary conditions

## Migration Strategy

### Phase 1: Core Implementation
- Add new settings field with default value
- Update processing logic to use configurable field
- Maintain all existing behavior as default

### Phase 2: UI Enhancements
- Implement enhanced slider controls
- Add input validation and synchronization
- Update version number

### Phase 3: Testing and Validation
- Comprehensive testing of all scenarios
- Verify backward compatibility
- Performance validation

## Performance Considerations

### Processing Impact
- **Minimal Overhead**: Using configurable field name adds negligible processing cost
- **Caching**: Existing caching mechanisms remain effective
- **Memory Usage**: New settings add minimal memory footprint

### UI Responsiveness
- **Debounced Updates**: Maintain existing 500ms debouncing for settings saves
- **Real-time Sync**: Slider-input synchronization should be immediate but not trigger saves
- **Validation**: Input validation should be fast and non-blocking

## Security Considerations

### Input Validation
- **Frontmatter Field**: Validate against YAML key naming conventions
- **Numeric Inputs**: Ensure proper bounds checking and type validation
- **XSS Prevention**: Sanitize any user input displayed in UI

### Data Integrity
- **Settings Corruption**: Graceful handling of invalid configuration values
- **Fallback Behavior**: Always fall back to safe defaults if configuration is corrupted