import React, { useState, useEffect } from 'react';

// Test data from real Chime meetings
const TEST_DATA = [
  { speaker: "Doron, Hetz", text: "This is a test 12" },
  { speaker: "Doron, Hetz", text: "This is a test, 12," },
  { speaker: "Doron, Hetz", text: "This is a test, 123." },
  { speaker: "Vikram, Bhasker", text: "Yes, yes. So, uh, this is" },
  { speaker: "Vikram, Bhasker", text: "Yes, yes. So, uh this is uh good for uh like from QA side, uh, I" },
  { speaker: "Vikram, Bhasker", text: "Yes, yes. So, uh this is uh good for uh like from QA side uh I Prati did find." }
];

// Common utility functions used by all script versions
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

// Create a class to hold our 2.1 implementation
class ScriptVersion21 {
  constructor() {
    this.history = [];
  }
  
  processTranscript(speakerRaw, text) {
    const speaker = formatSpeakerName(speakerRaw);
    const newLine = `${speaker}: ${text}`.trim();
    const prevLine = this.history[this.history.length - 1]?.trim();
    const charactersToExclude = 2;
    
    if (prevLine) {
      const prevCut = prevLine.slice(0, -charactersToExclude);
      const newCut = newLine.slice(0, -charactersToExclude);
      
      if (newCut.includes(prevCut)) {
        this.history[this.history.length - 1] = newLine;
        return "updated";
      } else if (newLine !== prevLine) {
        this.history.push(newLine);
        return "added";
      }
      return "skipped"; 
    } else {
      this.history.push(newLine);
      return "added";
    }
  }
  
  reset() {
    this.history = [];
  }
}

// Create a class to hold our 2.9 implementation 
class ScriptVersion29 {
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
  
  processTranscript(speakerRaw, text) {
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
      return "added";
    }
    
    // Get just the text portion of the last entry
    const lastEntryText = lastEntry.substring(lastEntry.indexOf(']: ') + 3).trim();
    const currentText = text.trim();
    
    // Skip exact duplicates with same timestamp
    if (lastEntryText === currentText) {
      const lastTimestamp = lastEntry.match(/\[(\d{1,2}:\d{2}\s[AP]M)\]/);
      const currentTimestamp = time;
      if (lastTimestamp && currentTimestamp && lastTimestamp[0] === `[${currentTimestamp}]`) {
        return "skipped";
      }
    }
    
    if (currentText.startsWith(lastEntryText)) {
      // If the new text is an extension, update last entry
      const lastIndex = this.history.lastIndexOf(lastEntry);
      this.history[lastIndex] = formattedLine;
      return "updated";
    } else {
      // If not an extension, treat as a new entry
      this.addEntry(formattedLine);
      return "added";
    }
  }
  
  reset() {
    this.history = [];
  }
}

// Create a class to hold our fixed implementation
class ScriptVersionFixed {
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
  
  fuzzyMatch(str1, str2) {
    // Normalize strings - remove punctuation and standardize spacing
    const normalize = (str) => str.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").replace(/\s+/g, " ").trim();
    const norm1 = normalize(str1);
    const norm2 = normalize(str2);
    
    // Direct match
    if (norm1 === norm2) {
      return true;
    }
    
    // Check if normalized version starts with the other
    if (norm1.startsWith(norm2) || norm2.startsWith(norm1)) {
      return true;
    }
    
    // For longer texts, check parts and word similarity
    if (norm1.length > 10 && norm2.length > 10) {
      // Check for substantial overlapping content
      const minLength = Math.min(norm1.length, norm2.length);
      const comparisonLength = Math.max(minLength - 5, 10); // Allow for variations
      
      const str1Core = norm1.substring(0, comparisonLength);
      const str2Core = norm2.substring(0, comparisonLength);
      
      // If the core texts match, or one contains the other, they're likely related
      if (str1Core === str2Core || norm1.includes(str2Core) || norm2.includes(str1Core)) {
        return true;
      }
      
      // For very different structures, rely on meaningful word comparison
      if (norm1.length > 20 && norm2.length > 20) {
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
    }
    
    return false;
  }
  
  processTranscript(speakerRaw, text) {
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
      return "added";
    }
    
    // Extract text portions
    const lastEntryText = lastEntry.substring(lastEntry.indexOf(']: ') + 3).trim();
    const currentText = text.trim();
    
    // Check for exact match first
    if (lastEntryText === currentText) {
      return "skipped";
    }
    
    // Check if texts are similar using fuzzy matching
    if (this.fuzzyMatch(lastEntryText, currentText)) {
      // Update the existing entry - it's likely a correction or extension
      const lastIndex = this.history.lastIndexOf(lastEntry);
      this.history[lastIndex] = formattedLine;
      return "updated";
    } else {
      // It's a new sentence
      this.addEntry(formattedLine);
      return "added";
    }
  }
  
  reset() {
    this.history = [];
  }
}

const TestHarnessComponent = () => {
  // Initialize the script versions
  const [v21] = useState(new ScriptVersion21());
  const [v29] = useState(new ScriptVersion29());
  const [fixed] = useState(new ScriptVersionFixed());
  
  // State for test data
  const [testData, setTestData] = useState(TEST_DATA);
  const [customSpeaker, setCustomSpeaker] = useState("Doron, Hetz");
  const [customText, setCustomText] = useState("");
  
  // State for test results
  const [results, setResults] = useState([]);
  const [isProcessed, setIsProcessed] = useState(false);
  
  // Function to process all test data
  const processAll = () => {
    // Reset all script versions
    v21.reset();
    v29.reset();
    fixed.reset();
    
    // Clear results
    setResults([]);
    
    // Process each test entry through all script versions
    testData.forEach((entry, index) => {
      const result21 = v21.processTranscript(entry.speaker, entry.text);
      const result29 = v29.processTranscript(entry.speaker, entry.text);
      const resultFixed = fixed.processTranscript(entry.speaker, entry.text);
      
      setResults(prevResults => [
        ...prevResults,
        {
          id: index,
          speaker: entry.speaker,
          text: entry.text,
          v21: result21,
          v29: result29,
          fixed: resultFixed
        }
      ]);
    });
    
    setIsProcessed(true);
  };
  
  // Function to add a custom test entry
  const addCustomEntry = () => {
    if (!customText.trim()) return;
    
    // Add to test data
    setTestData(prev => [
      ...prev,
      { speaker: customSpeaker, text: customText }
    ]);
    
    // Clear input
    setCustomText("");
  };
  
  // Function to process just the custom entry
  const processCustomEntry = () => {
    if (!customText.trim()) return;
    
    // Process the entry through all script versions
    const result21 = v21.processTranscript(customSpeaker, customText);
    const result29 = v29.processTranscript(customSpeaker, customText);
    const resultFixed = fixed.processTranscript(customSpeaker, customText);
    
    // Add to results
    setResults(prevResults => [
      ...prevResults,
      {
        id: testData.length,
        speaker: customSpeaker,
        text: customText,
        v21: result21,
        v29: result29,
        fixed: resultFixed
      }
    ]);
    
    // Clear input
    setCustomText("");
  };
  
  // Function to reset everything
  const resetAll = () => {
    v21.reset();
    v29.reset();
    fixed.reset();
    setResults([]);
    setIsProcessed(false);
  };
  
  return (
    <div className="max-w-6xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Chime Transcript Script Tester</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Test Data Panel */}
        <div>
          <h2 className="text-lg font-semibold mb-2">Test Data</h2>
          <div className="border p-2 h-64 overflow-auto bg-gray-50 rounded">
            {testData.map((entry, idx) => (
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
              <button 
                onClick={addCustomEntry}
                className="bg-blue-500 text-white px-3 py-1 rounded"
              >
                Add
              </button>
            </div>
          </div>
        </div>
        
        {/* Actions Panel */}
        <div>
          <h2 className="text-lg font-semibold mb-2">Actions</h2>
          <div className="space-y-2">
            <button 
              onClick={processAll} 
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
              onClick={resetAll} 
              className="bg-red-600 text-white px-4 py-2 rounded block w-full"
            >
              Reset All Results
            </button>
          </div>
          
          <div className="mt-4">
            <h3 className="font-medium mb-1">Results Log</h3>
            <div className="border p-2 h-40 overflow-auto bg-gray-50 rounded">
              {results.map((result) => (
                <div key={result.id} className="text-sm mb-1 p-1 border-b">
                  <div>
                    <span className="font-semibold">Entry {result.id + 1}:</span> {result.speaker} - {result.text.length > 40 ? `${result.text.substring(0, 40)}...` : result.text}
                  </div>
                  <div className="grid grid-cols-3 gap-1 mt-1">
                    <div className={`px-1 rounded ${result.v21 === 'added' ? 'bg-green-100' : result.v21 === 'updated' ? 'bg-yellow-100' : 'bg-gray-100'}`}>
                      V2.1: {result.v21}
                    </div>
                    <div className={`px-1 rounded ${result.v29 === 'added' ? 'bg-green-100' : result.v29 === 'updated' ? 'bg-yellow-100' : 'bg-gray-100'}`}>
                      V2.9: {result.v29}
                    </div>
                    <div className={`px-1 rounded ${result.fixed === 'added' ? 'bg-green-100' : result.fixed === 'updated' ? 'bg-yellow-100' : 'bg-gray-100'}`}>
                      Fixed: {result.fixed}
                    </div>
                  </div>
                </div>
              ))}
              {results.length === 0 && <div className="text-gray-500 italic p-2">No results yet. Process test data to see results.</div>}
            </div>
          </div>
        </div>
      </div>
      
      {/* Results Output */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <h2 className="text-lg font-semibold mb-2">V2.1 Output <span className="text-sm font-normal">(Working)</span></h2>
          <div className="border p-2 h-64 overflow-auto bg-gray-50 rounded font-mono text-sm">
            {v21.history.map((line, idx) => (
              <div key={idx} className="mb-1">{line}</div>
            ))}
            {v21.history.length === 0 && <div className="text-gray-500 italic p-2">No output yet</div>}
          </div>
          <div className="mt-1 text-right text-sm">
            Lines: {v21.history.length}
          </div>
        </div>
        
        <div>
          <h2 className="text-lg font-semibold mb-2">V2.9 Output <span className="text-sm font-normal">(Problematic)</span></h2>
          <div className="border p-2 h-64 overflow-auto bg-gray-50 rounded font-mono text-sm">
            {v29.history.map((line, idx) => (
              <div key={idx} className="mb-1">{line}</div>
            ))}
            {v29.history.length === 0 && <div className="text-gray-500 italic p-2">No output yet</div>}
          </div>
          <div className="mt-1 text-right text-sm">
            Lines: {v29.history.length}
          </div>
        </div>
        
        <div>
          <h2 className="text-lg font-semibold mb-2">Fixed Output</h2>
          <div className="border p-2 h-64 overflow-auto bg-gray-50 rounded font-mono text-sm">
            {fixed.history.map((line, idx) => (
              <div key={idx} className="mb-1">{line}</div>
            ))}
            {fixed.history.length === 0 && <div className="text-gray-500 italic p-2">No output yet</div>}
          </div>
          <div className="mt-1 text-right text-sm">
            Lines: {fixed.history.length}
          </div>
        </div>
      </div>
      
      {/* Fix Information */}
      <div className="mt-6 p-4 bg-gray-100 rounded">
        <h2 className="text-lg font-semibold mb-2">Fix Implementation Details</h2>
        <p className="mb-2">
          The fixed version improves text matching using a more sophisticated approach that:
        </p>
        <ul className="list-disc ml-6 mb-4">
          <li>Normalizes text by removing punctuation and standardizing spaces</li>
          <li>Detects if one text is a variation of another even with small changes</li>
          <li>Analyzes core text portions to handle corrections in the middle of sentences</li>
          <li>Uses sophisticated word-based matching for longer texts</li>
        </ul>
        
        <h3 className="font-medium mt-4">Implementation for TamperMonkey</h3>
        <div className="text-sm mt-2">
          <p>To fix the issue in your TamperMonkey script:</p>
          <ol className="list-decimal ml-6 mt-2">
            <li>Replace the <code>fuzzyMatch</code> function with the improved version</li>
            <li>Update the <code>captureLastRow</code> method to use the new comparison logic</li>
            <li>Increment the script version number to track your changes</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default TestHarnessComponent;