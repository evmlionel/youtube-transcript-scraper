// Debug flag - set to true for verbose logging
const DEBUG_MODE = true;

function debugLog(method, message, data = null) {
  if (DEBUG_MODE) {
    console.log(`[${method}] ${message}`, data || '');
  }
}

async function getTranscriptData() {
  try {
    debugLog('getTranscriptData', 'Starting transcript extraction');
    
    // Get video ID from URL
    const videoId = new URL(window.location.href).searchParams.get('v');
    if (!videoId) {
      debugLog('getTranscriptData', 'No video ID found in URL');
      return { error: 'Could not find video ID.' };
    }
    
    debugLog('getTranscriptData', `Video ID: ${videoId}`);

    // Check cache first
    const cachedData = await TranscriptStorage.getFromCache(videoId);
    if (cachedData) {
      debugLog('getTranscriptData', 'Retrieved transcript from cache');
      return cachedData;
    }

    // Wait for online connection if needed
    await NetworkUtils.waitForOnline();

    // Try all methods with retry logic
    const transcriptData = await RetryUtils.withRetry(
      async () => {
        debugLog('getTranscriptData', 'Attempting extraction methods...');
        
        // First try: InnerTube API method (most reliable)
        debugLog('getTranscriptData', 'Trying fetchTranscriptFromInnerTube');
        let data = await fetchTranscriptFromInnerTube(videoId);
        if (data) {
          debugLog('getTranscriptData', 'fetchTranscriptFromInnerTube succeeded');
          return data;
        }

        // Second try: Direct API method
        debugLog('getTranscriptData', 'Trying fetchTranscriptFromAPI');
        data = await fetchTranscriptFromAPI(videoId);
        if (data) {
          debugLog('getTranscriptData', 'fetchTranscriptFromAPI succeeded');
          return data;
        }

        // Third try: Page data method
        debugLog('getTranscriptData', 'Trying fetchTranscriptFromPage');
        data = await fetchTranscriptFromPage(videoId);
        if (data) {
          debugLog('getTranscriptData', 'fetchTranscriptFromPage succeeded');
          return data;
        }

        // Fourth try: Legacy API method
        debugLog('getTranscriptData', 'Trying fetchTranscriptFromLegacyAPI');
        data = await fetchTranscriptFromLegacyAPI(videoId);
        if (data) {
          debugLog('getTranscriptData', 'fetchTranscriptFromLegacyAPI succeeded');
          return data;
        }

        debugLog('getTranscriptData', 'All extraction methods failed');
        throw new Error('No captions available for this video.');
      },
      {
        maxAttempts: 3,
        initialDelay: 1000,
        shouldRetry: (error) => {
          // Don't retry if the video has no captions
          return !error.message.includes('No captions available');
        }
      }
    );

    // Cache the successful result
    if (transcriptData) {
      await TranscriptStorage.saveToCache(videoId, transcriptData);
    }

    return transcriptData;
  } catch (error) {
    console.error('Error getting transcript:', error);
    return { error: 'Failed to get transcript data: ' + error.message };
  }
}

async function fetchTranscriptFromInnerTube(videoId) {
  try {
    debugLog('fetchTranscriptFromInnerTube', `Starting for video: ${videoId}`);
    
    // First, get the page to extract API key
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
    debugLog('fetchTranscriptFromInnerTube', `Page fetch status: ${response.status}`);
    
    const html = await response.text();
    debugLog('fetchTranscriptFromInnerTube', `HTML length: ${html.length}`);
    
    // Extract InnerTube API key
    const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"/);
    if (!apiKeyMatch) {
      debugLog('fetchTranscriptFromInnerTube', 'No InnerTube API key found');
      return null;
    }
    
    const apiKey = apiKeyMatch[1];
    debugLog('fetchTranscriptFromInnerTube', `Found API key: ${apiKey.substring(0, 8)}...`);
    
    // Extract context data for the API call
    const contextMatch = html.match(/"INNERTUBE_CONTEXT":\s*({.+?}),/);
    let context = {
      client: {
        clientName: "WEB",
        clientVersion: "2.20250101.01.00"
      }
    };
    
    if (contextMatch) {
      try {
        context = JSON.parse(contextMatch[1]);
        debugLog('fetchTranscriptFromInnerTube', 'Extracted context from page');
      } catch (e) {
        debugLog('fetchTranscriptFromInnerTube', 'Using default context due to parse error');
      }
    }
    
    // Make InnerTube API call to get video info
    const innerTubeUrl = `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`;
    const payload = {
      context: context,
      videoId: videoId
    };
    
    debugLog('fetchTranscriptFromInnerTube', 'Making InnerTube API call');
    const innerTubeResponse = await RetryUtils.withRetry(
      () => fetch(innerTubeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      })
    );
    
    debugLog('fetchTranscriptFromInnerTube', `InnerTube API status: ${innerTubeResponse.status}`);
    
    const playerData = await innerTubeResponse.json();
    debugLog('fetchTranscriptFromInnerTube', 'InnerTube response keys:', Object.keys(playerData));
    
    // Check if captions are available
    const captions = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captions || captions.length === 0) {
      debugLog('fetchTranscriptFromInnerTube', 'No captions found in InnerTube response');
      return null;
    }
    
    debugLog('fetchTranscriptFromInnerTube', `Found ${captions.length} caption tracks`);
    
    // Find English or first available track
    const track = captions.find(t => t.languageCode === 'en') || captions[0];
    if (!track || !track.baseUrl) {
      debugLog('fetchTranscriptFromInnerTube', 'No usable track found');
      return null;
    }
    
    debugLog('fetchTranscriptFromInnerTube', `Using track: ${track.languageCode}, baseUrl: ${track.baseUrl}`);
    
    // Fetch the transcript XML
    const transcriptResponse = await RetryUtils.withRetry(
      () => fetch(track.baseUrl)
    );
    debugLog('fetchTranscriptFromInnerTube', `Transcript fetch status: ${transcriptResponse.status}`);
    
    const transcriptText = await transcriptResponse.text();
    debugLog('fetchTranscriptFromInnerTube', `Transcript XML length: ${transcriptText.length}`);
    debugLog('fetchTranscriptFromInnerTube', `Transcript XML preview: ${transcriptText.substring(0, 300)}...`);
    
    // Parse the XML
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(transcriptText, 'text/xml');
    
    // Check for XML parsing errors
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      debugLog('fetchTranscriptFromInnerTube', 'XML parsing error:', parseError.textContent);
      return null;
    }
    
    // Extract segments
    const textElements = xmlDoc.getElementsByTagName('text');
    debugLog('fetchTranscriptFromInnerTube', `Found ${textElements.length} text elements`);
    
    const segments = Array.from(textElements).map(text => ({
      start: parseFloat(text.getAttribute('start')),
      duration: parseFloat(text.getAttribute('dur')),
      text: text.textContent.trim()
    }));
    
    debugLog('fetchTranscriptFromInnerTube', `Extracted ${segments.length} segments`);
    
    if (segments.length === 0) {
      debugLog('fetchTranscriptFromInnerTube', 'No segments extracted');
      return null;
    }
    
    debugLog('fetchTranscriptFromInnerTube', 'Successfully created TranscriptData');
    return new TranscriptData(segments, videoId);
  } catch (error) {
    debugLog('fetchTranscriptFromInnerTube', 'Error occurred:', error.message);
    console.error('Error in fetchTranscriptFromInnerTube:', error);
    return null;
  }
}

async function fetchTranscriptFromAPI(videoId) {
  try {
    debugLog('fetchTranscriptFromAPI', `Starting for video: ${videoId}`);
    
    // First, get the caption tracks
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
    debugLog('fetchTranscriptFromAPI', `Page fetch status: ${response.status}`);
    
    const html = await response.text();
    debugLog('fetchTranscriptFromAPI', `HTML length: ${html.length}`);
    
    // Look for the playerCaptionsTracklistRenderer with improved patterns
    let match = html.match(/"captionTracks":\[(.*?)\]/);
    if (!match) {
      debugLog('fetchTranscriptFromAPI', 'No captionTracks found with primary pattern');
      // Try alternative patterns based on YouTube structure variations
      match = html.match(/"captions".*?"playerCaptionsTracklistRenderer".*?"captionTracks":\[(.*?)\]/s);
      if (!match) {
        match = html.match(/playerCaptionsTracklistRenderer.*?captionTracks.*?\[(.*?)\]/s);
      }
      if (!match) {
        match = html.match(/"playerCaptionsTracklistRenderer":\{"captionTracks":\[(.*?)\]/);
      }
      if (!match) {
        match = html.match(/\"captionTracks\":\s*\[(.*?)\]/);
      }
      
      if (!match) {
        debugLog('fetchTranscriptFromAPI', 'No captionTracks found with any pattern');
        return null;
      } else {
        debugLog('fetchTranscriptFromAPI', 'Found captionTracks with alternative pattern');
      }
    }

    debugLog('fetchTranscriptFromAPI', `captionTracks match found: ${match[1].substring(0, 200)}...`);

    // Parse the caption tracks
    let captionTracks;
    try {
      captionTracks = JSON.parse(`[${match[1]}]`);
      debugLog('fetchTranscriptFromAPI', `Parsed ${captionTracks.length} caption tracks`);
    } catch (parseError) {
      debugLog('fetchTranscriptFromAPI', 'JSON parse error:', parseError.message);
      return null;
    }
    
    // Find English or first available track
    const track = captionTracks.find(t => t.languageCode === 'en') || captionTracks[0];
    if (!track) {
      debugLog('fetchTranscriptFromAPI', 'No tracks available');
      return null;
    }
    
    if (!track.baseUrl) {
      debugLog('fetchTranscriptFromAPI', 'Track found but no baseUrl:', track);
      return null;
    }

    debugLog('fetchTranscriptFromAPI', `Using track: ${track.languageCode}, baseUrl: ${track.baseUrl}`);

    // Fetch the transcript with retry
    const transcriptResponse = await RetryUtils.withRetry(
      () => fetch(track.baseUrl)
    );
    debugLog('fetchTranscriptFromAPI', `Transcript fetch status: ${transcriptResponse.status}`);
    
    const transcriptText = await transcriptResponse.text();
    debugLog('fetchTranscriptFromAPI', `Transcript XML length: ${transcriptText.length}`);
    debugLog('fetchTranscriptFromAPI', `Transcript XML preview: ${transcriptText.substring(0, 300)}...`);
    
    // Parse the XML
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(transcriptText, 'text/xml');

    // Check for XML parsing errors
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      debugLog('fetchTranscriptFromAPI', 'XML parsing error:', parseError.textContent);
      return null;
    }

    // Extract segments
    const textElements = xmlDoc.getElementsByTagName('text');
    debugLog('fetchTranscriptFromAPI', `Found ${textElements.length} text elements`);
    
    const segments = Array.from(textElements).map(text => ({
      start: parseFloat(text.getAttribute('start')),
      duration: parseFloat(text.getAttribute('dur')),
      text: text.textContent.trim()
    }));

    debugLog('fetchTranscriptFromAPI', `Extracted ${segments.length} segments`);
    
    if (segments.length === 0) {
      debugLog('fetchTranscriptFromAPI', 'No segments extracted');
      return null;
    }
    
    debugLog('fetchTranscriptFromAPI', 'Successfully created TranscriptData');
    return new TranscriptData(segments, videoId);
  } catch (error) {
    debugLog('fetchTranscriptFromAPI', 'Error occurred:', error.message);
    console.error('Error in fetchTranscriptFromAPI:', error);
    return null;
  }
}

async function fetchTranscriptFromPage(videoId) {
  try {
    debugLog('fetchTranscriptFromPage', `Starting for video: ${videoId}`);
    
    const response = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
    debugLog('fetchTranscriptFromPage', `Page fetch status: ${response.status}`);
    
    const html = await response.text();
    debugLog('fetchTranscriptFromPage', `HTML length: ${html.length}`);
    
    // Try to find ytInitialData with improved patterns
    let ytDataMatch = html.match(/(?:window\s*\[\s*["']ytInitialData["']\s*\]|ytInitialData)\s*=\s*({.+?})\s*;/);
    if (!ytDataMatch) {
      debugLog('fetchTranscriptFromPage', 'No ytInitialData found with primary pattern');
      // Try alternative patterns
      ytDataMatch = html.match(/var ytInitialData\s*=\s*({.+?});/) ||
                   html.match(/window\["ytInitialData"\]\s*=\s*({.+?});/) ||
                   html.match(/ytInitialData\s*=\s*({.+?})\s*;/) ||
                   html.match(/ytInitialData"\]\s*=\s*({.+?});/);
      
      if (!ytDataMatch) {
        debugLog('fetchTranscriptFromPage', 'No ytInitialData found with any pattern');
        return null;
      } else {
        debugLog('fetchTranscriptFromPage', 'Found ytInitialData with alternative pattern');
      }
    }

    debugLog('fetchTranscriptFromPage', `ytInitialData found, length: ${ytDataMatch[1].length}`);

    let ytData;
    try {
      ytData = JSON.parse(ytDataMatch[1]);
      debugLog('fetchTranscriptFromPage', 'ytInitialData parsed successfully');
    } catch (parseError) {
      debugLog('fetchTranscriptFromPage', 'ytInitialData JSON parse error:', parseError.message);
      return null;
    }
    
    // Look for transcript in engagement panels
    debugLog('fetchTranscriptFromPage', 'Looking for engagement panels...');
    
    if (!ytData.engagementPanels) {
      debugLog('fetchTranscriptFromPage', 'No engagementPanels found in ytData');
      debugLog('fetchTranscriptFromPage', 'Available ytData keys:', Object.keys(ytData));
      return null;
    }
    
    debugLog('fetchTranscriptFromPage', `Found ${ytData.engagementPanels.length} engagement panels`);
    
    const transcriptPanel = ytData.engagementPanels?.find(
      panel => panel?.engagementPanelSectionListRenderer?.content?.transcriptRenderer
    );

    if (!transcriptPanel) {
      debugLog('fetchTranscriptFromPage', 'No transcript panel found');
      // Log panel types for debugging
      ytData.engagementPanels.forEach((panel, idx) => {
        const panelType = panel?.engagementPanelSectionListRenderer?.content ? 
          Object.keys(panel.engagementPanelSectionListRenderer.content)[0] : 'unknown';
        debugLog('fetchTranscriptFromPage', `Panel ${idx}: ${panelType}`);
      });
      return null;
    }

    debugLog('fetchTranscriptFromPage', 'Transcript panel found');

    const transcriptRenderer = transcriptPanel.engagementPanelSectionListRenderer.content.transcriptRenderer;
    debugLog('fetchTranscriptFromPage', 'Transcript renderer structure:', Object.keys(transcriptRenderer || {}));
    
    const transcriptUrl = transcriptRenderer?.footer?.transcriptFooterRenderer?.languageMenu?.sortFilterSubMenuRenderer?.subMenuItems?.[0]?.serviceEndpoint?.getTranscriptEndpoint?.params;

    if (!transcriptUrl) {
      debugLog('fetchTranscriptFromPage', 'No transcript URL found in structure');
      debugLog('fetchTranscriptFromPage', 'Footer structure:', transcriptRenderer?.footer ? Object.keys(transcriptRenderer.footer) : 'no footer');
      return null;
    }

    debugLog('fetchTranscriptFromPage', `Transcript URL params: ${transcriptUrl}`);

    // Fetch transcript data with retry
    const transcriptResponse = await RetryUtils.withRetry(
      () => fetch(`https://www.youtube.com/api/timedtext?v=${videoId}&params=${transcriptUrl}`)
    );
    debugLog('fetchTranscriptFromPage', `Transcript fetch status: ${transcriptResponse.status}`);
    
    const transcriptText = await transcriptResponse.text();
    debugLog('fetchTranscriptFromPage', `Transcript XML length: ${transcriptText.length}`);
    debugLog('fetchTranscriptFromPage', `Transcript XML preview: ${transcriptText.substring(0, 300)}...`);
    
    // Parse XML
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(transcriptText, 'text/xml');

    // Check for XML parsing errors
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      debugLog('fetchTranscriptFromPage', 'XML parsing error:', parseError.textContent);
      return null;
    }

    // Extract segments
    const textElements = xmlDoc.getElementsByTagName('text');
    debugLog('fetchTranscriptFromPage', `Found ${textElements.length} text elements`);
    
    const segments = Array.from(textElements).map(text => ({
      start: parseFloat(text.getAttribute('start')),
      duration: parseFloat(text.getAttribute('dur')),
      text: text.textContent.trim()
    }));

    debugLog('fetchTranscriptFromPage', `Extracted ${segments.length} segments`);

    if (segments.length === 0) {
      debugLog('fetchTranscriptFromPage', 'No segments extracted');
      return null;
    }
    
    debugLog('fetchTranscriptFromPage', 'Successfully created TranscriptData');
    return new TranscriptData(segments, videoId);
  } catch (error) {
    debugLog('fetchTranscriptFromPage', 'Error occurred:', error.message);
    console.error('Error in fetchTranscriptFromPage:', error);
    return null;
  }
}

async function fetchTranscriptFromLegacyAPI(videoId) {
  try {
    debugLog('fetchTranscriptFromLegacyAPI', `Starting for video: ${videoId}`);
    
    // Get available transcripts with retry
    const listUrl = `https://www.youtube.com/api/timedtext?type=list&v=${videoId}`;
    debugLog('fetchTranscriptFromLegacyAPI', `Fetching track list from: ${listUrl}`);
    
    const listResponse = await RetryUtils.withRetry(
      () => fetch(listUrl)
    );
    debugLog('fetchTranscriptFromLegacyAPI', `Track list fetch status: ${listResponse.status}`);
    
    const listText = await listResponse.text();
    debugLog('fetchTranscriptFromLegacyAPI', `Track list XML length: ${listText.length}`);
    debugLog('fetchTranscriptFromLegacyAPI', `Track list XML preview: ${listText.substring(0, 500)}...`);
    
    // Parse XML
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(listText, 'text/xml');
    
    // Check for XML parsing errors
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
      debugLog('fetchTranscriptFromLegacyAPI', 'XML parsing error:', parseError.textContent);
      return null;
    }
    
    // Find English or first track
    const allTracks = Array.from(xmlDoc.getElementsByTagName('track'));
    debugLog('fetchTranscriptFromLegacyAPI', `Found ${allTracks.length} tracks`);
    
    if (allTracks.length > 0) {
      allTracks.forEach((track, idx) => {
        debugLog('fetchTranscriptFromLegacyAPI', `Track ${idx}: lang=${track.getAttribute('lang_code')}, name=${track.getAttribute('name')}`);
      });
    }
    
    let track = allTracks.find(t => t.getAttribute('lang_code') === 'en');
    
    if (!track) {
      track = xmlDoc.querySelector('track');
      debugLog('fetchTranscriptFromLegacyAPI', 'No English track found, using first available');
    }
    
    if (!track) {
      debugLog('fetchTranscriptFromLegacyAPI', 'No tracks available');
      return null;
    }

    // Get transcript data with retry
    const lang = track.getAttribute('lang_code');
    const name = track.getAttribute('name') || '';
    const transcriptUrl = `https://www.youtube.com/api/timedtext?lang=${lang}&v=${videoId}&name=${encodeURIComponent(name)}`;
    
    debugLog('fetchTranscriptFromLegacyAPI', `Using track: lang=${lang}, name=${name}`);
    debugLog('fetchTranscriptFromLegacyAPI', `Fetching transcript from: ${transcriptUrl}`);
    
    const transcriptResponse = await RetryUtils.withRetry(
      () => fetch(transcriptUrl)
    );
    debugLog('fetchTranscriptFromLegacyAPI', `Transcript fetch status: ${transcriptResponse.status}`);
    
    const transcriptText = await transcriptResponse.text();
    debugLog('fetchTranscriptFromLegacyAPI', `Transcript XML length: ${transcriptText.length}`);
    debugLog('fetchTranscriptFromLegacyAPI', `Transcript XML preview: ${transcriptText.substring(0, 300)}...`);
    
    // Parse transcript XML
    const transcriptDoc = parser.parseFromString(transcriptText, 'text/xml');
    
    // Check for XML parsing errors
    const transcriptParseError = transcriptDoc.querySelector('parsererror');
    if (transcriptParseError) {
      debugLog('fetchTranscriptFromLegacyAPI', 'Transcript XML parsing error:', transcriptParseError.textContent);
      return null;
    }
    
    // Extract segments
    const textElements = transcriptDoc.getElementsByTagName('text');
    debugLog('fetchTranscriptFromLegacyAPI', `Found ${textElements.length} text elements`);
    
    const segments = Array.from(textElements).map(text => ({
      start: parseFloat(text.getAttribute('start')),
      duration: parseFloat(text.getAttribute('dur')),
      text: text.textContent.trim()
    }));

    debugLog('fetchTranscriptFromLegacyAPI', `Extracted ${segments.length} segments`);

    if (segments.length === 0) {
      debugLog('fetchTranscriptFromLegacyAPI', 'No segments extracted');
      return null;
    }
    
    debugLog('fetchTranscriptFromLegacyAPI', 'Successfully created TranscriptData');
    return new TranscriptData(segments, videoId);
  } catch (error) {
    debugLog('fetchTranscriptFromLegacyAPI', 'Error occurred:', error.message);
    console.error('Error in fetchTranscriptFromLegacyAPI:', error);
    return null;
  }
}

// Debug functions to test methods individually
async function debugTestMethod(methodName, videoId) {
  debugLog('debugTestMethod', `Testing ${methodName} for video: ${videoId}`);
  
  switch (methodName) {
    case 'innertube':
      return await fetchTranscriptFromInnerTube(videoId);
    case 'api':
      return await fetchTranscriptFromAPI(videoId);
    case 'page':
      return await fetchTranscriptFromPage(videoId);
    case 'legacy':
      return await fetchTranscriptFromLegacyAPI(videoId);
    default:
      debugLog('debugTestMethod', `Unknown method: ${methodName}`);
      return null;
  }
}

async function debugTestAllMethods() {
  const videoId = new URL(window.location.href).searchParams.get('v');
  if (!videoId) {
    debugLog('debugTestAllMethods', 'No video ID found');
    return;
  }
  
  debugLog('debugTestAllMethods', `Testing all methods for video: ${videoId}`);
  
  const methods = ['innertube', 'api', 'page', 'legacy'];
  const results = {};
  
  for (const method of methods) {
    debugLog('debugTestAllMethods', `Testing ${method} method...`);
    const startTime = performance.now();
    const result = await debugTestMethod(method, videoId);
    const endTime = performance.now();
    
    results[method] = {
      success: !!result,
      time: endTime - startTime,
      segments: result?.segments?.length || 0
    };
    
    debugLog('debugTestAllMethods', `${method} result:`, results[method]);
  }
  
  debugLog('debugTestAllMethods', 'All methods tested:', results);
  return results;
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
  
  // Debug commands
  if (request.action === 'debugTest') {
    const { method, videoId } = request;
    debugTestMethod(method, videoId)
      .then(result => {
        sendResponse({ result });
      })
      .catch(error => {
        sendResponse({ error: error.message });
      });
    return true;
  }
  
  if (request.action === 'debugTestAll') {
    debugTestAllMethods()
      .then(results => {
        sendResponse({ results });
      })
      .catch(error => {
        sendResponse({ error: error.message });
      });
    return true;
  }
});

// Expose debug functions to window for manual testing
if (DEBUG_MODE) {
  window.debugTestMethod = debugTestMethod;
  window.debugTestAllMethods = debugTestAllMethods;
  window.debugLog = debugLog;
}
