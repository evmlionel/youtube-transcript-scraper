class TranscriptData {
  constructor(segments, videoId) {
    this.segments = segments;
    this.videoId = videoId;
  }

  // Format as plain text
  toText(includeTimestamps = false) {
    return this.segments.map(segment => {
      if (includeTimestamps) {
        const time = this.formatTimestamp(segment.start);
        return `[${time}] ${segment.text}`;
      }
      return segment.text;
    }).join('\n');
  }

  // Format as SRT
  toSRT() {
    return this.segments.map((segment, index) => {
      const startTime = this.formatSRTTimestamp(segment.start);
      const endTime = this.formatSRTTimestamp(segment.start + segment.duration);
      return `${index + 1}\n${startTime} --> ${endTime}\n${segment.text}\n`;
    }).join('\n');
  }

  // Format as VTT
  toVTT() {
    const header = 'WEBVTT\n\n';
    const body = this.segments.map((segment, index) => {
      const startTime = this.formatVTTTimestamp(segment.start);
      const endTime = this.formatVTTTimestamp(segment.start + segment.duration);
      return `${startTime} --> ${endTime}\n${segment.text}\n`;
    }).join('\n');
    return header + body;
  }

  // Format timestamp for plain text (MM:SS)
  formatTimestamp(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  // Format timestamp for SRT (HH:MM:SS,mmm)
  formatSRTTimestamp(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  }

  // Format timestamp for VTT (HH:MM:SS.mmm)
  formatVTTTimestamp(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }

  // Get suggested filename based on format
  getFilename(format) {
    const title = `youtube_transcript_${this.videoId}`;
    switch (format) {
      case 'srt':
        return `${title}.srt`;
      case 'vtt':
        return `${title}.vtt`;
      default:
        return `${title}.txt`;
    }
  }

  // Get formatted transcript based on format
  getFormattedTranscript(format, includeTimestamps = false) {
    switch (format) {
      case 'srt':
        return this.toSRT();
      case 'vtt':
        return this.toVTT();
      default:
        return this.toText(includeTimestamps);
    }
  }
}
