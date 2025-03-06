import React, { useState, useEffect } from 'react';

interface TranscriptEntry {
  speaker: string;
  text: string;
  timestamp?: string;
}

// Helper functions
const formatSpeakerName = (speaker: string) => {
  const parts = speaker.split(', ');
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : speaker;
};

const getCurrentTime = () => {
  return new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
};

// Transcript handler class with session storage support
class SessionAwareTranscriptCapture {
  private history: string[] = [];
  private sessionId: string = '';
  private lastActivity: number = 0;
  private sessionThreshold: number = 30000; // 30 seconds by default
  
  constructor(sessionThreshold: number = 30000) {
    this.sessionThreshold = sessionThreshold;
    this.initSession();
  }
  
  // Initialize session from storage or create new
  private initSession() {
    // Try to load from session storage
    try {
      const savedSession = sessionStorage.getItem('chimeTranscriptSession');
      if (savedSession) {
        const sessionData = JSON.parse(savedSession);
        const elapsed = Date.now() - sessionData.lastActivity;
        
        // Check if session is still valid
        if (elapsed < this.sessionThreshold) {
          this.history = sessionData.history || [];
          this.sessionId = sessionData.sessionId;
          this.lastActivity = sessionData.lastActivity;
          return;
        }
      }
    } catch (e) {
      console.error('Error loading session:', e);
    }
    
    // Create new session if none exists or expired
    this.createNewSession();
  }
  
  // Create a new session with unique ID
  private createNewSession() {
    this.history = [];
    this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.lastActivity = Date.now();
    this.saveSession();
  }
  
  // Save current session to storage
  private saveSession() {
    const sessionData = {
      history: this.history,
      sessionId: this.sessionId,
      lastActivity: this.lastActivity
    };
    
    try {
      sessionStorage.setItem('chimeTranscriptSession', JSON.stringify(sessionData));
    } catch (e) {
      console.error('Error saving session:', e);
    }
  }
  
  // Update the last activity timestamp
  private updateActivity() {
    this.lastActivity = Date.now();
    this.saveSession();
  }
  
  // Public methods
  addEntry(entry: string) {
    if (!this.history.includes(entry)) {
      this.history.push(entry);
      this.updateActivity();
      return true;
    }
    return false;
  }
  
  captureTranscript(speakerRaw: string, text: string) {
    this.updateActivity();
    
    const speaker = formatSpeakerName(speakerRaw);
    const time = getCurrentTime();
    const formattedLine = `${speaker} [${time}]: ${text}`.trim();
    
    // Get the last history entry for this speaker
    let lastEntry = null;
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (!this.history[i].startsWith('[') && this.history[i].startsWith(`${speaker}`)) {
        lastEntry = this.history[i];
        break;
      }
    }
    
    if (!lastEntry) {
      this.addEntry(formattedLine);
      return { action: 'added', line: formattedLine };
    }
    
    // Extract text portions
    const lastEntryText = lastEntry.substring(lastEntry.indexOf(']: ') + 3).trim();
    const currentText = text.trim();
    
    // Check for exact match first
    if (lastEntryText === currentText) {
      return { action: 'skipped', line: formattedLine };
    }
    
    // Check if texts are similar using fuzzy matching
    if (this.fuzzyMatch(lastEntryText, currentText)) {
      // Update the existing entry - it's likely a correction or extension
      const lastIndex = this.history.lastIndexOf(lastEntry);
      this.history[lastIndex] = formattedLine;
      this.updateActivity();
      return { action: 'updated', line: formattedLine };
    } else {
      // It's a new sentence
      this.addEntry(formattedLine);
      return { action: 'added', line: formattedLine };
    }
  }
  
  fuzzyMatch(str1: string, str2: string) {
    // Normalize strings
    const normalize = (str: string) => str.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").replace(/\s+/g, " ").trim();
    const norm1 = normalize(str1);
    const norm2 = normalize(str2);
    
    // Direct match
    if (norm1 === norm2) {
      return true;
    }
    
    // Check if one is a substring of the other (with flexibility for variations)
    const minLength = Math.min(norm1.length, norm2.length);
    const comparisonLength = Math.max(minLength - 3, 0); // Allow for small variations
    
    const str1Core = norm1.substring(0, comparisonLength);
    const str2Core = norm2.substring(0, comparisonLength);
    
    // If the core texts match, or one contains the other, they're likely related
    if (str1Core === str2Core || norm1.includes(str2Core) || norm2.includes(str1Core)) {
      return true;
    }
    
    // For longer texts, rely on meaningful word comparison
    if (norm1.length > 15 && norm2.length > 15) {
      // Filter out common stopwords
      const stopWords = new Set(['i', 'will', 'would', 'like', 'to', 'the', 'this', 'that', 'is',
                               'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'it', 'for',
                               'yes', 'no', 'so', 'uh', 'um', 'we', 'you', 'they', 'of', 'from']);
      
      const words1 = norm1.split(' ').filter(w => !stopWords.has(w) && w.length > 1);
      const words2 = norm2.split(' ').filter(w => !stopWords.has(w) && w.length > 1);
      
      // Calculate meaningful word similarity
      const commonWords = words1.filter(word => words2.includes(word));
      const similarity = commonWords.length / Math.max(words1.length, words2.length);
      
      // Return true if there's high similarity
      return similarity >= 0.7 && commonWords.length >= 3;
    }
    
    return false;
  }
  
  getSessionId() {
    return this.sessionId;
  }
  
  getLastActivity() {
    return this.lastActivity;
  }
  
  getSessionTimeLeft() {
    const elapsed = Date.now() - this.lastActivity;
    return Math.max(0, this.sessionThreshold - elapsed);
  }
  
  getTranscript() {
    return this.history.join('\n');
  }
  
  getHistory() {
    return [...this.history];
  }
  
  clear() {
    this.createNewSession();
  }
  
  setSessionThreshold(milliseconds: number) {
    this.sessionThreshold = milliseconds;
    this.updateActivity();
  }
}

// Mock meeting details simulation
const simulateMeetingDetails = (delay: number = 0): Promise<{id: string, name: string}> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        id: `meeting-${Date.now()}`,
        name: 'Simulated Chime Meeting'
      });
    }, delay);
  });
};

// Test data
const TEST_TRANSCRIPT_DATA: TranscriptEntry[] = [
  { speaker: 'Doron, Hetz', text: 'This is the first message in our meeting.' },
  { speaker: 'Vikram, Bhasker', text: 'Hello everyone, can you hear me?' },
  { speaker: 'Doron, Hetz', text: 'Yes, we can hear you clearly.' },
  { speaker: 'Sarah, Johnson', text: 'I wanted to discuss the roadmap for Q1.' },
  { speaker: 'Sarah, Johnson', text: 'I wanted to discuss the roadmap for Q1 and our marketing strategy.' },
  { speaker: 'Vikram, Bhasker', text: 'Let me share my screen to show the numbers.' },
];

const SessionResumeTestHarness = () => {
  // State for the transcript capture
  const [transcriptCapture, setTranscriptCapture] = useState<SessionAwareTranscriptCapture | null>(null);
  
  // Meeting simulation state
  const [meetingDetails, setMeetingDetails] = useState<{id: string, name: string} | null>(null);
  const [meetingDetailsDelay, setMeetingDetailsDelay] = useState<number>(0);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);
  
  // Session state
  const [sessionThreshold, setSessionThreshold] = useState<number>(30000); // 30 seconds
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [sessionId, setSessionId] = useState<string>('');
  
  // Transcript state
  const [transcriptData, setTranscriptData] = useState<TranscriptEntry[]>(TEST_TRANSCRIPT_DATA);
  const [customSpeaker, setCustomSpeaker] = useState<string>('Doron, Hetz');
  const [customText, setCustomText] = useState<string>('');
  const [actionLog, setActionLog] = useState<Array<{action: string, message: string}>>([]);
  
  // Load or initialize the transcript capture when component mounts
  useEffect(() => {
    const capture = new SessionAwareTranscriptCapture(sessionThreshold);
    setTranscriptCapture(capture);
    setSessionId(capture.getSessionId());
    setTimeLeft(capture.getSessionTimeLeft());
    
    // Add initialization log
    setActionLog([{ 
      action: 'init', 
      message: `Session initialized: ${capture.getSessionId()}`
    }]);
    
    // Set up timer to update time left
    const timer = setInterval(() => {
      if (capture) {
        setTimeLeft(capture.getSessionTimeLeft());
      }
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);
  
  // Update session threshold when changed
  useEffect(() => {
    if (transcriptCapture) {
      transcriptCapture.setSessionThreshold(sessionThreshold);
      setActionLog(prev => [...prev, { 
        action: 'update', 
        message: `Session threshold updated to ${sessionThreshold}ms`
      }]);
    }
  }, [sessionThreshold]);
  
  // Start meeting with delayed details
  const startMeeting = async () => {
    setIsLoadingDetails(true);
    setActionLog(prev => [...prev, { 
      action: 'start', 
      message: `Starting meeting (details will load in ${meetingDetailsDelay}ms)`
    }]);
    
    try {
      // Simulate meeting details loading with specified delay
      const details = await simulateMeetingDetails(meetingDetailsDelay);
      setMeetingDetails(details);
      setActionLog(prev => [...prev, { 
        action: 'load', 
        message: `Meeting details loaded: ${details.id}`
      }]);
    } catch (e) {
      setActionLog(prev => [...prev, { 
        action: 'error', 
        message: `Failed to load meeting details: ${e}`
      }]);
    } finally {
      setIsLoadingDetails(false);
    }
  };
  
  // Process transcript entry
  const processEntry = (entry: TranscriptEntry) => {
    if (!transcriptCapture) return;
    
    const result = transcriptCapture.captureTranscript(entry.speaker, entry.text);
    
    setActionLog(prev => [...prev, { 
      action: result.action, 
      message: `${result.action === 'added' ? 'Added' : result.action === 'updated' ? 'Updated' : 'Skipped'}: ${result.line.substring(0, 60)}${result.line.length > 60 ? '...' : ''}`
    }]);
  };
  
  // Process all test data
  const processAllEntries = () => {
    if (!transcriptCapture) return;
    
    // Clear action log before processing
    setActionLog([]);
    
    // Process each entry
    transcriptData.forEach(entry => {
      processEntry(entry);
    });
  };
  
  // Add custom entry
  const addCustomEntry = () => {
    if (!customText.trim()) return;
    
    const newEntry = { speaker: customSpeaker, text: customText };
    setTranscriptData(prev => [...prev, newEntry]);
    setCustomText('');
    
    setActionLog(prev => [...prev, { 
      action: 'add-test', 
      message: `Added to test data: ${customSpeaker}: ${customText}`
    }]);
  };
  
  // Process custom entry only
  const processCustomEntryOnly = () => {
    if (!transcriptCapture || !customText.trim()) return;
    
    const result = transcriptCapture.captureTranscript(customSpeaker, customText);
    
    setActionLog(prev => [...prev, { 
      action: result.action, 
      message: `${result.action === 'added' ? 'Added' : result.action === 'updated' ? 'Updated' : 'Skipped'}: ${result.line.substring(0, 60)}${result.line.length > 60 ? '...' : ''}`
    }]);
    
    setCustomText('');
  };
  
  // Refresh the page (for testing session resume)
  const simulateRefresh = () => {
    setActionLog(prev => [...prev, { 
      action: 'refresh', 
      message: 'Simulating page refresh...'
    }]);
    
    // Reload the page
    window.location.reload();
  };
  
  // Clear session
  const clearSession = () => {
    if (!transcriptCapture) return;
    
    transcriptCapture.clear();
    setSessionId(transcriptCapture.getSessionId());
    setTimeLeft(transcriptCapture.getSessionTimeLeft());
    
    setActionLog([{ 
      action: 'clear', 
      message: `Session cleared, new session: ${transcriptCapture.getSessionId()}`
    }]);
  };
  
  // Format time left in seconds
  const formatTimeLeft = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    return `${seconds}s`;
  };
  
  return (
    <div className="max-w-6xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Chime Session Resume Test Harness</h1>
      
      {/* Session Info Panel */}
      <div className="mb-6 bg-white p-4 rounded-md shadow">
        <h2 className="text-lg font-semibold mb-2">Session Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p><span className="font-medium">Session ID:</span> {sessionId}</p>
            <p><span className="font-medium">Session timeout:</span> {sessionThreshold / 1000}s</p>
            <p>
              <span className="font-medium">Time left:</span> 
              <span className={`ml-1 ${timeLeft < 5000 ? 'text-red-500 font-bold' : timeLeft < 10000 ? 'text-orange-500' : 'text-green-500'}`}>
                {formatTimeLeft(timeLeft)}
              </span>
            </p>
            
            <div className="mt-2">
              <label className="block text-sm font-medium mb-1">
                Session threshold (milliseconds):
              </label>
              <div className="flex items-center">
                <input 
                  type="number" 
                  value={sessionThreshold}
                  onChange={(e) => setSessionThreshold(parseInt(e.target.value))}
                  min="5000"
                  max="300000"
                  step="1000"
                  className="border rounded p-1 w-32 mr-2"
                />
                <button 
                  onClick={() => setSessionThreshold(30000)}
                  className="px-2 py-1 bg-gray-200 rounded text-sm"
                >
                  Reset to 30s
                </button>
              </div>
            </div>
          </div>
          
          <div>
            {meetingDetails ? (
              <div className="p-3 bg-green-50 border border-green-200 rounded">
                <h3 className="font-medium text-green-800">Meeting Active</h3>
                <p className="text-sm mt-1"><span className="font-medium">ID:</span> {meetingDetails.id}</p>
                <p className="text-sm"><span className="font-medium">Name:</span> {meetingDetails.name}</p>
              </div>
            ) : (
              <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
                <h3 className="font-medium text-yellow-800">No Meeting Details</h3>
                <p className="text-sm mt-1">Meeting details not yet loaded or available</p>
              </div>
            )}
            
            <div className="mt-2">
              <label className="block text-sm font-medium mb-1">
                Meeting details delay (ms):
              </label>
              <div className="flex items-center">
                <input 
                  type="number" 
                  value={meetingDetailsDelay}
                  onChange={(e) => setMeetingDetailsDelay(parseInt(e.target.value))}
                  min="0"
                  max="10000"
                  step="100"
                  className="border rounded p-1 w-32 mr-2"
                />
                <button 
                  onClick={startMeeting}
                  disabled={isLoadingDetails}
                  className={`px-3 py-1 ${isLoadingDetails ? 'bg-gray-400' : 'bg-blue-500 hover:bg-blue-600'} text-white rounded`}
                >
                  {isLoadingDetails ? 'Loading...' : 'Start Meeting'}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Set delay to simulate DOM loading time before meeting details become available
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Test Data Panel */}
        <div>
          <h2 className="text-lg font-semibold mb-2">Test Data</h2>
          <div className="border p-2 h-64 overflow-auto bg-gray-50 rounded">
            {transcriptData.map((entry, idx) => (
              <div key={idx} className="mb-1 p-1 border-b">
                <span className="font-semibold">{entry.speaker}:</span> {entry.text}
              </div>
            ))}
          </div>
          
          <div className="mt-4">
            <h3 className="font-medium">Add Custom Test Entry</h3>
            <div className="flex items-center mt-2">
              <select 
                value={customSpeaker}
                onChange={(e) => setCustomSpeaker(e.target.value)}
                className="border rounded p-1 mr-2 w-48"
              >
                <option value="Doron, Hetz">Doron, Hetz</option>
                <option value="Vikram, Bhasker">Vikram, Bhasker</option>
                <option value="Sarah, Johnson">Sarah, Johnson</option>
              </select>
              <input
                type="text"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Enter transcript text"
                className="border rounded p-1 flex-grow mr-2"
              />
              <button 
                onClick={addCustomEntry}
                className="bg-blue-500 text-white px-3 py-1 rounded"
              >
                Add
              </button>
            </div>
          </div>
        </div>
        
        {/* Action Log */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg font-semibold">Action Log</h2>
            <button 
              onClick={() => setActionLog([])}
              className="bg-gray-200 text-gray-800 px-2 py-1 rounded text-sm"
            >
              Clear Log
            </button>
          </div>
          <div className="border p-2 h-64 overflow-auto bg-gray-50 rounded">
            {actionLog.map((log, idx) => (
              <div key={idx} className={`mb-1 p-1 border-b text-sm ${
                log.action === 'error' ? 'bg-red-50' :
                log.action === 'added' ? 'bg-green-50' :
                log.action === 'updated' ? 'bg-yellow-50' :
                log.action === 'refresh' ? 'bg-purple-50' :
                log.action === 'clear' ? 'bg-red-50' :
                'bg-gray-50'
              }`}>
                <span className={`font-semibold ${
                  log.action === 'error' ? 'text-red-700' :
                  log.action === 'added' ? 'text-green-700' :
                  log.action === 'updated' ? 'text-yellow-700' :
                  log.action === 'refresh' ? 'text-purple-700' :
                  log.action === 'clear' ? 'text-red-700' :
                  'text-gray-700'
                }`}>
                  {log.action.toUpperCase()}:
                </span> {log.message}
              </div>
            ))}
            {actionLog.length === 0 && <div className="text-gray-500 italic p-2">No actions logged yet</div>}
          </div>
          
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              onClick={processAllEntries}
              className="bg-green-600 text-white px-3 py-2 rounded"
            >
              Process All Entries
            </button>
            <button
              onClick={processCustomEntryOnly}
              className="bg-blue-600 text-white px-3 py-2 rounded"
            >
              Process Custom Entry
            </button>
            <button
              onClick={simulateRefresh}
              className="bg-purple-600 text-white px-3 py-2 rounded"
            >
              Simulate Page Refresh
            </button>
            <button
              onClick={clearSession}
              className="bg-red-600 text-white px-3 py-2 rounded"
            >
              Clear Session
            </button>
          </div>
        </div>
      </div>
      
      {/* Transcript Output */}
      <div>
        <h2 className="text-lg font-semibold mb-2">Current Transcript Output</h2>
        <div className="border p-3 bg-white rounded shadow">
          <div className="font-mono text-sm h-48 overflow-auto">
            {transcriptCapture ? (
              transcriptCapture.getHistory().map((line, idx) => (
                <div key={idx} className="mb-1">{line}</div>
              ))
            ) : (
              <div className="text-gray-500 italic">Transcript capture not initialized</div>
            )}
            {transcriptCapture && transcriptCapture.getHistory().length === 0 && (
              <div className="text-gray-500 italic">No transcript data captured yet</div>
            )}
          </div>
          <div className="mt-2 text-right text-sm">
            Lines: {transcriptCapture ? transcriptCapture.getHistory().length : 0}
          </div>
        </div>
      </div>
      
      {/* Documentation */}
      <div className="mt-6 p-4 bg-gray-100 rounded">
        <h2 className="text-lg font-semibold mb-2">Session Resume Testing Instructions</h2>
        <div className="space-y-2 text-sm">
          <p>This test harness helps you validate session resumption functionality. Here's how to use it:</p>
          
          <ol className="list-decimal ml-6 space-y-1">
            <li><strong>Start Meeting with Delay</strong> - Simulates a meeting where details are available after a delay</li>
            <li><strong>Process Entries</strong> - Add transcript entries to the session</li>
            <li><strong>Simulate Refresh</strong> - Refreshes the page to test if session is properly resumed</li>
            <li><strong>Adjust Session Threshold</strong> - Change how long sessions remain valid</li>
          </ol>
          
          <p className="mt-2 font-medium">Test Cases:</p>
          <ul className="list-disc ml-6 space-y-1">
            <li>Start meeting with high delay (5000ms) then process entries - validates capture works even before meeting details load</li>
            <li>Process entries, wait 10-15 seconds, then refresh page - validates session resume works</li>
            <li>Process entries, wait longer than threshold, then refresh - validates expired sessions create new sessions</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default SessionResumeTestHarness;