// src/test-harness/utils/script-loader.js

/**
 * Utility for loading and evaluating TamperMonkey scripts in a controlled test environment
 */

// Create a sandbox environment to run the script
const createSandbox = () => {
  // Create a simulated DOM environment
  const mockDOM = {
    querySelector: jest.fn(),
    querySelectorAll: jest.fn().mockReturnValue([]),
    addEventListener: jest.fn(),
    body: {
      appendChild: jest.fn(),
    },
  };

  // Mock browser objects that scripts might use
  const mockWindow = {
    addEventListener: jest.fn(),
    localStorage: {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    },
    indexedDB: {
      open: jest.fn(),
    },
    location: {
      href: 'https://app.chime.aws/meetings/123456789',
    },
    gc: jest.fn(),
  };

  // Mock console to capture logs
  const logs = {
    debug: [],
    info: [],
    warn: [],
    error: [],
  };

  const mockConsole = {
    log: (message, ...args) => {
      logs.info.push({ message, args });
    },
    debug: (message, ...args) => {
      logs.debug.push({ message, args });
    },
    warn: (message, ...args) => {
      logs.warn.push({ message, args });
    },
    error: (message, ...args) => {
      logs.error.push({ message, args });
    },
  };

  return {
    document: mockDOM,
    window: mockWindow,
    console: mockConsole,
    logs,
    Date: window.Date, // Use the real Date constructor
    setTimeout: jest.fn().mockImplementation((cb) => cb()), // Immediately execute timeouts for testing
    setInterval: jest.fn(), // Don't execute intervals
  };
};

/**
 * Extracts and exposing key classes and utilities from a TamperMonkey script
 * for testing purposes.
 */
const extractScriptComponents = (script) => {
  // Regular expression patterns to identify key classes
  const patterns = {
    CONFIG: /const\s+CONFIG\s*=\s*\{[\s\S]*?\};/,
    Utils: /const\s+Utils\s*=\s*\{[\s\S]*?\};/,
    TranscriptManager: /class\s+TranscriptManager\s*\{[\s\S]*?\}/,
    UIManager: /class\s+UIManager\s*\{[\s\S]*?\}/,
    DatabaseManager: /class\s+DatabaseManager\s*\{[\s\S]*?\}/,
    CacheManager: /class\s+CacheManager\s*\{[\s\S]*?\}/,
  };

  // Extract and evaluate each component
  const components = {};

  Object.entries(patterns).forEach(([name, pattern]) => {
    const match = script.match(pattern);
    if (match && match[0]) {
      components[name] = match[0];
    }
  });

  return components;
};

/**
 * Load a script file, process it to expose internal components, and prepare it for testing
 */
export const loadScript = async (scriptPath) => {
  try {
    // Load the script file
    const response = await fetch(scriptPath);
    const scriptText = await response.text();

    // Extract key components
    const components = extractScriptComponents(scriptText);

    // Create a sandbox to evaluate the script
    const sandbox = createSandbox();

    // Build a test harness version of the script
    const testHarnessScript = `
      ${components.CONFIG || ''}
      ${components.Utils || ''}
      ${components.TranscriptManager || ''}
      ${components.UIManager || ''}
      ${components.DatabaseManager || ''}
      ${components.CacheManager || ''}
      
      // Export components for testing
      return {
        CONFIG,
        Utils,
        TranscriptManager,
        UIManager,
        DatabaseManager,
        CacheManager,
        sandbox
      };
    `;

    // Evaluate the script in the sandbox
    const scriptFunction = new Function('sandbox', testHarnessScript);
    const extractedComponents = scriptFunction(sandbox);

    return {
      version: getScriptVersion(scriptText),
      components: extractedComponents,
      sandbox,
    };
  } catch (error) {
    console.error('Error loading script:', error);
    return null;
  }
};

/**
 * Extract version number from script metadata
 */
const getScriptVersion = (scriptText) => {
  const versionMatch = scriptText.match(/@version\s+(\d+\.\d+)/);
  return versionMatch ? versionMatch[1] : 'unknown';
};

/**
 * Create a test instance of TranscriptManager from a loaded script
 */
export const createTestTranscriptManager = (loadedScript) => {
  const { TranscriptManager, Utils, CONFIG } = loadedScript.components;

  // Create an instance
  const transcriptManager = new TranscriptManager();

  // Add necessary test hooks
  transcriptManager._testInfo = {
    version: loadedScript.version,
    history: [],
    actions: [],
  };

  // Override methods for testing
  const originalAddEntry = transcriptManager.addEntry;
  transcriptManager.addEntry = function (entry) {
    const result = originalAddEntry.call(this, entry);
    this._testInfo.actions.push({
      type: 'add',
      entry,
      timestamp: new Date().toISOString(),
    });
    return result;
  };

  return transcriptManager;
};

/**
 * Run a test with provided test data through a script version
 */
export const runScriptTest = (transcriptManager, testData) => {
  const results = [];

  // Process each test entry
  testData.forEach((entry) => {
    try {
      // Record initial state
      const initialHistoryLength = transcriptManager.history.length;

      // Process the transcript entry
      transcriptManager.captureLastRow(entry.speaker, entry.text);

      // Determine action taken
      const finalHistoryLength = transcriptManager.history.length;
      let action = 'unknown';

      if (finalHistoryLength > initialHistoryLength) {
        action = 'added';
      } else if (
        finalHistoryLength === initialHistoryLength &&
        initialHistoryLength > 0 &&
        transcriptManager.history[initialHistoryLength - 1] !== entry
      ) {
        action = 'updated';
      } else {
        action = 'skipped';
      }

      results.push({
        entry,
        action,
        line: finalHistoryLength > 0 ? transcriptManager.history[finalHistoryLength - 1] : null,
      });
    } catch (error) {
      results.push({
        entry,
        action: 'error',
        error: error.message,
      });
    }
  });

  return {
    finalHistory: [...transcriptManager.history],
    results,
  };
};
