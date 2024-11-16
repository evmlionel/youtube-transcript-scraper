async function getTranscriptData() {
  try {
    // Get video ID from URL
    const videoId = new URL(window.location.href).searchParams.get('v');
    if (!videoId) {
      return { error: 'Could not find video ID.' };
    }

    // First try: Direct API method
    let transcriptData = await fetchTranscriptFromAPI(videoId);
    if (transcriptData) {
      return transcriptData;
    }

    // Second try: Page data method
    transcriptData = await fetchTranscriptFromPage(videoId);
    if (transcriptData) {
      return transcriptData;
    }

    // Third try: Legacy API method
    transcriptData = await fetchTranscriptFromLegacyAPI(videoId);
    if (transcriptData) {
      return transcriptData;
    }

    return { error: 'No captions available for this video.' };
  } catch (error) {
    console.error('Error getting transcript:', error);
    return { error: 'Failed to get transcript data: ' + error.message };
  }
}

async function fetchTranscriptFromAPI(videoId) {
  try {
    // First, get the caption tracks
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
    const html = await response.text();
    
    // Look for the playerCaptionsTracklistRenderer
    const match = html.match(/"captionTracks":\[(.*?)\]/);
    if (!match) return null;

    // Parse the caption tracks
    const captionTracks = JSON.parse(`[${match[1]}]`);
    
    // Find English or first available track
    const track = captionTracks.find(t => t.languageCode === 'en') || captionTracks[0];
    if (!track || !track.baseUrl) return null;

    // Fetch the transcript
    const transcriptResponse = await fetch(track.baseUrl);
    const transcriptText = await transcriptResponse.text();
    
    // Parse the XML
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(transcriptText, 'text/xml');

    // Extract segments
    const segments = Array.from(xmlDoc.getElementsByTagName('text')).map(text => ({
      start: parseFloat(text.getAttribute('start')),
      duration: parseFloat(text.getAttribute('dur')),
      text: text.textContent.trim()
    }));

    if (segments.length === 0) return null;
    return new TranscriptData(segments, videoId);
  } catch (error) {
    console.error('Error in fetchTranscriptFromAPI:', error);
    return null;
  }
}

async function fetchTranscriptFromPage(videoId) {
  try {
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
    const html = await response.text();
    
    // Try to find ytInitialData
    const ytDataMatch = html.match(/ytInitialData\s*=\s*({.+?});/);
    if (!ytDataMatch) return null;

    const ytData = JSON.parse(ytDataMatch[1]);
    
    // Look for transcript in engagement panels
    const transcriptPanel = ytData.engagementPanels?.find(
      panel => panel?.engagementPanelSectionListRenderer?.content?.transcriptRenderer
    );

    if (!transcriptPanel) return null;

    const transcriptRenderer = transcriptPanel.engagementPanelSectionListRenderer.content.transcriptRenderer;
    const transcriptUrl = transcriptRenderer?.footer?.transcriptFooterRenderer?.languageMenu?.sortFilterSubMenuRenderer?.subMenuItems?.[0]?.serviceEndpoint?.getTranscriptEndpoint?.params;

    if (!transcriptUrl) return null;

    // Fetch transcript data
    const transcriptResponse = await fetch(`https://www.youtube.com/api/timedtext?v=${videoId}&params=${transcriptUrl}`);
    const transcriptText = await transcriptResponse.text();
    
    // Parse XML
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(transcriptText, 'text/xml');

    // Extract segments
    const segments = Array.from(xmlDoc.getElementsByTagName('text')).map(text => ({
      start: parseFloat(text.getAttribute('start')),
      duration: parseFloat(text.getAttribute('dur')),
      text: text.textContent.trim()
    }));

    if (segments.length === 0) return null;
    return new TranscriptData(segments, videoId);
  } catch (error) {
    console.error('Error in fetchTranscriptFromPage:', error);
    return null;
  }
}

async function fetchTranscriptFromLegacyAPI(videoId) {
  try {
    // Get available transcripts
    const listUrl = `https://www.youtube.com/api/timedtext?type=list&v=${videoId}`;
    const listResponse = await fetch(listUrl);
    const listText = await listResponse.text();
    
    // Parse XML
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(listText, 'text/xml');
    
    // Find English or first track
    let track = Array.from(xmlDoc.getElementsByTagName('track'))
      .find(t => t.getAttribute('lang_code') === 'en');
    
    if (!track) {
      track = xmlDoc.querySelector('track');
    }
    
    if (!track) return null;

    // Get transcript data
    const lang = track.getAttribute('lang_code');
    const name = track.getAttribute('name') || '';
    const transcriptUrl = `https://www.youtube.com/api/timedtext?lang=${lang}&v=${videoId}&name=${encodeURIComponent(name)}`;
    
    const transcriptResponse = await fetch(transcriptUrl);
    const transcriptText = await transcriptResponse.text();
    
    // Parse transcript XML
    const transcriptDoc = parser.parseFromString(transcriptText, 'text/xml');
    
    // Extract segments
    const segments = Array.from(transcriptDoc.getElementsByTagName('text')).map(text => ({
      start: parseFloat(text.getAttribute('start')),
      duration: parseFloat(text.getAttribute('dur')),
      text: text.textContent.trim()
    }));

    if (segments.length === 0) return null;
    return new TranscriptData(segments, videoId);
  } catch (error) {
    console.error('Error in fetchTranscriptFromLegacyAPI:', error);
    return null;
  }
}

// Initialize message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTranscript') {
    getTranscriptData()
      .then(transcriptData => {
        sendResponse({ transcriptData });
      })
      .catch(error => {
        console.error('Error:', error);
        sendResponse({ transcriptData: { error: 'Failed to get transcript: ' + error.message } });
      });
    return true; // Required for async response
  }
});
