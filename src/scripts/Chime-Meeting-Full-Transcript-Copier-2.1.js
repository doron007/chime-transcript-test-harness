// ==UserScript==
// @name         Chime Meeting Full Transcript Copier
// @namespace    @amzn/Chime-Meeting-Full-Transcript-Copier
// @version      2.1
// @license      UNLICENSED
// @namespace    http://tampermonkey.net/
// @description  Copies the full transcript of the meeting you have (copy during and after you close the call)
// @author       Doron Hetz (inspired by Christian Back Jonsson original script)
// @downloadURL  https://drive.corp.amazon.com/view/cjonsson@/Tampermonkey/ChimeMeetingFullTranscriptCopier.user.js
// @supportURL   https://w.amazon.com/bin/view/Users/cjonsson/ChimeMeetingFullTranscriptCopier/
// @match        https://app.chime.aws/meetings/*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // Array to store the last row content
  const lastRowHistory = [];

  // IndexedDB setup
  const dbName = 'ChimeTranscriptDB';
  const dbVersion = 2; // Increment version for updates
  let db;
  let dbReady = false; // Flag to ensure database is ready
  let sessionStartTime = null; // To store the meeting start time

  function initializeDatabase() {
    const dbRequest = indexedDB.open(dbName, dbVersion);

    dbRequest.onupgradeneeded = function (event) {
      db = event.target.result;
      console.log(`Upgrading IndexedDB to version ${dbVersion}...`);

      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' });
        console.log('Created object store: sessions');
      }
    };

    dbRequest.onsuccess = function (event) {
      db = event.target.result;
      dbReady = true;
      console.log('IndexedDB is ready and sessions store is available.');
    };

    dbRequest.onerror = function (event) {
      console.error('IndexedDB initialization error:', event.target.error);
    };
  }

  function getSessionId() {
    if (!sessionStartTime) {
      sessionStartTime = new Date();
    }

    const options = { timeZone: 'America/Los_Angeles', hour12: true };
    const pstDate = sessionStartTime.toLocaleDateString('en-CA', {
      timeZone: 'America/Los_Angeles',
    }); // YYYY-MM-DD format
    const pstTime = sessionStartTime
      .toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour12: true })
      .split(':');
    const formattedTime = `${pstTime[0]}-${pstTime[1]} ${pstTime[2].split(' ')[1]}`; // hh-mm AM/PM

    return `Chime CC [${pstDate}] [${formattedTime}]`;
  }

  function saveSessionToDB() {
    if (!dbReady || !db || lastRowHistory.length === 0) return;

    const sessionId = getSessionId();

    try {
      const transaction = db.transaction(['sessions'], 'readwrite');
      const store = transaction.objectStore('sessions');

      store.put({ id: sessionId, content: lastRowHistory.join('\n') });

      transaction.oncomplete = function () {
        console.log('Session saved:', sessionId);
      };

      transaction.onerror = function (event) {
        console.error('Error saving session:', event.target.error);
      };
    } catch (error) {
      console.error('Save operation failed:', error);
      if (error.name === 'NotFoundError') {
        console.error('Object store not found. Reinitializing database.');
        initializeDatabase();
      }
    }
  }

  function formatSpeakerName(speaker) {
    const parts = speaker.split(', ');
    if (parts.length === 2) {
      return `${parts[1]} ${parts[0]}`; // Convert "Last, First" to "First Last"
    }
    return speaker; // Return as is if the format doesn't match
  }

  function captureLastRow() {
    const transcriptElement = document.querySelector('._1bqBOFA5PPIrx5PUq9uxyl');
    if (transcriptElement) {
      const speakerElements = transcriptElement.querySelectorAll('p._3512TwqLzPaGGAWp_8W1se');
      const textElements = transcriptElement.querySelectorAll('p._1XM7bRv8y86tbk7HmDvoj7');

      if (speakerElements.length > 0 && textElements.length > 0) {
        const lastSpeakerIndex = speakerElements.length - 1;
        const lastTextIndex = textElements.length - 1;
        let speaker = speakerElements[lastSpeakerIndex].textContent;
        const text = textElements[lastTextIndex].textContent;

        // Format speaker name to "First Last"
        speaker = formatSpeakerName(speaker);

        const newLastRow = `${speaker}: ${text}`.trim();

        const prevLastRow = lastRowHistory[lastRowHistory.length - 1]?.trim();

        const charactersToExclude = 2;

        if (prevLastRow) {
          const prevLastRowExcludingEnd = prevLastRow.slice(0, -charactersToExclude);
          const newLastRowExcludingEnd = newLastRow.slice(0, -charactersToExclude);

          if (newLastRowExcludingEnd.includes(prevLastRowExcludingEnd)) {
            lastRowHistory[lastRowHistory.length - 1] = newLastRow;
          } else if (newLastRow !== prevLastRow) {
            lastRowHistory.push(newLastRow);
          }
        } else {
          lastRowHistory.push(newLastRow);
        }
      }
    }
  }

  function showSnackbar(message, isError = false) {
    snackbar.textContent = message;
    snackbar.style.backgroundColor = isError ? '#d9534f' : '#4CAF50'; // Red for errors, green for success
    snackbar.style.visibility = 'visible';
    snackbar.style.opacity = '1';

    setTimeout(() => {
      snackbar.style.opacity = '0';
      snackbar.style.visibility = 'hidden';
    }, 3000); // Hide after 3 seconds
  }

  // Create buttons for Copy and Save
  const copyButton = document.createElement('button');
  copyButton.textContent = 'Copy';
  copyButton.style.position = 'fixed';
  copyButton.style.bottom = '10px';
  copyButton.style.right = '10px';
  copyButton.style.zIndex = '9999';
  copyButton.style.backgroundColor = '#4CAF50';
  copyButton.style.color = 'white';
  copyButton.style.padding = '10px 20px';
  copyButton.style.border = 'none';
  copyButton.style.borderRadius = '4px';
  copyButton.style.fontSize = '16px';
  copyButton.style.cursor = 'pointer';
  document.body.appendChild(copyButton);

  const saveButton = document.createElement('button');
  saveButton.textContent = 'Save';
  saveButton.style.position = 'fixed';
  saveButton.style.bottom = '10px';
  saveButton.style.right = '80px'; // Positioned to the left of the Copy button
  saveButton.style.zIndex = '9999';
  saveButton.style.backgroundColor = '#007BFF';
  saveButton.style.color = 'white';
  saveButton.style.padding = '10px 20px';
  saveButton.style.border = 'none';
  saveButton.style.borderRadius = '4px';
  saveButton.style.fontSize = '16px';
  saveButton.style.cursor = 'pointer';
  document.body.appendChild(saveButton);

  const snackbar = document.createElement('div');
  snackbar.id = 'snackbar';
  snackbar.style.position = 'fixed';
  snackbar.style.bottom = '30px';
  snackbar.style.left = '50%';
  snackbar.style.transform = 'translateX(-50%)';
  snackbar.style.backgroundColor = '#333';
  snackbar.style.color = '#fff';
  snackbar.style.padding = '12px 20px';
  snackbar.style.borderRadius = '5px';
  snackbar.style.fontSize = '14px';
  snackbar.style.textAlign = 'center';
  snackbar.style.zIndex = '10000';
  snackbar.style.visibility = 'hidden';
  snackbar.style.opacity = '0';
  snackbar.style.transition = 'visibility 0s, opacity 0.5s ease-in-out';
  document.body.appendChild(snackbar);

  copyButton.addEventListener('click', () => {
    if (lastRowHistory.length === 0) {
      showSnackbar('Nothing to copy. Please turn on CC Transcript.', true);
      return;
    }

    const tempInput = document.createElement('textarea');
    tempInput.value = lastRowHistory.join('\n');
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
    showSnackbar('Full Transcript copied to clipboard!');
  });

  saveButton.addEventListener('click', () => {
    if (lastRowHistory.length === 0) {
      showSnackbar('Nothing to save. Please turn on CC Transcript.', true);
      return;
    }

    const blob = new Blob([lastRowHistory.join('\n')], { type: 'text/plain' });
    const sessionId = getSessionId();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${sessionId}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showSnackbar('Transcript saved to file!');
  });

  // Initialize the database
  initializeDatabase();

  // Periodically save to IndexedDB
  setInterval(() => {
    if (dbReady) saveSessionToDB();
  }, 10000);

  // Periodically capture rows
  setInterval(captureLastRow, 1000);
})();
