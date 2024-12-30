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
  const themeToggle = document.getElementById('theme-toggle');

  // Set initial theme on load
  const savedTheme =
    localStorage.getItem('theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light');
  document.documentElement.setAttribute('data-theme', savedTheme);
  themeToggle.textContent = savedTheme === 'dark' ? '🌙' : '☀️';

  function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    // Trigger animation
    setTimeout(() => notification.classList.add('show'), 10);

    // Remove after 2 seconds
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 2000);
  }

  function updateStatus(message, isError = false) {
    statusDiv.textContent = message;
    statusDiv.style.color = isError ? '#EA4335' : '#34A853';
    if (message) {
      showNotification(message, isError ? 'error' : 'success');
    }
  }

  function updateButtons(enabled) {
    copyTranscriptBtn.disabled = !enabled;
    downloadTranscriptBtn.disabled = !enabled;
  }

  function updateTranscriptPreview() {
    if (!currentTranscriptData) return;

    const format = formatSelect.value;
    const withTimestamps = includeTimestamps.checked;
    const formattedTranscript = currentTranscriptData.getFormattedTranscript(
      format,
      withTimestamps
    );

    // Show preview (first 500 characters)
    transcriptPreview.textContent =
      formattedTranscript.slice(0, 500) +
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
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab.url.includes('youtube.com/watch')) {
        throw new Error('Please navigate to a YouTube video page first.');
      }

      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'getTranscript',
      });

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
      const formattedTranscript = currentTranscriptData.getFormattedTranscript(
        format,
        withTimestamps
      );

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
      const formattedTranscript = currentTranscriptData.getFormattedTranscript(
        format,
        withTimestamps
      );

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

  // Add keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Use Command key (metaKey) for Mac instead of Alt
    if (e.metaKey && ['g', 'c', 'd'].includes(e.key.toLowerCase())) {
      e.preventDefault();

      switch (e.key.toLowerCase()) {
        case 'g':
          if (!getTranscriptBtn.disabled) {
            getTranscriptBtn.click();
            getTranscriptBtn.focus();
          }
          break;
        case 'c':
          if (!copyTranscriptBtn.disabled) {
            copyTranscriptBtn.click();
            copyTranscriptBtn.focus();
          }
          break;
        case 'd':
          if (!downloadTranscriptBtn.disabled) {
            downloadTranscriptBtn.click();
            downloadTranscriptBtn.focus();
          }
          break;
      }
    }
  });

  // Add tooltip information to buttons with Mac-specific shortcuts
  const buttons = [getTranscriptBtn, copyTranscriptBtn, downloadTranscriptBtn];
  buttons.forEach((button) => {
    const shortcut = button
      .getAttribute('aria-label')
      .match(/\(([^)]+)\)/)[1]
      .replace('Alt', '⌘');
    button.title = `${button.textContent.trim()} (${shortcut})`;
    // Also update the aria-label
    button.setAttribute(
      'aria-label',
      button.getAttribute('aria-label').replace('Alt', '⌘')
    );
  });

  // Theme toggle handler with immediate visual feedback
  themeToggle.addEventListener('click', () => {
    const currentTheme =
      document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    // Update emoji and apply theme immediately
    themeToggle.textContent = newTheme === 'dark' ? '🌙' : '☀️';
  });
});
