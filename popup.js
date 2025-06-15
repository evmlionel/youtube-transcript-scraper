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

    let retryCount = 0;
    const maxRetries = 3;

    async function attemptGetTranscript() {
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
          // Provide more helpful error messages based on the error type
          let userFriendlyMessage = response.transcriptData.error;
          
          if (userFriendlyMessage.includes('No captions available')) {
            userFriendlyMessage = 'This video does not have captions/subtitles available. Please try a different video with captions enabled.';
          } else if (userFriendlyMessage.includes('Node cannot be found')) {
            userFriendlyMessage = 'Unable to access video page elements. Please refresh the YouTube page and try again.';
          } else if (userFriendlyMessage.includes('Failed to get transcript data')) {
            userFriendlyMessage = 'Failed to extract transcript. This may be due to YouTube changes or video restrictions.';
          }
          
          throw new Error(userFriendlyMessage);
        }

        return response;
      } catch (error) {
        if (
          retryCount < maxRetries &&
          error.message !== 'Please navigate to a YouTube video page first.'
        ) {
          retryCount++;
          updateStatus(`Retrying... (${retryCount}/${maxRetries})`, true);
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * retryCount)
          );
          return attemptGetTranscript();
        }
        throw error;
      }
    }

    try {
      const response = await attemptGetTranscript();
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

  // Debounce the preview update
  const debouncedPreviewUpdate = PerformanceUtils.debounce(
    updateTranscriptPreview,
    300
  );

  // Debounce button actions
  const debouncedCopy = PerformanceUtils.debounce(async () => {
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
      setTimeout(() => updateStatus(''), 2000);
    } catch (error) {
      updateStatus('Failed to copy: ' + error.message, true);
    }
  }, 300);

  const debouncedDownload = PerformanceUtils.debounce(() => {
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
      setTimeout(() => updateStatus(''), 2000);
    } catch (error) {
      updateStatus('Failed to download: ' + error.message, true);
    }
  }, 300);

  // Update event listeners to use debounced functions
  formatSelect.addEventListener('change', debouncedPreviewUpdate);
  includeTimestamps.addEventListener('change', debouncedPreviewUpdate);
  copyTranscriptBtn.addEventListener('click', debouncedCopy);
  downloadTranscriptBtn.addEventListener('click', debouncedDownload);

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

  // Debug functions (only in development)
  if (window.location.protocol === 'chrome-extension:') {
    // Add debug button (hidden by default)
    const debugBtn = document.createElement('button');
    debugBtn.textContent = 'Debug Methods';
    debugBtn.style.display = 'none';
    debugBtn.id = 'debug-btn';
    document.body.appendChild(debugBtn);
    
    // Show debug button when Alt+D is pressed
    document.addEventListener('keydown', (e) => {
      if (e.altKey && e.key.toLowerCase() === 'd') {
        debugBtn.style.display = debugBtn.style.display === 'none' ? 'block' : 'none';
      }
    });
    
    debugBtn.addEventListener('click', async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        
        if (!tab.url.includes('youtube.com/watch')) {
          updateStatus('Please navigate to a YouTube video page first.', true);
          return;
        }
        
        updateStatus('Running debug tests...', false);
        
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'debugTestAll'
        });
        
        if (response.results) {
          console.log('Debug results:', response.results);
          let statusMsg = 'Debug completed. Check console for details. Results: ';
          for (const [method, result] of Object.entries(response.results)) {
            statusMsg += `${method}:${result.success ? '✓' : '✗'} `;
          }
          updateStatus(statusMsg, false);
        } else {
          updateStatus('Debug failed: ' + (response.error || 'Unknown error'), true);
        }
      } catch (error) {
        updateStatus('Debug error: ' + error.message, true);
      }
    });
  }

  // Memory cleanup function
  function cleanup() {
    // Clear any pending timeouts
    const timeouts = window.setTimeout(() => {}, 0);
    for (let i = 0; i < timeouts; i++) {
      window.clearTimeout(i);
    }

    // Clear transcript data and preview
    if (currentTranscriptData) {
      currentTranscriptData.clearCache();
      currentTranscriptData = null;
    }
    transcriptPreview.textContent = '';

    // Remove any lingering notifications
    document.querySelectorAll('.notification').forEach((n) => n.remove());
  }

  // Clean up when popup is closed
  window.addEventListener('unload', cleanup);

  // Clean up when switching to a different video
  getTranscriptBtn.addEventListener('click', cleanup);
});
