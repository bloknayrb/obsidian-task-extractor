# 🎯 Obsidian Task Extractor v2.2.0 (In Development)

## Manual Task Extraction Command

This release introduces manual task extraction capabilities, allowing users to process any note on-demand.

### 🆕 New Features

#### Manual Task Extraction Command
- **On-demand processing**: Extract tasks from any note using the command palette
- **Command ID**: `task-extractor:extract-current-note`
- **Command name**: "Extract tasks from current note"
- **Flexible processing**: Works on any markdown note, ignoring frontmatter trigger types
- **User feedback**: Clear notifications for success, errors, and edge cases

#### Usage
1. Open any markdown note
2. Open Command Palette (Ctrl/Cmd + P)
3. Search for "Extract tasks from current note"
4. Press Enter to execute

#### Benefits
- Process notes that don't match trigger types
- Extract tasks from imported or legacy notes
- Test task extraction on specific content
- Override automatic processing rules

### 🔧 Technical Implementation
- Integrated command registration in main plugin lifecycle
- Proper error handling and user feedback
- Validation for active file and markdown format
- Integration with existing task processing pipeline

---

# 🎯 Obsidian Task Extractor v2.1.0

## Flexible Frontmatter Filtering & Enhanced UI

This release introduces new customization options and improved user interface components while maintaining full backward compatibility.

### 🆕 New Features

#### Flexible Frontmatter Field Configuration
- **Customize trigger field**: No longer limited to "Type" - use any frontmatter field name
- **YAML validation**: Automatic validation ensures field names follow proper YAML conventions
- **Graceful fallback**: Invalid field names automatically fallback to "Type" with user notification
- **Backward compatible**: Existing configurations continue to work unchanged

```yaml
---
Category: Email     # Custom field instead of "Type"
NoteType: Meeting   # Or any other field name
---
```

#### Enhanced Slider Components
- **Bidirectional synchronization**: Sliders and input fields stay in sync
- **Real-time validation**: Immediate feedback for out-of-bounds values
- **Visual feedback**: Clear indication of invalid inputs with helpful messages
- **Improved accessibility**: Better keyboard navigation and screen reader support

#### Comprehensive Input Validation
- **Bounds checking**: All numeric inputs automatically clamped to valid ranges
- **NaN handling**: Graceful handling of invalid numeric inputs
- **Error messages**: Clear, actionable feedback for configuration issues
- **Default fallbacks**: Automatic recovery from corrupted settings

### 🔧 Technical Improvements

- **74 tests**: Full test coverage ensuring reliability and preventing regressions
- **Type safety**: Enhanced TypeScript typing throughout the codebase
- **Error handling**: Robust error handling with user-friendly messages
- **Performance**: Maintained all existing performance optimizations
- **Code quality**: Improved maintainability and documentation

### 🔄 Backward Compatibility

- ✅ All existing configurations work unchanged
- ✅ No breaking changes to plugin API
- ✅ Upgrade path from any previous version
- ✅ Default settings preserve existing behavior

### 📋 Configuration Examples

#### Basic Setup (unchanged)
```yaml
---
Type: Email  # Traditional setup still works
---
```

#### Custom Field Setup (new)
```yaml
---
Category: Email        # Use "Category" instead of "Type"
DocumentType: Meeting  # Or any other field name
---
```

### 🚀 Installation

1. **Automatic Update**: If you have the plugin installed, it will update automatically
2. **Manual Installation**: Download `main.js`, `manifest.json`, and `styles.css` to your `.obsidian/plugins/task-extractor/` folder
3. **First Time**: Enable the plugin in Obsidian Settings → Community Plugins

### 🔧 Settings Migration

No action required! Your existing settings will continue to work exactly as before. The new frontmatter field option will default to "Type" for backward compatibility.

### 🐛 Bug Fixes

- Fixed potential race conditions in file processing
- Improved error handling for corrupted settings
- Enhanced validation for all configuration options
- Better handling of edge cases in frontmatter parsing

### 📊 Quality Metrics

- **Test Coverage**: 74 unit and integration tests (100% pass rate)
- **Type Safety**: Full TypeScript coverage with strict typing
- **Performance**: No regression in existing optimizations
- **Compatibility**: Tested with Obsidian 0.13.0+

---

**Full Changelog**: https://github.com/bloknayrb/obsidian-task-extractor/compare/v2.0.0...v2.1.0