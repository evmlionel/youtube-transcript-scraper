# YouTube Transcript Scraper

A Chrome extension that extracts and formats transcripts from YouTube videos with multiple output options.

## Features

- Extract transcripts from any YouTube video with available captions
- Multiple transcript formats supported:
  - Plain Text (.txt)
  - SubRip Subtitle (.srt)
  - WebVTT (.vtt)
- Optional timestamp inclusion
- Copy to clipboard functionality
- Download transcripts in your preferred format
- Clean, modern user interface
- Multiple fallback methods for reliable transcript extraction

## Installation

1. Clone this repository:
```bash
git clone https://github.com/yourusername/youtube-transcript-scraper.git
```

2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory

## Usage

1. Navigate to any YouTube video
2. Click the extension icon in your Chrome toolbar
3. Click "Get Transcript" to extract the video's transcript
4. Choose your preferred format (TXT, SRT, or VTT)
5. Toggle timestamps on/off as needed
6. Copy to clipboard or download the formatted transcript

## Development

The extension is built using vanilla JavaScript and follows Chrome's Manifest V3 specifications. Key components:

- `manifest.json`: Extension configuration
- `popup.html/js`: User interface and interaction handling
- `content.js`: Transcript extraction logic
- `transcriptData.js`: Shared transcript formatting functionality

## License

MIT License

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request
