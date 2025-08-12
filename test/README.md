# Test Suite for Flexible Frontmatter Filtering Feature

This test suite validates the implementation of the flexible frontmatter filtering feature and enhanced slider components for the Obsidian Task Extractor plugin.

## Test Coverage

### 1. Types and Settings Validation (`test/types.test.ts`)
- **Frontmatter field configuration**: Tests saving, loading, and validation of custom frontmatter field names
- **YAML key format validation**: Ensures field names follow proper YAML key conventions
- **Numeric input validation**: Tests bounds checking and clamping for all numeric settings
- **Backward compatibility**: Verifies existing configurations continue to work

### 2. Task Processing Logic (`test/task-processor.test.ts`)
- **Custom frontmatter field usage**: Tests that the processor uses the configured field instead of hardcoded "Type"
- **Field validation and fallback**: Tests graceful fallback to "Type" when invalid field names are provided
- **Case-insensitive comparison**: Verifies trigger type matching works regardless of case
- **File filtering**: Tests that `getUnprocessedFiles()` uses the configured frontmatter field

### 3. Settings UI Components (`test/settings.test.ts`)
- **Slider-input synchronization**: Tests bidirectional synchronization between sliders and input fields
- **Input validation**: Tests bounds checking, NaN handling, and validation feedback
- **Frontmatter field validation**: Tests YAML key validation in the UI
- **Numeric validation helpers**: Tests the validation utility functions

### 4. Integration Tests (`test/integration.test.ts`)
- **End-to-end processing**: Tests complete workflow with custom frontmatter fields
- **Settings persistence**: Tests that settings are properly validated when loaded
- **Backward compatibility**: Tests that existing configurations work without modification
- **Error handling**: Tests graceful handling of corrupted settings and missing configuration
- **Reset functionality**: Tests reset button behavior, debounced saves, and UI consistency

## Key Test Scenarios

### Frontmatter Field Configuration
- ✅ Custom field names (e.g., "Category", "NoteType") are saved and used correctly
- ✅ Invalid field names fallback to "Type" for backward compatibility
- ✅ YAML key validation prevents problematic field names
- ✅ Empty or whitespace-only field names are handled gracefully

### Task Processing
- ✅ Files are processed based on the configured frontmatter field
- ✅ Case-insensitive matching works with custom fields
- ✅ Files with non-matching field values are ignored
- ✅ Backward compatibility with existing "Type" field configurations

### Input Validation
- ✅ Numeric inputs are clamped to valid ranges (maxTokens: 100-2000, temperature: 0-1, etc.)
- ✅ NaN values are handled gracefully with fallback to defaults
- ✅ Slider-input synchronization works in both directions
- ✅ Validation feedback is provided for invalid inputs

### Reset Functionality
- ✅ Reset button updates text area with default prompt
- ✅ Reset triggers debounced save mechanism (500ms delay)
- ✅ Reset works when custom prompt is empty
- ✅ Reset works when custom prompt contains default text
- ✅ Settings object updated immediately for UI consistency
- ✅ Graceful handling of empty owner names during reset
- ✅ Display refresh functionality after reset

### Backward Compatibility
- ✅ Existing configurations without `triggerFrontmatterField` default to "Type"
- ✅ All existing settings continue to work unchanged
- ✅ No breaking changes to the plugin API

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui
```

## Test Structure

The tests use Vitest with jsdom environment for DOM testing. Key testing patterns:

- **Mocking**: Obsidian API is mocked to allow testing without the full Obsidian environment
- **Unit Testing**: Individual functions and methods are tested in isolation
- **Integration Testing**: Complete workflows are tested end-to-end
- **Validation Testing**: Input validation and error handling are thoroughly tested

## Requirements Coverage

All requirements from the specification are covered:

- **Requirement 1.1**: Frontmatter field configuration ✅
- **Requirement 1.2**: Settings UI for field selection ✅
- **Requirement 1.3**: Settings persistence ✅
- **Requirement 1.4**: Validation and fallback behavior ✅
- **Requirement 1.5**: Processing logic updates ✅
- **Requirement 3.1-3.6**: Enhanced slider components ✅
- **Requirement 2.1-2.3**: Version management (tested conceptually) ✅

The test suite ensures that the flexible frontmatter filtering feature works correctly, maintains backward compatibility, and provides a robust user experience.