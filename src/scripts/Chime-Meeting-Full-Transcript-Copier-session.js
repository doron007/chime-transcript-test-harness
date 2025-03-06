// ==UserScript==
// @name         Chime Meeting Full Transcript Copier (Session Support)
// @namespace    http://tampermonkey.net/
// @version      3.0
// @description  Automatically captures full transcript from Amazon Chime meetings with session resumption support
// @author       Doron Hetz
// @match        https://app.chime.aws/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';
    
    // Configuration
    const CONFIG = {
        updateInterval: 1000,  // Check for new caption lines every 1 second
        buttonText: 'Copy Transcript',
        sessionThreshold: 30000, // 30 seconds session validity window
        debug: false  // Set to true for debugging logs in console
    };
    
    // Logger utility
    const Logger = {
        debug: function(...args) {
            if (CONFIG.debug) console.log('[Chime Transcript]', ...args);
        },
        info: function(...args) {
            console.info('[Chime Transcript]', ...args);
        },
        error: function(...args) {
            console.error('[Chime Transcript]', ...args);
        }
    };
    
    // Utility functions
    const Utils = {
        formatSpeakerName: (speaker) => {
            if (!speaker) return 'Unknown Speaker';
            const parts = speaker.split(', ');
            return parts.length === 2 ? `${parts[1]} ${parts[0]}` : speaker;
        },
        
        getCurrentTime: () => {
            return new Date().toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });
        },
        
        // Improved fuzzy matching for text comparison
        fuzzyMatch: (str1, str2) => {
            // Normalize strings
            const normalize = (str) => str.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").replace(/\s+/g, " ").trim();
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
    };
    
    // Session-aware transcript capture module
    class SessionAwareTranscriptCapture {
        constructor() {
            this.history = [];
            this.sessionId = '';
            this.lastActivity = 0;
            this.initSession();
        }
        
        // Initialize session from storage or create new
        initSession() {
            try {
                const savedSession = sessionStorage.getItem('chimeTranscriptSession');
                if (savedSession) {
                    const sessionData = JSON.parse(savedSession);
                    const elapsed = Date.now() - sessionData.lastActivity;
                    
                    // Check if session is still valid
                    if (elapsed < CONFIG.sessionThreshold) {
                        this.history = sessionData.history || [];
                        this.sessionId = sessionData.sessionId;
                        this.lastActivity = sessionData.lastActivity;
                        Logger.info(`Resumed session: ${this.sessionId} with ${this.history.length} transcript entries`);
                        return;
                    }
                }
            } catch (e) {
                Logger.error('Error loading session:', e);
            }
            
            // Create new session if none exists or expired
            this.createNewSession();
        }
        
        // Create a new session with unique ID
        createNewSession() {
            this.history = [];
            this.sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
            this.lastActivity = Date.now();
            this.saveSession();
            Logger.info(`Created new session: ${this.sessionId}`);
        }
        
        // Save current session to storage
        saveSession() {
            const sessionData = {
                history: this.history,
                sessionId: this.sessionId,
                lastActivity: this.lastActivity
            };
            
            try {
                sessionStorage.setItem('chimeTranscriptSession', JSON.stringify(sessionData));
            } catch (e) {
                Logger.error('Error saving session:', e);
            }
        }
        
        // Update the last activity timestamp
        updateActivity() {
            this.lastActivity = Date.now();
            this.saveSession();
        }
        
        // Add a new entry to history if not already present
        addEntry(entry) {
            if (!this.history.includes(entry)) {
                this.history.push(entry);
                this.updateActivity();
                return true;
            }
            return false;
        }
        
        // Process and capture a transcript line
        captureTranscript(speakerRaw, text) {
            this.updateActivity();
            
            const speaker = Utils.formatSpeakerName(speakerRaw);
            const time = Utils.getCurrentTime();
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
                Logger.debug('Added new line for different speaker:', formattedLine);
                return;
            }
            
            // Get just the text portion of the last entry
            const lastEntryText = lastEntry.substring(lastEntry.indexOf(']: ') + 3).trim();
            const currentText = text.trim();
            
            // Skip exact duplicates
            if (lastEntryText === currentText) {
                return;
            }
            
            // Check if texts are similar using fuzzy matching
            if (Utils.fuzzyMatch(lastEntryText, currentText)) {
                // Update the existing entry - it's likely a correction or extension
                const lastIndex = this.history.lastIndexOf(lastEntry);
                this.history[lastIndex] = formattedLine;
                this.updateActivity();
                Logger.debug('Updated existing line:', { old: lastEntry, new: formattedLine });
            } else {
                // It's a new sentence
                this.addEntry(formattedLine);
                Logger.debug('Added new line for new sentence:', formattedLine);
            }
        }
        
        // Get current transcript as string
        getTranscript() {
            return this.history.join('\n');
        }
        
        // Clear transcript and start a new session
        clear() {
            this.createNewSession();
        }
    }
    
    // Main application class
    class ChimeTranscriptApp {
        constructor() {
            this.transcriptCapture = new SessionAwareTranscriptCapture();
            this.isActive = false;
            this.captionObserver = null;
            this.meetingDetails = null;
            this.setupComplete = false;
            
            // Initialize as soon as possible (even before meeting details are available)
            this.init();
        }
        
        // Initialize the application
        init() {
            Logger.info('Initializing Chime Transcript Copier (Session Support v3.0)');
            
            // Start observing for captions immediately
            this.startCaptionsObserver();
            
            // Add button when DOM is ready
            this.waitForCaptionsContainer()
                .then(() => {
                    this.addCopyButton();
                    this.setupComplete = true;
                    Logger.info('Setup completed');
                })
                .catch(err => {
                    Logger.error('Failed to initialize:', err);
                });
            
            // Try to get meeting details (but don't block if not available)
            this.tryGetMeetingDetails();
        }
        
        // Try to get meeting details (non-blocking)
        tryGetMeetingDetails() {
            try {
                // Common places where meeting details might be found
                const meetingNameElement = document.querySelector('.meeting-name');
                if (meetingNameElement) {
                    this.meetingDetails = {
                        name: meetingNameElement.textContent.trim()
                    };
                    Logger.info('Found meeting details:', this.meetingDetails);
                } else {
                    // If not found, retry after a delay
                    setTimeout(() => this.tryGetMeetingDetails(), 5000);
                }
            } catch (e) {
                Logger.error('Error getting meeting details:', e);
            }
        }
        
        // Wait for the captions container to be available in DOM
        waitForCaptionsContainer() {
            return new Promise((resolve, reject) => {
                const maxAttempts = 30;
                let attempts = 0;
                
                const checkContainer = () => {
                    const container = document.querySelector('.captions-container');
                    
                    if (container) {
                        resolve(container);
                    } else if (attempts < maxAttempts) {
                        attempts++;
                        setTimeout(checkContainer, 1000);
                    } else {
                        reject(new Error('Captions container not found after maximum attempts'));
                    }
                };
                
                checkContainer();
            });
        }
        
        // Start observing caption changes
        startCaptionsObserver() {
            // Set up a mutation observer to watch for caption updates
            this.captionObserver = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        // Process new caption nodes
                        this.processCaptionNodes(mutation.addedNodes);
                    }
                });
            });
            
            // Start observing immediately even if container isn't ready yet
            this.observeExistingCaptions();
            
            // Set up periodic checks for new captions that might have been missed
            setInterval(() => this.observeExistingCaptions(), CONFIG.updateInterval);
        }
        
        // Observer existing captions in the DOM
        observeExistingCaptions() {
            try {
                // Find caption container
                const captionsContainer = document.querySelector('.captions-container');
                if (captionsContainer) {
                    // Observe changes to the captions container
                    this.captionObserver.observe(captionsContainer, { 
                        childList: true, 
                        subtree: true 
                    });
                    
                    // Process any existing captions
                    const captionLines = document.querySelectorAll('.captions-container .caption-line');
                    if (captionLines && captionLines.length > 0) {
                        captionLines.forEach(line => {
                            this.processCaption(line);
                        });
                    }
                }
            } catch (e) {
                Logger.error('Error observing captions:', e);
            }
        }
        
        // Process a set of caption nodes
        processCaptionNodes(nodes) {
            nodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    // Check if this is a caption line
                    if (node.classList && node.classList.contains('caption-line')) {
                        this.processCaption(node);
                    }
                    
                    // Also check children for caption lines
                    const captionLines = node.querySelectorAll('.caption-line');
                    if (captionLines && captionLines.length > 0) {
                        captionLines.forEach(line => {
                            this.processCaption(line);
                        });
                    }
                }
            });
        }
        
        // Process an individual caption line
        processCaption(captionLine) {
            try {
                const speakerElement = captionLine.querySelector('.caption-sender');
                const textElement = captionLine.querySelector('.caption-text');
                
                if (speakerElement && textElement) {
                    const speaker = speakerElement.textContent.trim();
                    const text = textElement.textContent.trim();
                    
                    if (speaker && text) {
                        this.transcriptCapture.captureTranscript(speaker, text);
                    }
                }
            } catch (e) {
                Logger.error('Error processing caption:', e);
            }
        }
        
        // Add copy button to UI
        addCopyButton() {
            try {
                // Look for the captions header or controls area
                const headerArea = document.querySelector('.captions-header') || 
                                  document.querySelector('.captions-container') ||
                                  document.querySelector('.captions-controls');
                
                if (!headerArea) {
                    Logger.error('Could not find header area to add button');
                    return;
                }
                
                // Create button
                const copyButton = document.createElement('button');
                copyButton.textContent = CONFIG.buttonText;
                copyButton.className = 'transcript-copy-button';
                copyButton.style.cssText = 'background-color: #2F7DE3; color: white; border: none; padding: 5px 10px; border-radius: 4px; margin: 5px; cursor: pointer;';
                
                // Add hover effect
                copyButton.addEventListener('mouseover', () => {
                    copyButton.style.backgroundColor = '#1C64C8';
                });
                copyButton.addEventListener('mouseout', () => {
                    copyButton.style.backgroundColor = '#2F7DE3';
                });
                
                // Add click handler
                copyButton.addEventListener('click', () => this.copyTranscript());
                
                // Add to DOM
                headerArea.appendChild(copyButton);
                
                // Add session info indicator
                const sessionInfo = document.createElement('div');
                sessionInfo.className = 'transcript-session-info';
                sessionInfo.style.cssText = 'font-size: 9px; color: #666; margin-top: 2px; text-align: center;';
                sessionInfo.textContent = `Session: ${this.transcriptCapture.sessionId.substring(0, 10)}...`;
                headerArea.appendChild(sessionInfo);
                
                Logger.info('Copy button added to UI');
            } catch (e) {
                Logger.error('Error adding copy button:', e);
            }
        }
        
        // Copy transcript to clipboard
        copyTranscript() {
            try {
                const transcript = this.transcriptCapture.getTranscript();
                
                // Add meeting details if available
                let fullTranscript = '';
                
                if (this.meetingDetails && this.meetingDetails.name) {
                    fullTranscript += `Meeting: ${this.meetingDetails.name}\n`;
                    fullTranscript += `Date: ${new Date().toLocaleDateString()}\n\n`;
                }
                
                fullTranscript += transcript;
                
                // Use TamperMonkey GM_setClipboard for clipboard access
                GM_setClipboard(fullTranscript);
                
                // Show success message
                this.showNotification('Transcript copied to clipboard!');
                
                Logger.info('Transcript copied to clipboard', { lines: this.transcriptCapture.history.length });
            } catch (e) {
                Logger.error('Error copying transcript:', e);
                this.showNotification('Error copying transcript', true);
            }
        }
        
        // Show notification
        showNotification(message, isError = false) {
            try {
                // Create notification element
                const notification = document.createElement('div');
                notification.className = 'transcript-notification';
                notification.textContent = message;
                notification.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    padding: 10px 15px;
                    background-color: ${isError ? '#f44336' : '#4CAF50'};
                    color: white;
                    border-radius: 4px;
                    z-index: 9999;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                    opacity: 0;
                    transition: opacity 0.3s ease-in-out;
                `;
                
                // Add to DOM
                document.body.appendChild(notification);
                
                // Fade in
                setTimeout(() => { notification.style.opacity = '1'; }, 100);
                
                // Remove after delay
                setTimeout(() => {
                    notification.style.opacity = '0';
                    setTimeout(() => { 
                        if (notification.parentNode) {
                            notification.parentNode.removeChild(notification);
                        }
                    }, 300);
                }, 3000);
            } catch (e) {
                Logger.error('Error showing notification:', e);
            }
        }
    }
    
    // Initialize the application when the page is ready
    window.addEventListener('load', () => {
        // Start the application immediately to catch early captions
        const app = new ChimeTranscriptApp();
    });
    
    // Also initialize immediately to ensure we don't miss anything
    new ChimeTranscriptApp();
    
})();