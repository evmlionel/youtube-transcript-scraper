# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome browser extension that extracts and formats transcripts from YouTube videos. The extension uses vanilla JavaScript with no build system, following a class-based architecture with clear separation of concerns.

## Development Workflow

**No build system required** - this extension uses vanilla JavaScript without transpilation or bundling.

### Development Setup
1. Load unpacked extension in Chrome developer mode from the project root
2. Make changes directly to source files
3. Reload extension in Chrome to test changes

### Testing Changes
- Test on various YouTube videos with different caption availability
- Verify all three extraction methods work properly
- Test both light and dark theme modes
- Verify keyboard shortcuts (⌘+G, ⌘+C, ⌘+D on Mac)

## Architecture

### Core Components Flow
```
content.js (YouTube page) ←→ popup.js (Extension UI)
     ↓                              ↓
transcriptData.js (Formatting) ← storage.js (Caching)
     ↓
utils.js (Utilities)
```

### Key Files and Responsibilities

**content.js** - Main extraction logic with three fallback methods:
- `fetchTranscriptFromAPI()` - Primary YouTube caption tracks API
- `fetchTranscriptFromPage()` - Secondary ytInitialData parsing
- `fetchTranscriptFromLegacyAPI()` - Tertiary legacy timedtext API

**popup.js** - UI management with debounced actions and theme switching

**transcriptData.js** - `TranscriptData` class formats to .txt, .srt, .vtt with timestamp handling

**storage.js** - `TranscriptStorage` class with 24-hour cache expiration and LRU eviction

**utils.js** - `RetryUtils`, `NetworkUtils`, `PerformanceUtils` classes

### Chrome Extension Architecture
- **Manifest V3** with minimal permissions (`activeTab`, `scripting`, `clipboardWrite`, `storage`)
- **Content script injection** on YouTube pages in specific load order
- **Runtime messaging** between popup and content script
- **Host permissions** for `youtube.com` and `googlevideo.com` domains

## Important Implementation Details

### Error Handling Pattern
All async operations use comprehensive try-catch blocks with fallback methods. The extension implements retry logic with exponential backoff for network requests.

### Performance Optimizations
- Transcript caching with 50-item limit and LRU eviction
- Debounced UI actions to prevent rapid-fire operations
- Memory cleanup in popup lifecycle management

### Accessibility Features
The popup uses proper ARIA labels, roles, and supports keyboard navigation with custom shortcuts.

### Theme System
Dark/light mode toggle uses CSS custom properties stored in Chrome storage, with system preference detection.

## Extension Loading Order
Content scripts load in sequence: `utils.js` → `storage.js` → `transcriptData.js` → `content.js`

## Common Debugging Areas
- Transcript extraction failures: Check all three methods in content.js
- Theme switching issues: Verify CSS custom properties in popup.html
- Storage problems: Check cache limits and expiration in storage.js
- Message passing: Verify runtime messaging between popup and content script