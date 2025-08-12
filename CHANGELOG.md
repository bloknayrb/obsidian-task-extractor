# Changelog

All notable changes to this project will be documented in this file.

## [2.2.1] - 2025-08-12

### Added
- Comprehensive file/folder exclusion system implementation
- Support for exact path exclusions and glob pattern matching
- New settings UI section for exclusion configuration
- Enhanced file processing with exclusion checks
- Cross-platform path normalization for exclusions

### Changed
- Improved code formatting and consistency throughout main.js
- Enhanced settings validation for exclusion arrays
- Optimized file processing flow with early exclusion checks

### Technical Details
- Added `excludedPaths` and `excludedPatterns` to default settings
- Implemented `isPathExcluded()`, `matchesExclusionPattern()`, and `isFileExcluded()` methods
- Added `globToRegex()` utility for pattern matching
- Enhanced settings validation with path length and character restrictions
- Updated settings UI with comprehensive exclusion examples and documentation

## [2.2.0] - Previous Release
- Add comprehensive file/folder exclusion system v2.2.0
- Enhanced Anthropic Claude model support
- API error handling improvements
- Configurable Anthropic URL support
- Security patches and documentation updates