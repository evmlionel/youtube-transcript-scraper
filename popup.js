let currentTranscriptData = null;

document.addEventListener('DOMContentLoaded', () => {
  const getTranscriptBtn = document.getElementById('getTranscript');
  const copyTranscriptBtn = document.getElementById('copyTranscript');
  const downloadTranscriptBtn = document.getElementById('downloadTranscript');
  const formatSelect = document.getElementById('format'); 
  const includeTimestamps = document.getElementById('includeTimestamps');
  const statusDiv = document.getElementById('status');
  const transcriptPreview = document.getElementById('transcriptPreview'); 
  const spinner = document.querySelector('.spinner');

  function updateStatus(message, isError = false) {
    statusDiv.textContent = message;
    statusDiv.style.color = isError ? 'red' : 'green';
  }

  function updateButtons(enabled) {
    copyTranscriptBtn.disabled = !enabled;
    downloadTranscriptBtn.disabled = !enabled;
  }

  function updateTranscriptPreview() {
    if (!currentTranscriptData) return;

    const format = formatSelect.value;
    const withTimestamps = includeTimestamps.checked;
    const formattedTranscript = currentTranscriptData.getFormattedTranscript(format, withTimestamps);
    
    // Show preview (first 500 characters)
    transcriptPreview.textContent = formattedTranscript.slice(0, 500) + 
      (formattedTranscript.length > 500 ? '...' : '');
  }

  function showSpinner(show) {
    spinner.style.display = show ? 'block' : 'none';
    getTranscriptBtn.disabled = show;
  }

  getTranscriptBtn.addEventListener('click', async () => {
    showSpinner(true);
    updateButtons(false);
    updateStatus('');
    transcriptPreview.textContent = '';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!tab.url.includes('youtube.com/watch')) {
        throw new Error('Please navigate to a YouTube video page first.');
      }

      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getTranscript' });
      
      if (response.transcriptData.error) {
        throw new Error(response.transcriptData.error);
      }

      currentTranscriptData = new TranscriptData(
        response.transcriptData.segments,
        response.transcriptData.videoId
      );

      updateTranscriptPreview();
      updateButtons(true);
      updateStatus('Transcript loaded successfully!');
    } catch (error) {
      console.error('Error:', error);
      updateStatus(error.message || 'Failed to get transcript', true);
      updateButtons(false);
    } finally {
      showSpinner(false);
    }
  });

  copyTranscriptBtn.addEventListener('click', async () => {
    if (!currentTranscriptData) return;

    try {
      const format = formatSelect.value;
      const withTimestamps = includeTimestamps.checked;
      const formattedTranscript = currentTranscriptData.getFormattedTranscript(format, withTimestamps);
      
      await navigator.clipboard.writeText(formattedTranscript);
      updateStatus('Copied to clipboard!');
      
      // Clear success message after 2 seconds
      setTimeout(() => {
        updateStatus('');
      }, 2000);
    } catch (error) {
      updateStatus('Failed to copy: ' + error.message, true);
    }
  });

  downloadTranscriptBtn.addEventListener('click', () => {
    if (!currentTranscriptData) return;

    try {
      const format = formatSelect.value;
      const withTimestamps = includeTimestamps.checked;
      const formattedTranscript = currentTranscriptData.getFormattedTranscript(format, withTimestamps);
      
      const blob = new Blob([formattedTranscript], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const filename = currentTranscriptData.getFilename(format);

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();

      URL.revokeObjectURL(url);
      updateStatus('Download started!');
      
      // Clear success message after 2 seconds
      setTimeout(() => {
        updateStatus('');
      }, 2000);
    } catch (error) {
      updateStatus('Failed to download: ' + error.message, true);
    }
  });

  // Update preview when format or timestamp option changes
  formatSelect.addEventListener('change', updateTranscriptPreview);
  includeTimestamps.addEventListener('change', updateTranscriptPreview);
});
