import React, { useState, useEffect } from 'react';

interface ScriptViewProps {
  scriptPath: string;
  onClose: () => void;
}

const ScriptView: React.FC<ScriptViewProps> = ({ scriptPath, onClose }) => {
  const [scriptContent, setScriptContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchScript = async () => {
      try {
        setLoading(true);
        const response = await fetch(scriptPath);
        if (!response.ok) {
          throw new Error(`Failed to fetch script (${response.status})`);
        }
        const text = await response.text();
        setScriptContent(text);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchScript();
  }, [scriptPath]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center border-b p-4">
          <h2 className="text-xl font-bold">Script Viewer</h2>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
        
        <div className="flex-grow overflow-auto p-4">
          {loading && (
            <div className="flex justify-center items-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-700"></div>
            </div>
          )}
          
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              Error: {error}
            </div>
          )}
          
          {!loading && !error && (
            <pre className="bg-gray-100 p-4 rounded font-mono text-sm whitespace-pre-wrap overflow-auto">
              {scriptContent}
            </pre>
          )}
        </div>
        
        <div className="border-t p-4 flex justify-end">
          <button 
            onClick={onClose}
            className="bg-blue-500 text-white px-4 py-2 rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScriptView;