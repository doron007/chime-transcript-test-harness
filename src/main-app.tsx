import React, { useState } from 'react';
import TestHarnessComponent from './test-harness/TestHarnessComponent';
import SessionResumeTestHarness from './test-harness/SessionResumeTestHarness';
import ScriptView from './ScriptView';

const App = () => {
  const [selectedTab, setSelectedTab] = useState('test-harness');
  const [selectedTestHarness, setSelectedTestHarness] = useState('transcript');
  const [viewingScript, setViewingScript] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-blue-600 text-white p-4 shadow-md">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl font-bold">Chime Transcript Script Tester</h1>
          <p className="text-sm opacity-80">
            Test and validate the different versions of transcript capture logic
          </p>
        </div>
      </header>

      <nav className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto">
          <ul className="flex space-x-4 p-4">
            <li>
              <button
                className={`px-4 py-2 rounded-md ${selectedTab === 'test-harness' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
                onClick={() => setSelectedTab('test-harness')}
              >
                Test Harness
              </button>
            </li>
            <li>
              <button
                className={`px-4 py-2 rounded-md ${selectedTab === 'scripts' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
                onClick={() => setSelectedTab('scripts')}
              >
                Script Files
              </button>
            </li>
            <li>
              <button
                className={`px-4 py-2 rounded-md ${selectedTab === 'about' ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-100'}`}
                onClick={() => setSelectedTab('about')}
              >
                About
              </button>
            </li>
          </ul>
        </div>
      </nav>

      <main className="py-6">
        {selectedTab === 'test-harness' && (
          <div>
            <div className="max-w-6xl mx-auto px-4 mb-4">
              <div className="flex space-x-2 border-b pb-2">
                <button
                  className={`px-4 py-2 rounded-t-md ${selectedTestHarness === 'transcript' ? 'bg-blue-100 text-blue-700 border-b-2 border-blue-500' : 'text-gray-600 hover:bg-gray-100'}`}
                  onClick={() => setSelectedTestHarness('transcript')}
                >
                  Transcript Logic Test
                </button>
                <button
                  className={`px-4 py-2 rounded-t-md ${selectedTestHarness === 'session' ? 'bg-blue-100 text-blue-700 border-b-2 border-blue-500' : 'text-gray-600 hover:bg-gray-100'}`}
                  onClick={() => setSelectedTestHarness('session')}
                >
                  Session Resume Test
                </button>
              </div>
            </div>
            
            {selectedTestHarness === 'transcript' && <TestHarnessComponent />}
            {selectedTestHarness === 'session' && <SessionResumeTestHarness />}
          </div>
        )}

        {selectedTab === 'scripts' && (
          <div className="max-w-6xl mx-auto p-4">
            <h2 className="text-xl font-bold mb-4">Script Files</h2>
            <p className="mb-4">
              Here you can view and download the full script files for each version:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="border rounded-md p-4 bg-white shadow-sm">
                <h3 className="font-medium text-lg">Version 2.1</h3>
                <p className="text-sm text-gray-600 mb-3">Original working version</p>
                <div className="flex space-x-2">
                  <button 
                    onClick={() => setViewingScript('/src/scripts/Chime-Meeting-Full-Transcript-Copier-2.1.js')}
                    className="bg-blue-500 text-white px-3 py-1 rounded text-sm"
                  >
                    View
                  </button>
                  <a 
                    href="/src/scripts/Chime-Meeting-Full-Transcript-Copier-2.1.js" 
                    download="Chime-Meeting-Full-Transcript-Copier-2.1.js"
                    className="bg-green-500 text-white px-3 py-1 rounded text-sm text-center"
                  >
                    Download
                  </a>
                </div>
              </div>

              <div className="border rounded-md p-4 bg-white shadow-sm">
                <h3 className="font-medium text-lg">Version 2.9</h3>
                <p className="text-sm text-gray-600 mb-3">Current problematic version</p>
                <div className="flex space-x-2">
                  <button 
                    onClick={() => setViewingScript('/src/scripts/Chime-Meeting-Full-Transcript-Copier-2.9.js')}
                    className="bg-blue-500 text-white px-3 py-1 rounded text-sm"
                  >
                    View
                  </button>
                  <a 
                    href="/src/scripts/Chime-Meeting-Full-Transcript-Copier-2.9.js" 
                    download="Chime-Meeting-Full-Transcript-Copier-2.9.js"
                    className="bg-green-500 text-white px-3 py-1 rounded text-sm text-center"
                  >
                    Download
                  </a>
                </div>
              </div>
            </div>
            
            <h3 className="text-lg font-semibold mb-3">Fixed Versions</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded-md p-4 bg-white shadow-sm">
                <h3 className="font-medium text-lg">Fixed Version</h3>
                <p className="text-sm text-gray-600 mb-3">Basic version with improved text matching</p>
                <div className="flex space-x-2">
                  <button 
                    onClick={() => setViewingScript('/src/scripts/Chime-Meeting-Full-Transcript-Copier-fixed.js')}
                    className="bg-blue-500 text-white px-3 py-1 rounded text-sm"
                  >
                    View
                  </button>
                  <a 
                    href="/src/scripts/Chime-Meeting-Full-Transcript-Copier-fixed.js" 
                    download="Chime-Meeting-Full-Transcript-Copier-fixed.js"
                    className="bg-green-500 text-white px-3 py-1 rounded text-sm text-center"
                  >
                    Download
                  </a>
                </div>
              </div>
              
              <div className="border rounded-md p-4 bg-white shadow-sm bg-blue-50">
                <div className="absolute top-0 right-0 transform translate-x-2 -translate-y-2">
                  <span className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full">NEW</span>
                </div>
                <h3 className="font-medium text-lg">Version 3.0 with Session Support</h3>
                <p className="text-sm text-gray-600 mb-3">Enhanced with session storage and resume capability</p>
                <div className="flex space-x-2">
                  <button 
                    onClick={() => setViewingScript('/src/scripts/Chime-Meeting-Full-Transcript-Copier-session.js')}
                    className="bg-blue-500 text-white px-3 py-1 rounded text-sm"
                  >
                    View
                  </button>
                  <a 
                    href="/src/scripts/Chime-Meeting-Full-Transcript-Copier-session.js" 
                    download="Chime-Meeting-Full-Transcript-Copier-3.0.js"
                    className="bg-green-500 text-white px-3 py-1 rounded text-sm text-center"
                  >
                    Download
                  </a>
                </div>
                <div className="mt-2 text-xs text-blue-600">
                  <p>✓ Preserves transcript across page refreshes</p>
                  <p>✓ Captures transcripts before meeting details load</p>
                  <p>✓ Improved interface with session indicator</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedTab === 'about' && (
          <div className="max-w-6xl mx-auto p-4">
            <h2 className="text-xl font-bold mb-4">About This Tool</h2>

            <div className="bg-white p-4 rounded-md shadow-sm mb-4">
              <h3 className="font-medium text-lg mb-2">Purpose</h3>
              <p className="mb-4">
                This tool was created to test and fix issues with the Chime Meeting Transcript
                Copier TamperMonkey script. The script helps users capture and save transcripts from
                Amazon Chime meetings, but version 2.9 introduced a bug causing duplicate lines in
                certain situations.
              </p>

              <h3 className="font-medium text-lg mb-2">Issue Summary</h3>
              <p className="mb-4">
                The primary issue in version 2.9 is in the text comparison logic used to determine
                if a new caption should update an existing line or be added as a new line. The
                problem occurs when Chime's transcription service corrects earlier parts of a
                sentence or when small punctuation/spacing differences exist.
              </p>

              <h3 className="font-medium text-lg mb-2">Fix Description</h3>
              <p className="mb-4">
                The fix implements a more robust text comparison algorithm that:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Normalizes text by removing punctuation and standardizing spaces</li>
                <li>
                  Uses bidirectional prefix matching (checking if either text starts with the other)
                </li>
                <li>Compares core sections of text to handle corrections in the middle</li>
                <li>Analyzes word similarity for longer texts with more complex differences</li>
              </ul>

              <h3 className="font-medium text-lg mb-2">Testing Methodology</h3>
              <p>
                This tool provides a controlled environment to test how different versions of the
                script process the same transcript data. It helps verify that the fixed version
                correctly identifies and updates related captions without creating duplicate lines.
              </p>
            </div>
            
            <div className="bg-white p-4 rounded-md shadow-sm">
              <h3 className="font-medium text-lg mb-2">Session Resume Feature</h3>
              <p className="mb-4">
                The Session Resume Test Harness validates an important feature for handling transcripts
                across page refreshes and when meeting details are slow to load:
              </p>
              <ul className="list-disc ml-6 mb-4">
                <li>Captures transcripts even when meeting details aren't immediately available</li>
                <li>Preserves transcript data across page refreshes within a configurable time window</li>
                <li>Ensures no transcript data is lost during DOM loading or network delays</li>
                <li>Creates new sessions when the time threshold is exceeded to avoid stale data</li>
              </ul>
              
              <p>
                This feature is critical for ensuring that users don't lose transcript history during
                brief interruptions, network issues, or accidental page refreshes during meetings.
              </p>
            </div>
          </div>
        )}
      </main>

      <footer className="bg-gray-800 text-white p-4 mt-8">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-sm">
            Chime Transcript Script Tester - Created to help debug and fix the TamperMonkey script
          </p>
        </div>
      </footer>

      {viewingScript && (
        <ScriptView 
          scriptPath={viewingScript}
          onClose={() => setViewingScript(null)}
        />
      )}
    </div>
  );
};

export default App;
