import React, { useState, useEffect } from 'react';

// Test data from real Chime meetings
const DEFAULT_TRANSCRIPT_DATA = [
  { speaker: 'Doron, Hetz', text: 'This is a test 12' },
  { speaker: 'Doron, Hetz', text: 'This is a test, 12,' },
  { speaker: 'Doron, Hetz', text: 'This is a test, 123.' },
  { speaker: 'Vikram, Bhasker', text: 'Yes, yes. So, uh, this is' },
  {
    speaker: 'Vikram, Bhasker',
    text: 'Yes, yes. So, uh this is uh good for uh like from QA side, uh, I',
  },
  {
    speaker: 'Vikram, Bhasker',
    text: 'Yes, yes. So, uh this is uh good for uh like from QA side uh I Prati did find.',
  },
  {
    speaker: 'Vikram, Bhasker',
    text: "One of the edge gates where the bug was happening, I'm not able to reprove that. I will add tickets for that, but from like this is an improvement on the CX for uh most of the play requests except from like one new edge case where you ask for conversational recommendation and you ignore that recommendation and go through a new playback request, but we're not seeing, uh, NPS flashing twice. So this one is, is, uh",
  },
  {
    speaker: 'Vikram, Bhasker',
    text: "One of the edge gates where the bug was happening, I'm not able to reprove that. I will add tickets for that, but from like this is an improvement on the CX for uh most of the play requests except from like one new edge case where you ask for conversational recommendation and you ignore that recommendation and go through a new playback request, but we're not seeing, uh, NPS flashing twice. So this one is, is uh good to go. Uh, is this the 244?",
  },
];

// Helper function to format speaker names
const formatSpeakerName = (speaker) => {
  const parts = speaker.split(', ');
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : speaker;
};

// Current time simulation (for timestamps)
const getCurrentTime = () => {
  return new Date().toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

// VERSION 2.1 Logic (Working version)
class TranscriptCaptureV21 {
  constructor() {
    this.history = [];
  }

  captureTranscript(speakerRaw, text) {
    const speaker = formatSpeakerName(speakerRaw);
    const newLastRow = `${speaker}: ${text}`.trim();

    const prevLastRow = this.history[this.history.length - 1]?.trim();
    const charactersToExclude = 2;

    if (prevLastRow) {
      const prevLastRowExcludingEnd = prevLastRow.slice(0, -charactersToExclude);
      const newLastRowExcludingEnd = newLastRow.slice(0, -charactersToExclude);

      if (newLastRowExcludingEnd.includes(prevLastRowExcludingEnd)) {
        this.history[this.history.length - 1] = newLastRow;
        return { action: 'updated', line: newLastRow };
      } else if (newLastRow !== prevLastRow) {
        this.history.push(newLastRow);
        return { action: 'added', line: newLastRow };
      }
      return { action: 'skipped', line: newLastRow };
    } else {
      this.history.push(newLastRow);
      return { action: 'added', line: newLastRow };
    }
  }

  getTranscript() {
    return this.history.join('\n');
  }

  clear() {
    this.history = [];
  }
}

// VERSION 2.9 Logic (Problematic version)
class TranscriptCaptureV29 {
  constructor() {
    this.history = [];
  }

  addEntry(entry) {
    if (!this.history.includes(entry)) {
      this.history.push(entry);
      return true;
    }
    return false;
  }

  captureTranscript(speakerRaw, text) {
    const speaker = formatSpeakerName(speakerRaw);
    const time = getCurrentTime();
    const formattedLine = `${speaker} [${time}]: ${text}`.trim();

    // Get the last history entry for this speaker
    let lastCCEntry = null;
    for (let i = this.history.length - 1; i >= 0; i--) {
      // Find the last entry from this speaker
      if (!this.history[i].startsWith('[') && this.history[i].startsWith(`${speaker}`)) {
        lastCCEntry = this.history[i];
        break;
      }
    }

    if (!lastCCEntry) {
      this.addEntry(formattedLine);
      return { action: 'added', line: formattedLine };
    }

    // Get just the text portion of the last CC entry
    const lastEntryText = lastCCEntry.substring(lastCCEntry.indexOf(']: ') + 3).trim();
    const currentText = text.trim();

    // Skip exact duplicates with same timestamp
    if (lastEntryText === currentText) {
      const lastTimestamp = lastCCEntry.match(/\[(\d{1,2}:\d{2}\s[AP]M)\]/);
      const currentTimestamp = time;
      if (lastTimestamp && currentTimestamp && lastTimestamp[0] === `[${currentTimestamp}]`) {
        return { action: 'skipped', line: formattedLine };
      }
    }

    if (currentText.startsWith(lastEntryText)) {
      // If the new text is an extension, update last entry
      const lastCCIndex = this.history.lastIndexOf(lastCCEntry);
      this.history[lastCCIndex] = formattedLine;
      return { action: 'updated', line: formattedLine };
    } else {
      // If not an extension, treat as a new entry
      this.addEntry(formattedLine);
      return { action: 'added', line: formattedLine };
    }
  }

  getTranscript() {
    return this.history.join('\n');
  }

  clear() {
    this.history = [];
  }
}

// PROPOSED FIX Logic
class TranscriptCaptureFixed {
  constructor() {
    this.history = [];
  }

  addEntry(entry) {
    if (!this.history.includes(entry)) {
      this.history.push(entry);
      return true;
    }
    return false;
  }

  captureTranscript(speakerRaw, text) {
    const speaker = formatSpeakerName(speakerRaw);
    const time = getCurrentTime();
    const formattedLine = `${speaker} [${time}]: ${text}`.trim();

    // Get the last history entry for this speaker
    let lastCCEntry = null;
    for (let i = this.history.length - 1; i >= 0; i--) {
      // Find the last entry from this speaker
      if (!this.history[i].startsWith('[') && this.history[i].startsWith(`${speaker}`)) {
        lastCCEntry = this.history[i];
        break;
      }
    }

    if (!lastCCEntry) {
      this.addEntry(formattedLine);
      return { action: 'added', line: formattedLine };
    }

    // Extract text portions
    const lastEntryText = lastCCEntry.substring(lastCCEntry.indexOf(']: ') + 3).trim();
    const currentText = text.trim();

    // Check for exact match first
    if (lastEntryText === currentText) {
      return { action: 'skipped', line: formattedLine };
    }

    // Check if one contains most of the other (ignoring last few chars for variations)
    const minLength = Math.min(lastEntryText.length, currentText.length);
    const comparisonLength = Math.max(minLength - 3, 0); // Allow for small variations

    const lastEntryCoreText = lastEntryText.substring(0, comparisonLength);
    const currentCoreText = currentText.substring(0, comparisonLength);

    if (
      lastEntryCoreText === currentCoreText ||
      currentText.includes(lastEntryCoreText) ||
      lastEntryText.includes(currentCoreText)
    ) {
      // Update existing entry - it's likely a correction
      const lastCCIndex = this.history.lastIndexOf(lastCCEntry);
      this.history[lastCCIndex] = formattedLine;
      return { action: 'updated', line: formattedLine };
    } else {
      // It's a new sentence
      this.addEntry(formattedLine);
      return { action: 'added', line: formattedLine };
    }
  }

  getTranscript() {
    return this.history.join('\n');
  }

  clear() {
    this.history = [];
  }
}

const TranscriptTestHarness = () => {
  const [captureV21] = useState(new TranscriptCaptureV21());
  const [captureV29] = useState(new TranscriptCaptureV29());
  const [captureFixed] = useState(new TranscriptCaptureFixed());

  const [transcriptData, setTranscriptData] = useState(DEFAULT_TRANSCRIPT_DATA);
  const [customSpeaker, setCustomSpeaker] = useState('Doron, Hetz');
  const [customText, setCustomText] = useState('');
  const [actionLog, setActionLog] = useState([]);

  const processAllTranscripts = () => {
    captureV21.clear();
    captureV29.clear();
    captureFixed.clear();
    setActionLog([]);

    transcriptData.forEach((entry, index) => {
      const resultV21 = captureV21.captureTranscript(entry.speaker, entry.text);
      const resultV29 = captureV29.captureTranscript(entry.speaker, entry.text);
      const resultFixed = captureFixed.captureTranscript(entry.speaker, entry.text);

      setActionLog((prev) => [
        ...prev,
        {
          index,
          speaker: entry.speaker,
          text: entry.text,
          v21: resultV21.action,
          v29: resultV29.action,
          fixed: resultFixed.action,
        },
      ]);
    });
  };

  const addCustomEntry = () => {
    if (!customText.trim()) return;

    setTranscriptData((prev) => [...prev, { speaker: customSpeaker, text: customText }]);
    setCustomText('');
  };

  const processCustomEntry = () => {
    if (!customText.trim()) return;

    const resultV21 = captureV21.captureTranscript(customSpeaker, customText);
    const resultV29 = captureV29.captureTranscript(customSpeaker, customText);
    const resultFixed = captureFixed.captureTranscript(customSpeaker, customText);

    setActionLog((prev) => [
      ...prev,
      {
        index: transcriptData.length,
        speaker: customSpeaker,
        text: customText,
        v21: resultV21.action,
        v29: resultV29.action,
        fixed: resultFixed.action,
      },
    ]);

    setCustomText('');
  };

  const clearAll = () => {
    captureV21.clear();
    captureV29.clear();
    captureFixed.clear();
    setActionLog([]);
  };

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Chime Transcript Logic Test Harness</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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
                <option value="John, Doe">John, Doe</option>
              </select>
              <input
                type="text"
                value={customText}
                onChange={(e) => setCustomText(e.target.value)}
                placeholder="Enter transcript text"
                className="border rounded p-1 flex-grow mr-2"
              />
              <button onClick={addCustomEntry} className="bg-blue-500 text-white px-3 py-1 rounded">
                Add
              </button>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">Actions</h2>
          <div className="space-y-2">
            <button
              onClick={processAllTranscripts}
              className="bg-green-600 text-white px-4 py-2 rounded block w-full"
            >
              Process All Test Data
            </button>
            <button
              onClick={processCustomEntry}
              className="bg-blue-600 text-white px-4 py-2 rounded block w-full"
            >
              Process Custom Entry Only
            </button>
            <button
              onClick={clearAll}
              className="bg-red-600 text-white px-4 py-2 rounded block w-full"
            >
              Clear All Results
            </button>
          </div>

          <div className="mt-4">
            <h3 className="font-medium mb-1">Action Log</h3>
            <div className="border p-2 h-40 overflow-auto bg-gray-50 rounded">
              {actionLog.map((log, idx) => (
                <div key={idx} className="text-sm mb-1 p-1 border-b">
                  <div>
                    <span className="font-semibold">Entry {log.index + 1}:</span> {log.speaker} -{' '}
                    {log.text.substring(0, 40)}...
                  </div>
                  <div className="grid grid-cols-3 gap-1 mt-1">
                    <div
                      className={`px-1 rounded ${log.v21 === 'added' ? 'bg-green-100' : log.v21 === 'updated' ? 'bg-yellow-100' : 'bg-gray-100'}`}
                    >
                      V2.1: {log.v21}
                    </div>
                    <div
                      className={`px-1 rounded ${log.v29 === 'added' ? 'bg-green-100' : log.v29 === 'updated' ? 'bg-yellow-100' : 'bg-gray-100'}`}
                    >
                      V2.9: {log.v29}
                    </div>
                    <div
                      className={`px-1 rounded ${log.fixed === 'added' ? 'bg-green-100' : log.fixed === 'updated' ? 'bg-yellow-100' : 'bg-gray-100'}`}
                    >
                      Fixed: {log.fixed}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <h2 className="text-lg font-semibold mb-2">
            V2.1 Output <span className="text-sm font-normal">(Working)</span>
          </h2>
          <div className="border p-2 h-64 overflow-auto bg-gray-50 rounded font-mono text-sm">
            {captureV21
              .getTranscript()
              .split('\n')
              .map((line, idx) => (
                <div key={idx} className="mb-1">
                  {line}
                </div>
              ))}
          </div>
          <div className="mt-1 text-right text-sm">Lines: {captureV21.history.length}</div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">
            V2.9 Output <span className="text-sm font-normal">(Problematic)</span>
          </h2>
          <div className="border p-2 h-64 overflow-auto bg-gray-50 rounded font-mono text-sm">
            {captureV29
              .getTranscript()
              .split('\n')
              .map((line, idx) => (
                <div key={idx} className="mb-1">
                  {line}
                </div>
              ))}
          </div>
          <div className="mt-1 text-right text-sm">Lines: {captureV29.history.length}</div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">Fixed Version Output</h2>
          <div className="border p-2 h-64 overflow-auto bg-gray-50 rounded font-mono text-sm">
            {captureFixed
              .getTranscript()
              .split('\n')
              .map((line, idx) => (
                <div key={idx} className="mb-1">
                  {line}
                </div>
              ))}
          </div>
          <div className="mt-1 text-right text-sm">Lines: {captureFixed.history.length}</div>
        </div>
      </div>

      <div className="mt-6 p-4 bg-gray-100 rounded">
        <h2 className="text-lg font-semibold mb-2">Fix Implementation for TamperMonkey</h2>
        <p className="mb-2">
          Replace the <code>fuzzyMatch</code> function in your script with this improved version:
        </p>
        <pre className="bg-gray-800 text-white p-2 rounded text-sm overflow-auto">
          {`fuzzyMatch: (str1, str2) => {
  // Normalize strings
  const norm1 = str1.toLowerCase().trim();
  const norm2 = str2.toLowerCase().trim();
  
  // Direct match
  if (norm1 === norm2) {
    return true;
  }
  
  // Check if one is a substring of the other (with flexibility for variations)
  const minLength = Math.min(norm1.length, norm2.length);
  const comparisonLength = Math.max(minLength - 3, 0); // Allow for small variations at the end
  
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
}`}
        </pre>

        <p className="mt-4 mb-2">
          And replace the relevant portion of <code>captureLastRow</code> with:
        </p>
        <pre className="bg-gray-800 text-white p-2 rounded text-sm overflow-auto">
          {`// Get the last history entry for this speaker
let lastCCEntry = null;
for (let i = this.history.length - 1; i >= 0; i--) {
  if (!this.history[i].startsWith('[') && this.history[i].startsWith(\`\${speaker}\`)) {
    lastCCEntry = this.history[i];
    break;
  }
}

if (!lastCCEntry) {
  this.addEntry(formattedLine);
  Logger.debug('Added new line for different speaker:', formattedLine);
  return;
}

// Get just the text portion of the last CC entry
const lastEntryText = lastCCEntry.substring(lastCCEntry.indexOf(']: ') + 3).trim();
const currentText = text.trim();

// Skip exact duplicates
if (lastEntryText === currentText) {
  return;
}

// Check if texts are similar using fuzzy matching
if (Utils.fuzzyMatch(lastEntryText, currentText)) {
  // Update the existing entry - it's likely a correction or extension
  const lastCCIndex = this.history.lastIndexOf(lastCCEntry);
  this.history[lastCCIndex] = formattedLine;
  Logger.debug('Updated existing line:', { old: lastCCEntry, new: formattedLine });
} else {
  // It's a new sentence
  this.addEntry(formattedLine);
  Logger.debug('Added new line for new sentence:', formattedLine);
}`}
        </pre>
      </div>
    </div>
  );
};

export default TranscriptTestHarness;
