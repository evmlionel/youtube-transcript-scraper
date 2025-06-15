# Testing Guide for Transcript Extraction Fix

## Quick Testing Steps

1. **Load the extension** in Chrome developer mode from this directory
2. **Navigate to a YouTube video** with captions (e.g., TED talks, educational videos)
3. **Click the extension icon** and try "Get Transcript"
4. **Check browser console** for detailed debug logs

## Debug Features

### Enable Debug Mode
- Debug logging is enabled by default (`DEBUG_MODE = true` in content.js)
- All extraction attempts will log detailed information to console

### Access Debug Interface
- Press **Alt+D** in the popup to reveal debug testing button
- Click "Debug Methods" to test all extraction methods individually
- Results will show which methods succeed/fail

### Manual Testing
Open browser console on a YouTube video page and run:
```javascript
// Test all methods
await window.debugTestAllMethods();

// Test specific method
await window.debugTestMethod('innertube', 'VIDEO_ID_HERE');
```

## What to Look For

### Success Indicators
- ✅ Extension loads transcript successfully
- ✅ Debug console shows method success messages
- ✅ Transcript preview appears in popup

### Failure Analysis
- 🔍 Check console for specific error messages
- 🔍 Note which extraction method(s) fail
- 🔍 Look for network request failures
- 🔍 Check for YouTube structure changes

## Testing Different Video Types

Test on various YouTube videos:
- **Educational videos** (usually have good captions)
- **Music videos** (may have auto-generated captions)
- **News videos** (often have professional captions)
- **Live streams** (may not have captions)

## Reporting Issues

If testing reveals issues:
1. **Include console logs** from debug output
2. **Note the specific video URL** that failed
3. **Specify which extraction methods failed**
4. **Include any network errors** from DevTools

## Expected Behavior

With the new implementation:
1. **InnerTube method** should work for most videos (new primary method)
2. **Fallback methods** will attempt if InnerTube fails
3. **Debug logging** provides detailed extraction pipeline information
4. **User-friendly errors** explain issues clearly