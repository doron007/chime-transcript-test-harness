// ==UserScript==
// @name         Chime Meeting Full Transcript Copier
// @namespace    @amzn/Chime-Meeting-Full-Transcript-Copier
// @version      3.0.0
// @license      UNLICENSED
// @namespace    http://tampermonkey.net/
// @description  Copies the full transcript of the meeting you have (copy during and after you close the call)
// @author       Doron Hetz (inspired by Christian Back Jonsson original script)
// @downloadURL  https://drive.corp.amazon.com/view/cjonsson@/Tampermonkey/ChimeMeetingFullTranscriptCopier.user.js
// @supportURL   https://w.amazon.com/bin/view/Users/cjonsson/ChimeMeetingFullTranscriptCopier/
// @match        https://app.chime.aws/meetings/*
// @grant        none
// @description  A comprehensive tool for capturing Amazon Chime meeting transcripts in real-time.
//
// @description:usage  HOW TO USE:
// @description:usage  1. Enable Closed Captions (CC) in your Chime meeting
// @description:usage  2. Script will automatically capture all CC text and chat messages
// @description:usage  3. Use 'Copy' button to copy to clipboard or 'Save' to download as file
//
// @description:features  FEATURES:
// @description:features  - Real-time CC capture with speaker attribution
// @description:features  - Chat message capture
// @description:features  - Attendee tracking
// @description:features  - Session resumption after browser refresh
// @description:features  - Automatic periodic saving
//
// @description:limitations  LIMITATIONS:
// @description:limitations  - Requires CC to be enabled
// @description:limitations  - Cannot capture messages from before script activation
// @description:limitations  - Browser-dependent functionality
// @description:limitations  - Limited formatting support for chat messages
//
// @description:planned  PLANNED FEATURES:
// @description:planned  - Transcript preview window
// @description:planned  - Multiple export formats
// @description:planned  - Meeting analytics
// @description:planned  - Search functionality
//
// @description:changes  CHANGELOG:
// @description:changes  v3.0 - Switched from observer to timer-based capture for improved reliability
// @description:changes       - Separated transcripts, chat messages, and comments into separate storage
// @description:changes       - Improved content merging for display and export
// @description:changes  v2.8 - Bug fix for meeting ID
// @description:changes  v2.7 - Added keyboard shortcuts for comment injection (cmd+enter, esc)
// @description:changes       - Added content preview button with read-only view
// @description:changes  v2.6 - Fixed chat message capture for all formats and added fuzzy matching for CC corrections
// @description:changes       - Fixed chat message duplication issue
// @description:changes       - Added comment injection feature with input box
// @description:changes  v2.5 - Fixed sentence truncation issues
// @description:changes  v2.3 - Improved session resumption
// @description:changes  v2.2 - Added attendee tracking
// @description:changes  v2.1 - Added chat message capture
// @description:changes  v2.0 - Complete rewrite with IndexedDB storage
//
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        DEBUG: false,
        DB: {
            NAME: 'ChimeTranscriptDB',
            VERSION: 4, // Increment version for schema update
            STORE: 'sessions',
            CONTENT_TYPES: {
                TRANSCRIPT: 'transcript',
                CHAT: 'chat',
                COMMENTS: 'comments',
                COMBINED: 'combined'
            }
        },
        SELECTORS: {
            TRANSCRIPT: '._1bqBOFA5PPIrx5PUq9uxyl',
            CHAT_CONTAINER: '._2B9DdDvc2PdUbvEGXfOU20',
            MEETING_TITLE: '[data-testid="heading"]',
            MEETING_ID_REGION: '[data-test-id="meetingIdRegion"], [data-testid="meeting-id"]',
            MEETING_ORGANIZER: '[data-test-id="meetingOrganizerName"], [data-testid="meeting-organizer"]',
            SPEAKER: 'p._3512TwqLzPaGGAWp_8W1se',
            TEXT: 'p._1XM7bRv8y86tbk7HmDvoj7',
            CHAT_BUBBLE: '.chatBubbleContainer',
            CHAT_MESSAGE: '.chatMessage',
            CHAT_SENDER: '[data-testid="chat-bubble-sender-name"]',
            CHAT_TIMESTAMP: '.BSI7kBrZFl9kIe5WtRekW',
            CHAT_CONTENT: '.Linkify, .markdown p',
            ATTENDEES: {
                PRESENT_SECTION: 'button[aria-label*="Present"]',
                LEFT_SECTION: 'button[aria-label*="Left"]',
                SECTION_CONTAINER: '._1IEUbelvxVpEblfF0Mula8',
                NAME_ELEMENT: '.ppi5x8cvVEQgbl_hLeiRW'
            }
        },
        INTERVALS: {
            DB_SAVE: 10000,
            CAPTURE_TRANSCRIPT: 1000,  // Timer for CC capture (similar to v2.1)
            CAPTURE_CHAT: 2000,        // Timer for chat capture
            TITLE_INIT: 2000,
            STATE_LOG: 5000,
            ATTENDEES_UPDATE: 30000    // Update attendees every 30 seconds
        },
        STRINGS: {
            TITLE_PREFIX: 'Meeting Title: ',
            MEETING_DATE_PREFIX: 'Meeting Date: ',
            SYSTEM_MESSAGE: 'Amazon Chime: Machine generated captions are generated by Amazon Transcribe.',
            SUBJECT_DEFAULT: 'Subject',
            CHAT_HEADER_CLASS: '_28K_fURZjQdxAmV_LRDwpp',
            ID_PATTERN: /(?:Meeting ID:|ID:)\s*([0-9\s]+)/,
            ORGANIZER_PATTERN: /(?:Organizer:|Organized by:)\s*(.*)/,
            ATTENDEES_PREFIX: 'Attendees: ',
            ATTENDEES_SEPARATOR: ', '
        },
        MEETING: {
            RESUME_WINDOW: 600000,
            CHECK_DELAY: 2000,
            MAX_RETRIES: 10,
            RETRY_DELAY: 2000
        },
        MESSAGES: {
            SYSTEM_CAPTION: 'Machine generated captions',
            SYSTEM_SENDER: 'Amazon Chime',
            NO_CONTENT: 'Nothing to copy. Please turn on CC Transcript.',
            COPY_SUCCESS: 'Full Transcript copied to clipboard!',
            SAVE_SUCCESS: 'Transcript saved to file!'
        },
        FILE: {
            TYPE: 'text/plain',
            SUFFIX: 'MoM'
        },
        TIMINGS: {
            STATE_LOG_INTERVAL: 5000,
            SNACKBAR_DURATION: 3000
        },
        REGEX: {
            CHAT_TIMESTAMP: /\[\d{1,2}:\d{2}:\d{2}\s[AP]M\]/,  // Updated to include seconds
            LINKIFY_CLASS: '.Linkify'
        },
        UI: {
            COPY_BUTTON: {
                TEXT: 'Copy',
                COLOR: '#4CAF50',
                STYLES: {
                    position: 'fixed',
                    bottom: '10px',
                    right: '10px',
                    width: '70px',
                    height: '38px',
                    padding: '0'
                }
            },
            SAVE_BUTTON: {
                TEXT: 'Save',
                COLOR: '#007BFF',
                STYLES: {
                    position: 'fixed',
                    bottom: '10px',
                    right: '80px',
                    width: '70px',
                    height: '38px',
                    padding: '0'
                }
            },
            COMMENT_BUTTON: {
                TEXT: '+',
                COLOR: '#FFA500',
                STYLES: {
                    position: 'fixed',
                    bottom: '10px',
                    right: '150px',
                    width: '40px',
                    height: '38px',
                    padding: '0',
                    fontSize: '24px'
                }
            },
            VIEW_BUTTON: {
                TEXT: '^',
                COLOR: '#808080',
                STYLES: {
                    position: 'fixed',
                    bottom: '10px',
                    right: '190px',
                    width: '40px',
                    height: '38px',
                    padding: '0',
                    fontSize: '24px'
                }
            },
            COMMENT_CONTAINER: {
                STYLES: {
                    position: 'fixed',
                    right: '50px',
                    bottom: '210px',
                    backgroundColor: '#333',
                    padding: '10px',
                    borderRadius: '4px',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                    zIndex: '10000',
                    gap: '8px',
                    alignItems: 'flex-end',
                    width: 'auto',  // Allow container to adjust to content
                    maxWidth: '800px'  // 1.5x the original width
                }
            },
            COMMENT_INPUT: {
                STYLES: {
                    width: '600px',  // 1.5x the original width
                    height: '120px',
                    backgroundColor: '#333',
                    color: '#fff',
                    border: '1px solid #666',
                    resize: 'none',
                    padding: '10px',
                    borderRadius: '4px',
                    fontSize: '14px',
                    fontFamily: 'monospace',  // Better for viewing formatted content
                    whiteSpace: 'pre',        // Preserve line breaks
                    overflowX: 'auto',        // Enable horizontal scroll
                    overflowY: 'auto'         // Enable vertical scroll
                }
            },
            SUBMIT_BUTTON: {
                TEXT: '>',
                COLOR: '#4CAF50',
                STYLES: {
                    position: 'absolute',
                    right: '15px',        // Match original
                    bottom: '15px',       // Match original
                    width: '20px',
                    height: '20px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    fontSize: '16px'      // Match original
                }
            },
            CLOSE_BUTTON: {
                TEXT: '×',
                STYLES: {
                    position: 'absolute',
                    right: '15px',
                    top: '15px',
                    width: '20px',
                    height: '20px',
                    backgroundColor: 'transparent',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '16px',
                    lineHeight: '16px',
                    padding: '0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: '10000'
                }
            },
            COMMON: {
                BUTTON: {
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    zIndex: '9999',
                    padding: '10px 20px',  // Add this to match original
                    fontSize: '16px'       // Add this to match original
                }
            }
        },
        CACHE: {
            KEY_PREFIX: 'chime_transcript_', // Will be used as prefix for different content types
            UPDATE_INTERVAL: 60000, // 1 minute
            MAX_AGE: 24 * 60 * 60 * 1000 // 24 hours
        },
        SESSION: {
            RESUME_THRESHOLD: 5 * 60 * 1000, // 5 minutes in milliseconds
        },
        STYLES: {
            SNACKBAR: {
                position: 'fixed',
                bottom: '30px',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#333',
                color: '#fff',
                padding: '12px 20px',
                borderRadius: '5px',
                fontSize: '14px',
                textAlign: 'center',
                zIndex: '10000',
                visibility: 'hidden',
                opacity: '0',
                transition: 'visibility 0s, opacity 0.5s ease-in-out'
            }
        },
    };

    let transcriptManager, uiManager, dbManager, cacheManager;

    const Utils = {
        sanitizeFilename: (text) => {
            return text
                .replace(/[<>:"\/\\|?*,]/g, '-')
                .replace(/\s+/g, ' ')
                .replace(/\s*\|\s*/g, '-')
                .replace(/--+/g, '-')
                .replace(/^-|-$/g, '')
                .trim()
                .substring(0, 200);
        },

        formatSpeakerName: (speaker) => {
            const parts = speaker.split(', ');
            return parts.length === 2 ? `${parts[1]} ${parts[0]}` : speaker;
        },

        createElement: (type, props = {}) => {
            const element = document.createElement(type);
            Object.entries(props).forEach(([key, value]) => {
                if (key === 'style') {
                    Object.assign(element.style, value);
                } else {
                    element[key] = value;
                }
            });
            return element;
        },

        getPSTDateTime: () => {
            const now = new Date();
            const pstDate = now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }).substring(5);
            const pstTime = now.toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour12: true }).split(':');
            const formattedTime = `${pstTime[0]}-${pstTime[1]} ${pstTime[2].split(' ')[1]}`;
            return { date: pstDate, time: formattedTime };
        },

        fuzzyMatch: (str1, str2) => {
            // Normalize strings - remove punctuation and standardize spacing
            const normalize = (str) => str.toLowerCase()
                .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
                .replace(/\s+/g, " ")
                .trim();

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
                const comparisonLength = Math.max(minLength - 5, 10);

                const str1Core = norm1.substring(0, comparisonLength);
                const str2Core = norm2.substring(0, comparisonLength);

                // If the core texts match or contain each other
                if (str1Core === str2Core ||
                    norm1.includes(str2Core) ||
                    norm2.includes(str1Core)) {
                    return true;
                }
            }

            return false;
        },

        // Add a helper to combine content from different arrays chronologically
        combineContentChronologically: (contentArrays) => {
            // Flatten all arrays into a single array of {timestamp, content} objects
            const allEntries = [];

            contentArrays.forEach((array, sourceIndex) => {
                array.forEach(entry => {
                    if (!entry || !entry.trim()) return;

                    // Extract timestamp if available
                    const timestampMatch = entry.match(/\[(\d{1,2}:\d{2}\s[AP]M)\]/);
                    let timestamp = null;

                    if (timestampMatch) {
                        const timeStr = timestampMatch[1];
                        const today = new Date();
                        const [hours, minutes, period] = timeStr.split(/[:|\s]/);

                        let hour = parseInt(hours);
                        if (period === 'PM' && hour < 12) hour += 12;
                        if (period === 'AM' && hour === 12) hour = 0;

                        today.setHours(hour, parseInt(minutes), 0, 0);
                        timestamp = today.getTime();
                    } else {
                        // If no timestamp, use current time (this should rarely happen)
                        timestamp = Date.now();
                    }

                    allEntries.push({
                        timestamp,
                        content: entry,
                        sourceIndex
                    });
                });
            });

            // Sort by timestamp
            allEntries.sort((a, b) => a.timestamp - b.timestamp);

            // Return the sorted content
            return allEntries.map(entry => entry.content);
        },

        // Helper method to get the current time formatted consistently
        getCurrentFormattedTime: () => {
            return new Date().toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',  // Add seconds
                hour12: true
            });
        }
    };

    const Logger = {
        debug: (message, ...args) => {
            if (CONFIG.DEBUG) console.log(`[DEBUG] ${message}`, ...args);
        },

        info: (message, ...args) => {
            if (CONFIG.DEBUG || typeof message === 'string' &&
                (message.includes('error') ||
                    message.includes('fail') ||
                    message.includes('success'))) {
                console.log(`[INFO] ${message}`, ...args);
            }
        },

        warn: (message, ...args) => {
            console.warn(`[WARN] ${message}`, ...args);
        },

        error: (message, ...args) => {
            console.error(`[ERROR] ${message}`, ...args);
        },

        // Add a method to log timing information for performance analysis
        timing: (label, startTime) => {
            if (CONFIG.DEBUG) {
                const elapsed = Date.now() - startTime;
                console.log(`[TIMING] ${label}: ${elapsed}ms`);
            }
        },

        // Method to log state of transcript manager
        state: (transcriptManager) => {
            if (!CONFIG.DEBUG) return;

            console.log('[STATE] TranscriptManager:', {
                hasCCCapture: transcriptManager.transcriptHistory.length > 0,
                ccCount: transcriptManager.transcriptHistory.length,
                chatCount: transcriptManager.chatHistory.length,
                commentsCount: transcriptManager.commentsHistory.length,
                meetingId: transcriptManager.meetingId,
                meetingTitle: transcriptManager.meetingTitle
            });
        }
    };

    class CacheManager {
        constructor() {
            this.lastUpdate = {
                [CONFIG.DB.CONTENT_TYPES.TRANSCRIPT]: 0,
                [CONFIG.DB.CONTENT_TYPES.CHAT]: 0,
                [CONFIG.DB.CONTENT_TYPES.COMMENTS]: 0,
                [CONFIG.DB.CONTENT_TYPES.COMBINED]: 0
            };
        }

        saveToCache(content, contentType) {
            const now = Date.now();
            if (now - this.lastUpdate[contentType] >= CONFIG.CACHE.UPDATE_INTERVAL) {
                try {
                    const cacheData = {
                        content,
                        timestamp: now
                    };
                    const cacheKey = `${CONFIG.CACHE.KEY_PREFIX}${contentType}`;
                    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
                    this.lastUpdate[contentType] = now;
                    Logger.debug(`Saved ${contentType} to cache`);
                } catch (error) {
                    Logger.error(`Cache save failed for ${contentType}:`, error);
                }
            }
        }

        loadFromCache(contentType) {
            try {
                const cacheKey = `${CONFIG.CACHE.KEY_PREFIX}${contentType}`;
                const cached = localStorage.getItem(cacheKey);
                if (!cached) return null;

                const data = JSON.parse(cached);
                const age = Date.now() - data.timestamp;

                if (age > CONFIG.CACHE.MAX_AGE) {
                    localStorage.removeItem(cacheKey);
                    return null;
                }

                return data.content;
            } catch (error) {
                Logger.error(`Cache load failed for ${contentType}:`, error);
                return null;
            }
        }

        clearCache(contentType = null) {
            if (contentType) {
                // Clear specific content type
                localStorage.removeItem(`${CONFIG.CACHE.KEY_PREFIX}${contentType}`);
            } else {
                // Clear all content types
                Object.values(CONFIG.DB.CONTENT_TYPES).forEach(type => {
                    localStorage.removeItem(`${CONFIG.CACHE.KEY_PREFIX}${type}`);
                });
            }
        }
    }

    class TranscriptManager {
        constructor() {
            // Separate arrays for different content types
            this.transcriptHistory = [];
            this.chatHistory = [];
            this.commentsHistory = [];

            // Sets to track processed messages
            this.processedTranscriptMessages = new Set();
            this.processedChatMessages = new Set();
            this.processedChatMessageContents = new Set();
            this.recentChatContent = new Set();

            // Tracking variables
            this.lastSender = null;
            this.lastTimestamp = null;
            this.meetingId = null;
            this.meetingTitle = CONFIG.STRINGS.SUBJECT_DEFAULT;
            this.meetingOrganizer = null;
            this.isResumed = false;
            this.isResuming = false;
            this.hasTitleBeenAdded = false;
            this.systemMessageAdded = false;
            this.sessionId = null;
            this.meetingDetailsLoaded = false;
            this.detailsRetryCount = 0;
            this.captureStarted = false;
            this.lastAttendeesUpdate = '';
            this.currentAttendees = '';
            this.attendeesUpdateInterval = null;

            // Timers for periodic capture
            this.transcriptCaptureTimer = null;
            this.chatCaptureTimer = null;

            if (CONFIG.DEBUG) {
                setInterval(() => this.logState('periodic'), CONFIG.INTERVALS.STATE_LOG);
            }
        }

        initialize(uiManager) {
            this.uiManager = uiManager;
            cacheManager.clearCache();
            window.addEventListener('beforeunload', () => {
                try {
                    // Final save attempts
                    if (this.hasContent()) {
                        // Save each content type to cache
                        Object.values(CONFIG.DB.CONTENT_TYPES).forEach(contentType => {
                            const content = this.getContentByType(contentType);
                            if (content) {
                                cacheManager.saveToCache(content, contentType);
                            }
                        });

                        // Final DB save
                        dbManager.saveSession().catch(err =>
                            Logger.error('Final save failed:', err));
                    }

                    // Cleanup
                    this.stopCapturing();
                } catch (error) {
                    Logger.error('Cleanup error:', error);
                }
            });
            this.checkCCEnabled();
            this.setupHealthCheck();
            this.setupMemoryManagement();
            this.enableErrorRecoveryMode();
            this.startAttendeesTracking();
        }

        resetChatTracking() {
            // Keep only the most recent chat messages in our tracking
            // This should be called periodically (e.g., every few minutes)
            if (this.processedChatMessageContents && this.processedChatMessageContents.size > 100) {
                this.processedChatMessageContents = new Set(
                    Array.from(this.processedChatMessageContents).slice(-50)
                );
            }
        }

        hasContent() {
            return this.transcriptHistory.length > 0 ||
                this.chatHistory.length > 0 ||
                this.commentsHistory.length > 0;
        }

        getContentByType(contentType) {
            switch (contentType) {
                case CONFIG.DB.CONTENT_TYPES.TRANSCRIPT:
                    return this.getTranscriptContent();
                case CONFIG.DB.CONTENT_TYPES.CHAT:
                    return this.getChatContent();
                case CONFIG.DB.CONTENT_TYPES.COMMENTS:
                    return this.getCommentsContent();
                case CONFIG.DB.CONTENT_TYPES.COMBINED:
                    return this.getCombinedContent();
                default:
                    return null;
            }
        }

        async attemptContentRecovery() {
            // First try IndexedDB
            if (dbManager.ready) {
                try {
                    const session = await dbManager.getLastSession();
                    if (session) {
                        // Check each content type
                        const recoveredContent = {};
                        let hasContent = false;

                        Object.values(CONFIG.DB.CONTENT_TYPES).forEach(contentType => {
                            if (session[contentType]) {
                                recoveredContent[contentType] = session[contentType];
                                hasContent = true;
                            }
                        });

                        if (hasContent) {
                            Logger.info('Recovered content from IndexedDB');
                            return recoveredContent;
                        }
                    }
                } catch (error) {
                    Logger.error('IndexedDB recovery failed:', error);
                }
            }

            // If IndexedDB fails or no content, try cache
            try {
                const recoveredContent = {};
                let hasContent = false;

                Object.values(CONFIG.DB.CONTENT_TYPES).forEach(contentType => {
                    const content = cacheManager.loadFromCache(contentType);
                    if (content) {
                        recoveredContent[contentType] = content;
                        hasContent = true;
                    }
                });

                if (hasContent) {
                    Logger.info('Recovered content from cache');
                    return recoveredContent;
                }
            } catch (error) {
                Logger.error('Cache recovery failed:', error);
            }

            return null;
        }

        initializeMeetingTitle() {
            const titleElement = document.querySelector(CONFIG.SELECTORS.MEETING_TITLE);
            this.meetingTitle = titleElement ? titleElement.textContent.trim() : CONFIG.STRINGS.SUBJECT_DEFAULT;
            return this.meetingTitle;
        }

        addTranscriptEntry(entry) {
            if (!this.transcriptHistory.includes(entry)) {
                this.transcriptHistory.push(entry);
                Logger.debug('Added new transcript entry:', entry);
                return true;
            }
            return false;
        }

        addChatEntry(entry) {
            if (!this.chatHistory.includes(entry)) {
                this.chatHistory.push(entry);
                Logger.debug('Added new chat entry:', entry);
                return true;
            }
            return false;
        }

        addCommentEntry(entry) {
            if (!this.commentsHistory.includes(entry)) {
                this.commentsHistory.push(entry);
                Logger.debug('Added new comment entry:', entry);
                return true;
            }
            return false;
        }

        getMeetingDetails() {
            // This method remains largely unchanged from 2.8.5 version
            if (this.meetingDetailsLoaded && this.meetingId && this.meetingOrganizer) {
                return true;
            }

            if (this.detailsRetryCount === 0) {
                Logger.info('Attempting to get meeting details...');
            }
            this.detailsRetryCount++;

            try {
                let missingDetails = [];
                let detailsStatus = {
                    meetingId: false,
                    meetingTitle: false,
                    organizer: false
                };

                // Get meeting ID
                const waitForMeetingStart = (retryCount = 0) => {
                    const modal = document.querySelector('[data-testid="modal-body"]'); // Detect if join modal is open
                    const idElement = document.querySelector(CONFIG.SELECTORS.MEETING_ID_REGION);

                    if (modal) {
                        Logger.info("Waiting for user to join meeting... Attempt:", retryCount + 1);
                        if (retryCount < 15) { // Retry for up to 15 seconds
                            setTimeout(() => waitForMeetingStart(retryCount + 1), 1000);
                        } else {
                            Logger.error("Timeout: Meeting was not joined within expected time.");
                        }
                        return;
                    }

                    // Get meeting ID only after modal is gone
                    if (!this.meetingId && idElement) {
                        const idMatch = idElement.textContent.match(CONFIG.STRINGS.ID_PATTERN);
                        if (idMatch) {
                            this.meetingId = idMatch[1].replace(/\s/g, '');
                            detailsStatus.meetingId = true;
                            Logger.info('Found meeting ID:', this.meetingId);
                        } else {
                            Logger.error('Meeting ID format mismatch. Text content:', idElement.textContent);
                            missingDetails.push('Meeting ID format invalid');
                        }
                    } else if (!this.meetingId) {
                        Logger.error('Meeting ID element not found. Retrying...');
                        if (retryCount < 15) {
                            setTimeout(() => waitForMeetingStart(retryCount + 1), 1000);
                        } else {
                            Logger.error("Timeout: Meeting ID was not found.");
                        }
                    } else {
                        detailsStatus.meetingId = true;
                    }
                };

                // Start waiting for meeting to begin
                waitForMeetingStart();

                // Get meeting title
                if (!this.meetingTitle || this.meetingTitle === CONFIG.STRINGS.SUBJECT_DEFAULT) {
                    const titleElement = document.querySelector(CONFIG.SELECTORS.MEETING_TITLE);
                    if (titleElement) {
                        this.meetingTitle = titleElement.textContent.trim();
                        detailsStatus.meetingTitle = true;
                        Logger.info('Found meeting title:', this.meetingTitle);
                    } else {
                        Logger.error('Meeting title element not found. Selector:', CONFIG.SELECTORS.MEETING_TITLE);
                        missingDetails.push('Meeting title element not found');
                        // Recovery: Use default title
                        this.meetingTitle = 'Meeting';
                        Logger.info('Using default meeting title');
                        detailsStatus.meetingTitle = true;
                    }
                } else {
                    detailsStatus.meetingTitle = true;
                }

                // Get organizer
                if (!this.meetingOrganizer) {
                    const organizerElement = document.querySelector(CONFIG.SELECTORS.MEETING_ORGANIZER);
                    if (organizerElement) {
                        const organizerMatch = organizerElement.textContent.match(CONFIG.STRINGS.ORGANIZER_PATTERN);
                        if (organizerMatch) {
                            this.meetingOrganizer = organizerMatch[1].trim();
                            detailsStatus.organizer = true;
                            Logger.info('Found meeting organizer:', this.meetingOrganizer);
                        } else {
                            Logger.error('Organizer format mismatch. Text content:', organizerElement.textContent);
                            missingDetails.push('Organizer format invalid');
                        }
                    } else {
                        Logger.error('Organizer element not found. Selector:', CONFIG.SELECTORS.MEETING_ORGANIZER);
                        missingDetails.push('Organizer element not found');
                        // Recovery: Use default organizer
                        this.meetingOrganizer = 'Organizer';
                        Logger.info('Using default organizer');
                        detailsStatus.organizer = true;
                    }
                } else {
                    detailsStatus.organizer = true;
                }

                // Log page structure for debugging if any details are missing
                if (missingDetails.length > 0) {
                    Logger.debug('Current page structure:', {
                        meetingIdArea: document.querySelector('[data-testid*="meeting"]')?.outerHTML,
                        titleArea: document.querySelector('[data-testid*="heading"]')?.outerHTML,
                        organizerArea: document.querySelector('[data-testid*="organizer"]')?.outerHTML
                    });
                }

                // Log detailed status on each attempt
                Logger.info('Meeting details status:', {
                    attempt: this.detailsRetryCount,
                    status: detailsStatus,
                    missing: missingDetails,
                    final: {
                        meetingId: this.meetingId,
                        meetingTitle: this.meetingTitle,
                        organizer: this.meetingOrganizer
                    }
                });

                // Always consider details loaded since we have fallbacks for everything
                this.meetingDetailsLoaded = true;

                if (this.detailsRetryCount > 1) {
                    Logger.info('Completed meeting details loading after', this.detailsRetryCount, 'attempts', {
                        meetingId: this.meetingId,
                        meetingTitle: this.meetingTitle,
                        organizer: this.meetingOrganizer,
                        usedFallbacks: missingDetails.length > 0
                    });
                }

                return true; // Always return true since we have fallbacks

            } catch (error) {
                Logger.error('Error getting meeting details:', {
                    error,
                    attempt: this.detailsRetryCount,
                    stack: error.stack
                });

                // Apply fallbacks even in case of error
                if (!this.meetingId) {
                    const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
                    this.meetingId = `session_${timestamp}`;
                }
                if (!this.meetingTitle) {
                    this.meetingTitle = 'Meeting';
                }
                if (!this.meetingOrganizer) {
                    this.meetingOrganizer = 'Organizer';
                }

                this.meetingDetailsLoaded = true;
                return true; // Return true since we have fallbacks
            }
        }

        async checkForResume() {
            if (!this.meetingDetailsLoaded) {
                const success = await this.waitForMeetingDetails();
                if (!success) {
                    Logger.info('Resume check failed: Could not get meeting details');
                    return false;
                }
            }

            if (!dbManager.ready) {
                Logger.info('Database not ready, waiting...');
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Check again after delay
                if (!dbManager.ready) {
                    Logger.error('Database still not ready, aborting resume check');
                    return false;
                }
            }

            Logger.info('Getting last session for meeting ID:', this.meetingId);

            try {
                const now = Date.now();

                const allSessions = await dbManager.getAllSessions();

                // First try exact meeting ID match
                const exactMatches = allSessions.filter(session =>
                    session.meetingId === this.meetingId
                );

                Logger.info(`Found ${exactMatches.length} sessions with exact meeting ID match`);

                // Sort by most recent first
                const sortedMatches = exactMatches
                    .sort((a, b) => (b.lastUpdated || b.timestamp) - (a.lastUpdated || a.timestamp));

                // Find first session with content
                const matchingSession = sortedMatches.find(session => {
                    // Check if session has any content in any category
                    return Object.values(CONFIG.DB.CONTENT_TYPES).some(type =>
                        session[type] && session[type].trim().length > 0);
                });

                if (matchingSession) {
                    const lastUpdateTime = matchingSession.lastUpdated || matchingSession.timestamp;
                    const timeDiff = now - lastUpdateTime;

                    Logger.info('Found matching session:', {
                        id: matchingSession.id,
                        meetingId: matchingSession.meetingId,
                        meetingTitle: matchingSession.meetingTitle,
                        lastUpdated: new Date(lastUpdateTime).toLocaleString(),
                        timeSinceUpdate: Math.floor(timeDiff / 1000 / 60) + ' minutes'
                    });

                    // Check session age - only resume if it's reasonably recent
                    // Using a longer threshold to ensure we capture more sessions
                    if (timeDiff <= 24 * 60 * 60 * 1000) { // 24 hours
                        this.isResuming = true;
                        const success = await this.resumeSession(matchingSession);
                        this.isResuming = false;
                        if (success) {
                            Logger.info('Successfully resumed session from IndexedDB');
                            return true;
                        }
                    }
                }
                else {
                    Logger.info("No valid session found to resume");
                }

                // Try cache recovery if DB resumption failed
                const recoveredContent = await this.attemptContentRecovery();
                if (recoveredContent) {
                    this.isResuming = true;
                    const success = await this.resumeSession({
                        id: this.getSessionId(),
                        ...recoveredContent,
                        timestamp: now,
                        lastUpdated: now
                    });
                    this.isResuming = false;
                    if (success) {
                        Logger.info('Successfully resumed session from cache');
                        return true;
                    }
                }

                return false;

            } catch (error) {
                Logger.error('Error during resume process:', error);
                this.isResuming = false;
                return false;
            }
        }

        async resumeSession(session) {
            if (!session) {
                Logger.info('Invalid session data for resume');
                return false;
            }

            this.isResuming = true; // Set flag before starting resume
            Logger.info('Starting session resume...', {
                id: session.id,
                meetingId: session.meetingId
            });

            try {
                // Reset state
                this.transcriptHistory = [];
                this.chatHistory = [];
                this.commentsHistory = [];
                this.processedTranscriptMessages.clear();
                this.processedChatMessages.clear();
                if (this.processedChatMessageContents) {
                    this.processedChatMessageContents = new Set();
                }
                this.hasTitleBeenAdded = false;
                this.systemMessageAdded = false;

                // Process transcript content
                if (session[CONFIG.DB.CONTENT_TYPES.TRANSCRIPT]) {
                    const transcriptLines = session[CONFIG.DB.CONTENT_TYPES.TRANSCRIPT].split('\n');
                    Logger.info(`Restoring ${transcriptLines.length} transcript lines`);

                    transcriptLines.forEach(line => {
                        if (!line.trim()) return;

                        if (line.startsWith(CONFIG.STRINGS.TITLE_PREFIX)) {
                            this.hasTitleBeenAdded = true;
                        } else if (line.includes(CONFIG.MESSAGES.SYSTEM_CAPTION)) {
                            this.systemMessageAdded = true;
                        }

                        this.transcriptHistory.push(line);

                        // Also track in processed to avoid duplicates
                        if (line.includes(']:')) {
                            const parts = line.split(']:', 2);
                            if (parts.length === 2) {
                                const speaker = parts[0].split('[')[0].trim();
                                const text = parts[1].trim();
                                this.processedTranscriptMessages.add(`${speaker}:${text}`);
                            }
                        }
                    });
                }

                // Process chat content
                if (session[CONFIG.DB.CONTENT_TYPES.CHAT]) {
                    const chatLines = session[CONFIG.DB.CONTENT_TYPES.CHAT].split('\n');
                    Logger.info(`Restoring ${chatLines.length} chat lines`);

                    chatLines.forEach(line => {
                        if (!line.trim()) return;

                        this.chatHistory.push(line);

                        // Track chat messages to avoid duplicates
                        if (line.match(CONFIG.REGEX.CHAT_TIMESTAMP)) {
                            this.processedChatMessages.add(line);

                            // Also track in content-based deduplication
                            if (this.processedChatMessageContents) {
                                const contentMatch = line.match(/.*:\s*(.*)/);
                                if (contentMatch && contentMatch[1]) {
                                    const content = contentMatch[1].trim();
                                    const sender = line.match(/.*- (.*?):/)?.[1] || '';
                                    this.processedChatMessageContents.add(`${sender}:${content}`);
                                }
                            }
                        }
                    });
                }

                // Process comments content
                if (session[CONFIG.DB.CONTENT_TYPES.COMMENTS]) {
                    const commentLines = session[CONFIG.DB.CONTENT_TYPES.COMMENTS].split('\n');
                    Logger.info(`Restoring ${commentLines.length} comment lines`);

                    commentLines.forEach(line => {
                        if (!line.trim()) return;
                        this.commentsHistory.push(line);
                    });
                }

                this.sessionId = session.id;
                this.isResumed = true;

                Logger.info('Resume completed successfully');
                return true;
            } catch (error) {
                Logger.error('Error during resume:', error);
                return false;
            } finally {
                this.isResuming = false; // Clear flag when done
            }
        }

        logState(type = 'periodic') {
            if (!CONFIG.DEBUG && type === 'periodic') return;

            const state = {
                transcriptHistoryLength: this.transcriptHistory.length,
                chatHistoryLength: this.chatHistory.length,
                commentsHistoryLength: this.commentsHistory.length,
                processedTranscriptMessages: this.processedTranscriptMessages.size,
                processedChatMessages: this.processedChatMessages.size,
                hasTitleBeenAdded: this.hasTitleBeenAdded,
                systemMessageAdded: this.systemMessageAdded,
                isResumed: this.isResumed,
                meetingId: this.meetingId,
                meetingTitle: this.meetingTitle
            };

            Logger.debug(`${type === 'periodic' ? 'Current' : 'Session'} State:`, state);
        }

        formatMeetingDate() {
            const today = new Date();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            return {
                titleFormat: `[${month}-${day}]`,
                dateFormat: `${month}/${day}`
            };
        }

        startCapturing() {
            if (this.captureStarted) return;

            // Ensure title is initialized 
            if (!this.hasTitleBeenAdded && this.transcriptHistory.length === 0) {
                const currentTitle = this.initializeMeetingTitle();
                const { titleFormat, dateFormat } = this.formatMeetingDate();
                this.addTranscriptEntry(`${CONFIG.STRINGS.TITLE_PREFIX}${titleFormat} - ${currentTitle}\n${CONFIG.STRINGS.MEETING_DATE_PREFIX}${dateFormat}`);
                this.hasTitleBeenAdded = true;
                Logger.info('Title added successfully');
            }

            // Start capturing transcripts using timer
            this.transcriptCaptureTimer = setInterval(() => {
                try {
                    if (!this.isResuming) {
                        this.captureLastRow();
                    }
                } catch (error) {
                    Logger.error('Error in transcript capture:', error);
                }
            }, CONFIG.INTERVALS.CAPTURE_TRANSCRIPT);

            // Start capturing chat messages using timer
            this.chatCaptureTimer = setInterval(() => {
                try {
                    if (!this.isResuming) {
                        this.captureNewChatMessages();
                    }
                } catch (error) {
                    Logger.error('Error in chat capture:', error);
                }
            }, CONFIG.INTERVALS.CAPTURE_CHAT);

            this.chatTrackingResetTimer = setInterval(() => {
                try {
                    this.resetChatTracking();
                } catch (error) {
                    Logger.error('Error in resetChatTracking:', error);
                }
            }, 5 * 60 * 1000); // Reset every 5 minutes

            this.captureStarted = true;
            Logger.info('Started capture timers');
        }

        stopCapturing() {
            if (this.transcriptCaptureTimer) {
                clearInterval(this.transcriptCaptureTimer);
                this.transcriptCaptureTimer = null;
            }

            if (this.chatCaptureTimer) {
                clearInterval(this.chatCaptureTimer);
                this.chatCaptureTimer = null;
            }

            if (this.chatTrackingResetTimer) {
                clearInterval(this.chatTrackingResetTimer);
                this.chatTrackingResetTimer = null;
            }

            Logger.info('Stopped capture timers');
        }

        resetChatTracking() {
            // Keep only the most recent chat messages in our tracking
            if (this.processedChatMessageContents && this.processedChatMessageContents.size > 100) {
                this.processedChatMessageContents = new Set(
                    Array.from(this.processedChatMessageContents).slice(-50)
                );
            }
        }

        captureLastRow() {
            const transcriptElement = document.querySelector(CONFIG.SELECTORS.TRANSCRIPT);
            if (!transcriptElement) {
                Logger.error('Transcript element not found, will retry');
                return;
            }

            if (!this.hasTitleBeenAdded && this.transcriptHistory.length === 0) {
                const currentTitle = this.initializeMeetingTitle();
                const { titleFormat, dateFormat } = this.formatMeetingDate();
                this.addTranscriptEntry(`${CONFIG.STRINGS.TITLE_PREFIX}${titleFormat} - ${currentTitle}\n${CONFIG.STRINGS.MEETING_DATE_PREFIX}${dateFormat}`);
                this.hasTitleBeenAdded = true;
            }
            this.updateAttendeesList();

            // Get all speaker and text elements
            const speakerElements = transcriptElement.querySelectorAll(CONFIG.SELECTORS.SPEAKER);
            const textElements = transcriptElement.querySelectorAll(CONFIG.SELECTORS.TEXT);

            if (speakerElements.length > 0 && textElements.length > 0) {
                // Make sure there's a match between the number of speakers and text elements
                const elementCount = Math.min(speakerElements.length, textElements.length);

                // Process each speaker-text pair
                for (let i = 0; i < elementCount; i++) {
                    let speaker = speakerElements[i].textContent;
                    const text = textElements[i].textContent;

                    // Skip empty text
                    if (!text || !text.trim()) continue;

                    // Handle system message
                    if (speaker === CONFIG.MESSAGES.SYSTEM_SENDER && text.includes(CONFIG.MESSAGES.SYSTEM_CAPTION)) {
                        if (!this.systemMessageAdded) {
                            this.systemMessageAdded = true;
                            this.addTranscriptEntry(CONFIG.STRINGS.SYSTEM_MESSAGE);
                        }
                        continue;
                    }

                    // Format speaker name
                    speaker = Utils.formatSpeakerName(speaker);

                    // Get current time INCLUDING SECONDS for better chronological ordering
                    const time = new Date().toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: true
                    });

                    const formattedLine = `${speaker} [${time}]: ${text}`.trim();

                    // Create a unique identifier for this message
                    const messageIdentifier = `${speaker}:${text}`;

                    // Check if we've already processed this exact message
                    if (this.processedTranscriptMessages.has(messageIdentifier)) {
                        continue;
                    }

                    // Track this message to avoid duplicates
                    this.processedTranscriptMessages.add(messageIdentifier);

                    // Find the most recent entries from the same speaker
                    const speakerEntries = [];
                    for (let j = this.transcriptHistory.length - 1; j >= 0 && speakerEntries.length < 5; j--) {
                        const entry = this.transcriptHistory[j];
                        if (entry.startsWith(speaker)) {
                            speakerEntries.push({
                                entry: entry,
                                index: j
                            });
                        }
                    }

                    let shouldAdd = true;
                    let updateIndex = -1;

                    // If we have previous entries from this speaker
                    if (speakerEntries.length > 0) {
                        for (const { entry, index } of speakerEntries) {
                            // Extract just the text portion from the previous entry
                            const entryTextMatch = entry.match(/\[\d{1,2}:\d{2}:\d{2}\s[AP]M\]:\s*(.*)/);
                            if (!entryTextMatch) continue;

                            const entryText = entryTextMatch[1].trim();
                            const currentText = text.trim();

                            // SPECIAL CASE FOR SHORT MESSAGES:
                            // If this is a short message (1-3 words) AND it's the beginning of a longer message
                            // OR a longer message begins with this short message
                            if (currentText.split(/\s+/).length <= 3) {
                                // Check if the short message is part of a longer one
                                if (entryText.startsWith(currentText + " ") ||
                                    entryText === currentText ||
                                    currentText.startsWith(entryText + " ")) {
                                    shouldAdd = false;
                                    break;
                                }
                            } else if (entryText.split(/\s+/).length <= 3) {
                                // If the previous entry is short and part of the current one
                                if (currentText.startsWith(entryText + " ") ||
                                    currentText === entryText) {
                                    // We should replace the short entry with this longer one
                                    shouldAdd = true;
                                    updateIndex = index;
                                    break;
                                }
                            } else {
                                // Both are longer messages - check for duplicates or continuations

                                // Exact match
                                if (currentText === entryText) {
                                    shouldAdd = false;
                                    break;
                                }

                                // Check for auto-correction case
                                if (this.isAutoCorrection(currentText, entryText)) {
                                    // Keep the newer entry as it's likely the correction
                                    updateIndex = index;
                                    shouldAdd = false;
                                    break;
                                }

                                // One is a continuation of the other
                                if (currentText.startsWith(entryText) || entryText.startsWith(currentText)) {
                                    // Keep the longer one
                                    if (currentText.length > entryText.length) {
                                        updateIndex = index;
                                    }
                                    shouldAdd = false;
                                    break;
                                }
                            }
                        }
                    }

                    // Update existing entry if needed
                    if (updateIndex >= 0) {
                        this.transcriptHistory[updateIndex] = formattedLine;
                        Logger.debug('Updated existing line:', {
                            old: this.transcriptHistory[updateIndex],
                            new: formattedLine
                        });
                    }
                    // Add as new entry if needed
                    else if (shouldAdd) {
                        this.addTranscriptEntry(formattedLine);
                        Logger.debug('Added new transcript line:', formattedLine);
                    }
                }
            }
        }

        captureChatMessage(container) {
            const messageElement = container.querySelector(CONFIG.SELECTORS.CHAT_MESSAGE);
            if (!messageElement) return null;

            // Get sender name and timestamp from header
            const headerDiv = messageElement.querySelector(`.${CONFIG.STRINGS.CHAT_HEADER_CLASS}`);
            if (headerDiv) {
                const senderElement = headerDiv.querySelector(CONFIG.SELECTORS.CHAT_SENDER);
                const timeElement = headerDiv.querySelector(CONFIG.SELECTORS.CHAT_TIMESTAMP);
                if (senderElement && timeElement) {
                    if (senderElement.textContent === CONFIG.MESSAGES.SYSTEM_SENDER) {
                        const messageContent = messageElement.querySelector(CONFIG.SELECTORS.CHAT_CONTENT);
                        if (messageContent && messageContent.textContent.includes('Machine generated captions')) {
                            return null;
                        }
                    }

                    this.lastSender = senderElement.textContent;

                    // Get original timestamp but enhance with seconds
                    this.lastTimestamp = timeElement.textContent;
                    // If timestamp doesn't have seconds, add them
                    if (this.lastTimestamp && !this.lastTimestamp.match(/\d{1,2}:\d{2}:\d{2}/)) {
                        // Extract existing HH:MM
                        const timeMatch = this.lastTimestamp.match(/(\d{1,2}:\d{2})\s([AP]M)/);
                        if (timeMatch) {
                            // Add current seconds
                            const seconds = new Date().getSeconds();
                            this.lastTimestamp = `${timeMatch[1]}:${String(seconds).padStart(2, '0')} ${timeMatch[2]}`;
                        }
                    }
                }
            }

            // Get message content - handling both formats but avoiding duplicates
            const contentElements = messageElement.querySelectorAll(CONFIG.SELECTORS.CHAT_CONTENT);
            if (!contentElements.length) return null;

            // Get unique content
            const message = Array.from(contentElements)
                .map(el => el.textContent.trim())
                .filter(text => text) // Remove empty strings
                .reduce((unique, text) => unique || text, ''); // Take first non-empty text

            // Skip empty messages
            if (!message || !this.lastSender || !this.lastTimestamp) return null;

            // Create message identifier
            const messageId = `[${this.lastTimestamp}] - ${this.lastSender}: ${message}`;

            // Create a content-only identifier for duplicate detection
            const contentId = `${this.lastSender}:${message}`;

            // Check if already processed by content
            if (this.processedChatMessageContents && this.processedChatMessageContents.has(contentId)) {
                return null;
            }

            // If we haven't processed this content before, add it
            if (!this.processedChatMessageContents) {
                this.processedChatMessageContents = new Set();
            }
            this.processedChatMessageContents.add(contentId);

            return messageId;
        }

        captureNewChatMessages() {
            const chatContainer = document.querySelector(CONFIG.SELECTORS.CHAT_CONTAINER);
            if (!chatContainer) return;

            const chatBubbles = Array.from(chatContainer.querySelectorAll(CONFIG.SELECTORS.CHAT_BUBBLE));
            const originalChatCount = this.chatHistory.length;

            // Clear this each time to get fresh chat content
            this.recentChatContent = new Set();

            // First pass - find all current chat message content for deduplication
            chatBubbles.forEach(bubble => {
                const messageElement = bubble.querySelector(CONFIG.SELECTORS.CHAT_MESSAGE);
                if (!messageElement) return;

                const contentElements = messageElement.querySelectorAll(CONFIG.SELECTORS.CHAT_CONTENT);
                if (!contentElements.length) return;

                // Extract just the message content (no timestamp/sender)
                const messageContent = Array.from(contentElements)
                    .map(el => el.textContent.trim())
                    .filter(text => text)
                    .join(' ');

                if (messageContent) {
                    this.recentChatContent.add(messageContent);
                }
            });

            // Process bubbles in order
            chatBubbles.forEach(bubble => {
                const messageContent = this.captureChatMessage(bubble);
                if (messageContent) {
                    // Extract just the message part after the sender
                    const contentMatch = messageContent.match(/.*:\s*(.*)/);
                    const justContent = contentMatch ? contentMatch[1].trim() : '';

                    // Check if we already have this exact message content in our history
                    // by looking at the actual messages, not just the identifiers
                    const isDuplicate = this.chatHistory.some(existingMsg => {
                        const existingContentMatch = existingMsg.match(/.*:\s*(.*)/);
                        const existingJustContent = existingContentMatch ? existingContentMatch[1].trim() : '';
                        return existingJustContent === justContent;
                    });

                    if (!isDuplicate) {
                        this.addChatEntry(messageContent);
                    }
                }
            });

            // Log if we added any new chat messages this round
            if (this.chatHistory.length > originalChatCount) {
                Logger.debug(`Added ${this.chatHistory.length - originalChatCount} new chat messages`);
            }
        }

        getTranscriptContent() {
            // If no transcript content, return empty string
            if (this.transcriptHistory.length === 0) {
                return '';
            }

            // Create a copy of transcript history
            const content = [...this.transcriptHistory];

            // Insert attendees after title if we have them
            const titleIndex = content.findIndex(line =>
                line.startsWith(CONFIG.STRINGS.TITLE_PREFIX));

            if (titleIndex !== -1 && this.currentAttendees) {
                const attendeesLine = `${CONFIG.STRINGS.ATTENDEES_PREFIX}${this.currentAttendees}`;
                content.splice(titleIndex + 1, 0, attendeesLine);
            }

            return content.join('\n');
        }

        getChatContent() {
            return this.chatHistory.join('\n');
        }

        getCommentsContent() {
            return this.commentsHistory.join('\n');
        }

        getCombinedContent(applyFuzzyMatch = true) {
            // Get individual content types
            const transcriptContent = this.getTranscriptContent();
            const chatContent = this.getChatContent();
            const commentsContent = this.getCommentsContent();

            // If no content at all, return empty string
            if (!transcriptContent && !chatContent && !commentsContent) {
                return '';
            }

            // Start with transcript content
            let combinedLines = [];

            if (transcriptContent) {
                combinedLines = transcriptContent.split('\n');
            }

            // Determine where header ends in transcript content
            let headerEndIndex = -1;
            for (let i = 0; i < combinedLines.length; i++) {
                const line = combinedLines[i];
                if (line.startsWith(CONFIG.STRINGS.TITLE_PREFIX) ||
                    line.startsWith(CONFIG.STRINGS.MEETING_DATE_PREFIX) ||
                    line.startsWith(CONFIG.STRINGS.ATTENDEES_PREFIX) ||
                    line === CONFIG.STRINGS.SYSTEM_MESSAGE) {
                    headerEndIndex = i;
                } else {
                    // First non-header line found
                    break;
                }
            }

            // Extract header and content sections
            const headerLines = combinedLines.slice(0, headerEndIndex + 1);
            const contentLines = combinedLines.slice(headerEndIndex + 1);

            // Create timestamped entries array for chronological ordering
            const timestampedEntries = [];

            // Add transcript content lines with timestamps
            contentLines.forEach(line => {
                if (!line.trim()) return; // Skip empty lines

                const timestamp = this.getMessageTimestamp(line);
                if (timestamp) {
                    timestampedEntries.push({
                        timestamp,
                        content: line,
                        type: 'transcript'
                    });
                } else {
                    // Handle lines without extractable timestamps
                    timestampedEntries.push({
                        timestamp: Date.now(), // Default to now
                        content: line,
                        type: 'transcript'
                    });
                }
            });

            // Add chat messages with timestamps
            if (chatContent) {
                chatContent.split('\n').filter(line => line.trim()).forEach(line => {
                    const timestamp = this.getMessageTimestamp(line);
                    if (timestamp) {
                        timestampedEntries.push({
                            timestamp,
                            content: line,
                            type: 'chat'
                        });
                    }
                });
            }

            // Add comments with timestamps
            if (commentsContent) {
                commentsContent.split('\n').filter(line => line.trim()).forEach(line => {
                    const timestamp = this.getMessageTimestamp(line);
                    if (timestamp) {
                        timestampedEntries.push({
                            timestamp,
                            content: line,
                            type: 'comment'
                        });
                    }
                });
            }

            // Sort entries by timestamp
            timestampedEntries.sort((a, b) => a.timestamp - b.timestamp);

            // Combine everything
            const combined = [
                ...headerLines,
                ...timestampedEntries.map(entry => entry.content)
            ].join('\n');

            // Apply deduplication if requested
            if (applyFuzzyMatch) {
                return this.cleanupDuplicateLines(combined);
            }

            return combined;
        }

        getSessionId() {
            // If we already have a session ID, return it
            if (this.sessionId) {
                return this.sessionId;
            }

            // For IndexedDB, include both date and meetingId to differentiate meetings
            const { date } = Utils.getPSTDateTime();
            const sanitizedTitle = Utils.sanitizeFilename(this.meetingTitle);

            // Include meetingId in the session ID for uniqueness
            // Ensure consistent formatting - no spaces in meetingId
            const formattedMeetingId = this.meetingId ? this.meetingId.replace(/\s+/g, '') : '';
            this.sessionId = `[${date}] - ${sanitizedTitle} - MoM - ${formattedMeetingId}`;
            return this.sessionId;
        }

        // Add a new method to get filename (without meetingId)
        getFileNameId() {
            const { date } = Utils.getPSTDateTime();
            const sanitizedTitle = Utils.sanitizeFilename(this.meetingTitle);
            return `[${date}] - ${sanitizedTitle} - MoM`;
        }

        async waitForMeetingDetails() {
            return new Promise((resolve) => {
                const checkDetails = () => {
                    if (this.getMeetingDetails()) {
                        resolve(true);
                    } else if (this.detailsRetryCount < CONFIG.MEETING.MAX_RETRIES) {
                        setTimeout(checkDetails, CONFIG.MEETING.RETRY_DELAY);
                    } else {
                        resolve(false);
                    }
                };
                checkDetails();
            });
        }

        getMessageTimestamp(message) {
            try {
                // Updated timestamp format to include seconds: [10:30:45 AM]
                const timestampMatch = message.match(/\[(\d{1,2}:\d{2}(?::\d{2})?\s[AP]M)\]/);
                if (timestampMatch) {
                    const timeStr = timestampMatch[1];
                    const today = new Date();

                    // Handle both formats: with or without seconds
                    let timeComponents;
                    if (timeStr.includes(':')) {
                        // Format with seconds: 10:30:45 AM
                        timeComponents = timeStr.match(/(\d{1,2}):(\d{2}):(\d{2})\s([AP]M)/);
                        if (timeComponents) {
                            let hour = parseInt(timeComponents[1]);
                            const minute = parseInt(timeComponents[2]);
                            const second = parseInt(timeComponents[3]);
                            const period = timeComponents[4];

                            // Adjust for 12-hour format
                            if (period === 'PM' && hour < 12) hour += 12;
                            if (period === 'AM' && hour === 12) hour = 0;

                            today.setHours(hour, minute, second, 0);
                            return today.getTime();
                        }
                    }

                    // Format without seconds: 10:30 AM
                    timeComponents = timeStr.match(/(\d{1,2}):(\d{2})\s([AP]M)/);
                    if (timeComponents) {
                        let hour = parseInt(timeComponents[1]);
                        const minute = parseInt(timeComponents[2]);
                        const period = timeComponents[3];

                        // Adjust for 12-hour format
                        if (period === 'PM' && hour < 12) hour += 12;
                        if (period === 'AM' && hour === 12) hour = 0;

                        today.setHours(hour, minute, 0, 0);
                        return today.getTime();
                    }
                }
            } catch (error) {
                Logger.error('Error parsing message timestamp:', error);
            }
            return Date.now(); // Fallback to current time
        }

        checkCCEnabled() {
            let ccCheck = 0;
            const ccCheckInterval = setInterval(() => {
                ccCheck++;
                const transcriptElement = document.querySelector(CONFIG.SELECTORS.TRANSCRIPT);
                if (!transcriptElement && ccCheck < 5) {
                    Logger.warn('CC might not be enabled, attempt:', ccCheck);
                    // Show visual warning to user
                    this.uiManager.showSnackbar('Please enable Closed Captions (CC) to capture transcript', true);
                } else if (ccCheck >= 5) {
                    clearInterval(ccCheckInterval);
                }
            }, 5000); // Check every 5 seconds initially
        }

        setupHealthCheck() {
            let lastCaptureCount = 0;
            let staleCount = 0;

            setInterval(() => {
                const currentCount = this.transcriptHistory.length + this.chatHistory.length;
                const transcriptElement = document.querySelector(CONFIG.SELECTORS.TRANSCRIPT);
                const ccEnabled = !!transcriptElement;

                if (currentCount === lastCaptureCount) {
                    staleCount++;
                    if (staleCount >= 5 && ccEnabled) { // Increased threshold and only if CC is enabled
                        Logger.warn('Possible capture stall detected');

                        // Only show warning if really needed
                        if (staleCount >= 10) {
                            this.uiManager.showSnackbar('Refreshing capture...', true);

                            // Restart timers as a recovery mechanism
                            this.stopCapturing();
                            this.startCapturing();
                        }
                    }
                } else {
                    staleCount = 0;
                }

                lastCaptureCount = currentCount;
            }, 20000); // Increased interval to 20 seconds
        }

        setupMemoryManagement() {
            setInterval(() => {
                try {
                    // Clean up processed messages sets periodically
                    const oldestTimestamp = Date.now() - (60 * 60 * 1000); // 1 hour

                    this.processedTranscriptMessages.forEach(message => {
                        // Since transcript messages don't have timestamps in their IDs,
                        // we'll clear this set entirely once per hour
                        if (this.transcriptHistory.length > 100) {
                            this.processedTranscriptMessages = new Set(
                                Array.from(this.processedTranscriptMessages).slice(-100)
                            );
                        }
                    });

                    this.processedChatMessages.forEach(message => {
                        if (this.getMessageTimestamp(message) < oldestTimestamp) {
                            this.processedChatMessages.delete(message);
                        }
                    });

                    // Force garbage collection of removed references
                    if (window.gc) {
                        window.gc();
                    }
                } catch (error) {
                    Logger.error('Error in memory management:', error);
                }
            }, 30 * 60 * 1000); // Run every 30 minutes
        }

        enableErrorRecoveryMode() {
            window.onerror = (msg, url, lineNo, columnNo, error) => {
                Logger.error('Global error:', { msg, url, lineNo, columnNo, error });

                // Attempt to save current state
                if (this.hasContent()) {
                    Object.values(CONFIG.DB.CONTENT_TYPES).forEach(contentType => {
                        const content = this.getContentByType(contentType);
                        if (content) {
                            cacheManager.saveToCache(content, contentType);
                        }
                    });

                    dbManager.saveSession().catch(err =>
                        Logger.error('Emergency save failed:', err));
                }

                return false; // Allow default error handling
            };
        }

        startAttendeesTracking() {
            // Initial capture
            this.updateAttendeesList();

            // Set up periodic updates
            this.attendeesUpdateInterval = setInterval(() => {
                this.updateAttendeesList();
            }, CONFIG.INTERVALS.ATTENDEES_UPDATE);
        }

        captureAttendees() {
            try {
                const attendees = new Set(); // Use Set to avoid duplicates

                const processSection = (sectionSelector) => {
                    try {
                        const button = document.querySelector(sectionSelector);
                        const section = button?.closest(CONFIG.SELECTORS.ATTENDEES.SECTION_CONTAINER);

                        if (!section) return;

                        const nameElements = section.querySelectorAll(CONFIG.SELECTORS.ATTENDEES.NAME_ELEMENT);
                        nameElements.forEach(elem => {
                            try {
                                const name = elem.textContent?.trim();
                                if (!name) return;

                                // Skip conference rooms
                                if (name.startsWith('‹') && name.endsWith('›')) return;

                                // Convert "Last, First" to "First Last"
                                const parts = name.split(', ');
                                if (parts.length === 2) {
                                    attendees.add(`${parts[1]} ${parts[0]}`);
                                } else {
                                    // Handle cases where name might not be in expected format
                                    attendees.add(name);
                                }
                            } catch (error) {
                                Logger.error('Error processing individual attendee:', error);
                            }
                        });
                    } catch (error) {
                        Logger.error('Error processing section:', error);
                    }
                };

                // Process both Present and Left sections
                processSection(CONFIG.SELECTORS.ATTENDEES.PRESENT_SECTION);
                processSection(CONFIG.SELECTORS.ATTENDEES.LEFT_SECTION);

                return Array.from(attendees).sort().join(CONFIG.STRINGS.ATTENDEES_SEPARATOR);
            } catch (error) {
                Logger.error('Error capturing attendees:', error);
                return ''; // Return empty string on error
            }
        }

        updateAttendeesList() {
            try {
                const newAttendees = this.captureAttendees();

                // Only update if attendees list has changed
                if (newAttendees && newAttendees !== this.lastAttendeesUpdate) {
                    this.lastAttendeesUpdate = newAttendees;
                    this.currentAttendees = newAttendees;
                    Logger.debug('Updated attendees list:', newAttendees);
                }
            } catch (error) {
                Logger.error('Error updating attendees list:', error);
            }
        }

        cleanup() {
            // Add to existing cleanup or create new cleanup method
            if (this.attendeesUpdateInterval) {
                clearInterval(this.attendeesUpdateInterval);
                this.attendeesUpdateInterval = null;
            }

            this.stopCapturing();
        }

        cleanupDuplicateLines(content) {
            const lines = content.split('\n');
            const cleanedLines = [];
            let lastLine = '';
            let headerSection = true;
            let headerCount = 0;

            // Track the last few lines by speaker to avoid removing legitimate duplicates
            const lastLinesBySpeaker = new Map();

            for (const line of lines) {
                // Always keep empty lines
                if (!line.trim()) {
                    cleanedLines.push(line);
                    continue;
                }

                // Check for header lines and always keep them
                if (line.startsWith(CONFIG.STRINGS.TITLE_PREFIX) ||
                    line.startsWith(CONFIG.STRINGS.MEETING_DATE_PREFIX) ||
                    line.startsWith(CONFIG.STRINGS.ATTENDEES_PREFIX) ||
                    line === CONFIG.STRINGS.SYSTEM_MESSAGE) {
                    cleanedLines.push(line);
                    headerCount++;
                    // After we've seen all expected header items, header section is done
                    if (headerCount >= 3) { // Might need adjustment based on expected headers
                        headerSection = false;
                    }
                    continue;
                }

                // Always keep chat messages and injected comments
                if (line.includes('[Injected Comment]:') ||
                    (line.match(/\[\d{1,2}:\d{2}(?::\d{2})?\s[AP]M\]/) &&
                        !line.match(/\[\d{1,2}:\d{2}(?::\d{2})?\s[AP]M\]:/))) { // Has timestamp but not transcript format
                    cleanedLines.push(line);
                    headerSection = false;
                    continue;
                }

                // Exit header mode after first non-header line
                if (headerSection) {
                    headerSection = false;
                }

                // For transcript lines after the header, check for duplicates with improved approach
                const lineHasTimestamp = line.match(/\[\d{1,2}:\d{2}(?::\d{2})?\s[AP]M\]:/);
                if (lineHasTimestamp) {
                    // Extract speaker and content
                    const lineParts = line.split(/\[\d{1,2}:\d{2}(?::\d{2})?\s[AP]M\]:/);
                    if (lineParts.length < 2) {
                        // Malformed line, keep it
                        cleanedLines.push(line);
                        continue;
                    }

                    const speaker = lineParts[0].trim();
                    const content = lineParts[1].trim();

                    // For short messages (3 words or fewer), always keep them
                    const wordCount = content.split(/\s+/).length;
                    if (wordCount <= 3) {
                        cleanedLines.push(line);

                        // Track this line as the last one for this speaker
                        if (!lastLinesBySpeaker.has(speaker)) {
                            lastLinesBySpeaker.set(speaker, []);
                        }
                        const speakerLines = lastLinesBySpeaker.get(speaker);
                        speakerLines.push(line);
                        // Keep only the last 5 lines for each speaker
                        if (speakerLines.length > 5) {
                            speakerLines.shift();
                        }
                        continue;
                    }

                    // Check against recent lines from the same speaker
                    let isDuplicate = false;
                    const speakerLines = lastLinesBySpeaker.get(speaker) || [];

                    for (const prevLine of speakerLines) {
                        const prevLineParts = prevLine.split(/\[\d{1,2}:\d{2}(?::\d{2})?\s[AP]M\]:/);
                        if (prevLineParts.length < 2) continue;

                        const prevContent = prevLineParts[1].trim();

                        // Check if contents are very similar
                        if (content === prevContent) {
                            isDuplicate = true;
                            break;
                        }

                        // Check if one is a subset of the other
                        if (content.includes(prevContent) || prevContent.includes(content)) {
                            // Keep the longer one
                            if (content.length <= prevContent.length) {
                                isDuplicate = true;
                                break;
                            }
                        }
                    }

                    if (!isDuplicate) {
                        cleanedLines.push(line);
                        // Track this line
                        if (!lastLinesBySpeaker.has(speaker)) {
                            lastLinesBySpeaker.set(speaker, []);
                        }
                        const speakerLines = lastLinesBySpeaker.get(speaker);
                        speakerLines.push(line);
                        // Keep only the last 5 lines for each speaker
                        if (speakerLines.length > 5) {
                            speakerLines.shift();
                        }
                    }
                } else {
                    // Line doesn't follow expected format, keep it
                    cleanedLines.push(line);
                }
            }

            return cleanedLines.join('\n');
        }

        addComment(comment) {
            const timestamp = new Date().toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',  // Add seconds
                hour12: true
            });

            const formattedComment = `[${timestamp}] - [Injected Comment]: ${comment}`;
            this.addCommentEntry(formattedComment);
            return formattedComment;
        }

        isAutoCorrection(textA, textB) {
            // If they're identical, it's not a correction
            if (textA === textB) return false;

            // Normalize texts (remove punctuation, lowercase)
            const normalizeText = (text) => text.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
            const normA = normalizeText(textA);
            const normB = normalizeText(textB);

            // If identical after normalization, it's a correction
            if (normA === normB) return true;

            // Split into words
            const wordsA = normA.split(/\s+/).filter(w => w.length > 0);
            const wordsB = normB.split(/\s+/).filter(w => w.length > 0);

            // If they're completely different lengths, likely not a correction
            if (Math.abs(wordsA.length - wordsB.length) > 2) return false;

            // Count matching words in any position (for grammar correction)
            let matchingWords = 0;
            for (const wordA of wordsA) {
                if (wordsB.includes(wordA)) {
                    matchingWords++;
                }
            }

            // Strong match if most words match regardless of position
            const matchRatio = matchingWords / Math.min(wordsA.length, wordsB.length);
            if (matchRatio >= 0.7) return true;

            // Special case for beginning word removal (filler words)
            if (wordsA.length > 1 && wordsB.length > 1) {
                // Check if one starts with the other but missing first word
                if (wordsA.slice(1).join(' ') === wordsB.join(' ') ||
                    wordsB.slice(1).join(' ') === wordsA.join(' ')) {
                    return true;
                }
            }

            // Handle article insertion/removal
            if (Math.abs(wordsA.length - wordsB.length) === 1) {
                const articles = ['a', 'an', 'the'];
                // Find the extra word
                if (wordsA.length > wordsB.length) {
                    // Look for an article in A that's not in B
                    for (const article of articles) {
                        if (wordsA.includes(article) && !wordsB.includes(article)) {
                            // Remove the article and compare
                            const withoutArticle = [...wordsA];
                            withoutArticle.splice(wordsA.indexOf(article), 1);
                            if (withoutArticle.join(' ') === wordsB.join(' ')) {
                                return true;
                            }
                        }
                    }
                } else {
                    // Look for an article in B that's not in A
                    for (const article of articles) {
                        if (wordsB.includes(article) && !wordsA.includes(article)) {
                            // Remove the article and compare
                            const withoutArticle = [...wordsB];
                            withoutArticle.splice(wordsB.indexOf(article), 1);
                            if (withoutArticle.join(' ') === wordsA.join(' ')) {
                                return true;
                            }
                        }
                    }
                }
            }

            // Count matching words at the beginning
            let matchingPrefix = 0;
            for (let i = 0; i < Math.min(wordsA.length, wordsB.length); i++) {
                if (wordsA[i] === wordsB[i]) {
                    matchingPrefix++;
                } else {
                    break;
                }
            }

            // If first word matches and it's a short phrase, it's likely a correction
            if ((wordsA.length <= 3 && wordsB.length <= 4) && matchingPrefix >= 1) {
                return true;
            }

            // If most words match but differ at the end, it's likely an auto-correction
            return matchingPrefix >= Math.min(3, Math.min(wordsA.length, wordsB.length) - 1);
        }
    }

    class UIManager {
        constructor(transcriptManager) {
            this.transcript = transcriptManager;
            this.commentInputVisible = false;
            this.contentPreviewVisible = false;
            this.initializeUI();
        }

        initializeUI() {
            this.createButtons();
            this.createSnackbar();
        }

        createButtons() {
            this.copyButton = Utils.createElement('button', {
                textContent: CONFIG.UI.COPY_BUTTON.TEXT,
                style: {
                    ...CONFIG.UI.COMMON.BUTTON,
                    ...CONFIG.UI.COPY_BUTTON.STYLES,
                    backgroundColor: CONFIG.UI.COPY_BUTTON.COLOR
                }
            });

            this.saveButton = Utils.createElement('button', {
                textContent: CONFIG.UI.SAVE_BUTTON.TEXT,
                style: {
                    ...CONFIG.UI.COMMON.BUTTON,
                    ...CONFIG.UI.SAVE_BUTTON.STYLES,
                    backgroundColor: CONFIG.UI.SAVE_BUTTON.COLOR
                }
            });

            this.commentButton = Utils.createElement('button', {
                textContent: CONFIG.UI.COMMENT_BUTTON.TEXT,
                style: {
                    ...CONFIG.UI.COMMON.BUTTON,
                    ...CONFIG.UI.COMMENT_BUTTON.STYLES,
                    backgroundColor: CONFIG.UI.COMMENT_BUTTON.COLOR
                }
            });

            this.commentInput = Utils.createElement('textarea', {
                style: {
                    ...CONFIG.UI.COMMENT_INPUT.STYLES
                }
            });

            this.closeButton = Utils.createElement('button', {
                textContent: CONFIG.UI.CLOSE_BUTTON.TEXT,
                style: {
                    ...CONFIG.UI.CLOSE_BUTTON.STYLES  // Don't use COMMON.BUTTON for close
                }
            });

            this.submitButton = Utils.createElement('button', {
                textContent: CONFIG.UI.SUBMIT_BUTTON.TEXT,
                style: {
                    color: 'white',    // Only take these from COMMON.BUTTON
                    border: 'none',
                    cursor: 'pointer',
                    ...CONFIG.UI.SUBMIT_BUTTON.STYLES,
                    backgroundColor: CONFIG.UI.SUBMIT_BUTTON.COLOR
                }
            });

            this.commentContainer = Utils.createElement('div', {
                style: {
                    ...CONFIG.UI.COMMENT_CONTAINER.STYLES,
                    display: 'none'
                }
            });

            this.viewButton = Utils.createElement('button', {
                textContent: CONFIG.UI.VIEW_BUTTON.TEXT,
                style: {
                    ...CONFIG.UI.COMMON.BUTTON,
                    ...CONFIG.UI.VIEW_BUTTON.STYLES,
                    backgroundColor: CONFIG.UI.VIEW_BUTTON.COLOR
                }
            });

            this.commentContainer.appendChild(this.closeButton);
            this.commentContainer.appendChild(this.commentInput);
            this.commentContainer.appendChild(this.submitButton);

            this.setupButtonListeners();

            document.body.appendChild(this.copyButton);
            document.body.appendChild(this.saveButton);
            document.body.appendChild(this.commentButton);
            document.body.appendChild(this.commentContainer);
            document.body.appendChild(this.viewButton);
        }

        setupButtonListeners() {
            this.copyButton.addEventListener('click', () => this.handleCopy());
            this.saveButton.addEventListener('click', () => this.handleSave());
            this.commentButton.addEventListener('click', () => this.toggleCommentInput());
            this.submitButton.addEventListener('click', () => this.handleCommentSubmit());
            this.closeButton.addEventListener('click', () => this.handleCloseContainer());
            this.viewButton.addEventListener('click', () => this.handleViewContent());
            this.commentInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    this.handleCommentSubmit();
                } else if (e.key === 'Escape') {
                    this.handleCloseContainer();
                }
            });
        }

        handleCloseContainer() {
            if (this.commentInputVisible) {
                this.toggleCommentInput();
            } else if (this.contentPreviewVisible) {
                this.closeContentPreview();
            }
        }

        closeContentPreview() {
            this.commentInput.readOnly = false;
            this.commentInput.style.backgroundColor = '#333';
            this.submitButton.style.display = 'flex';
            this.contentPreviewVisible = false;
            this.commentContainer.style.display = 'none';
            this.commentButton.style.display = 'block';
            this.commentInput.value = '';
        }

        handleViewContent() {
            this.contentPreviewVisible = true;
            this.commentInputVisible = false; // Make sure only one mode is active
            this.commentContainer.style.display = 'flex';
            this.commentButton.style.display = 'none';
            this.commentInput.value = this.transcript.getCombinedContent(true); // Use combined content with fuzzy matching
            this.commentInput.scrollTop = this.commentInput.scrollHeight;
            this.commentInput.readOnly = true;
            this.submitButton.style.display = 'none';
            this.commentInput.style.backgroundColor = '#444';

            // Set focus to the input area for keyboard navigation
            this.commentInput.focus();

            // Optional: Add an event listener for the Escape key on the container
            // in case focus is lost from the input
            this.commentContainer.tabIndex = -1; // Make container focusable
            this.commentContainer.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.closeContentPreview();
                }
            });
        }
        
        toggleCommentInput() {
            this.commentInputVisible = !this.commentInputVisible;
            this.contentPreviewVisible = false; // Make sure only one mode is active

            this.commentContainer.style.display = this.commentInputVisible ? 'flex' : 'none';
            this.commentButton.style.display = this.commentInputVisible ? 'none' : 'block';

            if (this.commentInputVisible) {
                this.commentInput.value = '';
                this.commentInput.readOnly = false;
                this.commentInput.style.backgroundColor = '#333';
                this.submitButton.style.display = 'flex';
                this.commentInput.focus();
            } else {
                this.commentInput.value = '';
            }
        }

        handleCommentSubmit() {
            const commentText = this.commentInput.value.trim();
            if (commentText) {
                // Add to comments history through the transcript manager
                const formattedComment = this.transcript.addComment(commentText);

                // Show confirmation
                this.showSnackbar('Comment added: ' + commentText.substring(0, 20) + (commentText.length > 20 ? '...' : ''));
            }

            this.toggleCommentInput();
        }

        handleCopy() {
            if (!this.transcript.hasContent()) {
                this.showSnackbar(CONFIG.MESSAGES.NO_CONTENT, true);
                return;
            }

            const tempInput = Utils.createElement('textarea', {
                value: this.transcript.getCombinedContent(true) // Get combined content with fuzzy matching
            });
            document.body.appendChild(tempInput);
            tempInput.select();
            document.execCommand('copy');
            document.body.removeChild(tempInput);
            this.showSnackbar(CONFIG.MESSAGES.COPY_SUCCESS);
        }

        handleSave() {
            if (!this.transcript.hasContent()) {
                this.showSnackbar(CONFIG.MESSAGES.NO_CONTENT, true);
                return;
            }

            const blob = new Blob([this.transcript.getCombinedContent(true)], { type: CONFIG.FILE.TYPE });
            const fileName = this.transcript.getFileNameId();

            const link = Utils.createElement('a', {
                href: URL.createObjectURL(blob),
                download: `${fileName}.txt`
            });
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            this.showSnackbar(CONFIG.MESSAGES.SAVE_SUCCESS);
        }

        createSnackbar() {
            this.snackbar = Utils.createElement('div', {
                id: 'snackbar',
                style: CONFIG.STYLES.SNACKBAR
            });
            document.body.appendChild(this.snackbar);
        }

        showSnackbar(message, isError = false) {
            this.snackbar.textContent = message;
            this.snackbar.style.backgroundColor = isError ? '#d9534f' : '#4CAF50';
            this.snackbar.style.visibility = 'visible';
            this.snackbar.style.opacity = '1';

            setTimeout(() => {
                this.snackbar.style.opacity = '0';
                this.snackbar.style.visibility = 'hidden';
            }, CONFIG.TIMINGS.SNACKBAR_DURATION);
        }
    }

    class DatabaseManager {
        constructor(transcriptManager) {
            this.transcript = transcriptManager;
            this.db = null;
            this.ready = false;
            this.initialize();
        }

        initialize() {
            Logger.info('Initializing DatabaseManager...');
            const request = indexedDB.open(CONFIG.DB.NAME, CONFIG.DB.VERSION);

            request.onupgradeneeded = (event) => {
                Logger.info('Upgrading database...');
                this.db = event.target.result;
                if (!this.db.objectStoreNames.contains(CONFIG.DB.STORE)) {
                    this.db.createObjectStore(CONFIG.DB.STORE, { keyPath: 'id' });
                    Logger.info('Created store:', CONFIG.DB.STORE);
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                this.ready = true;
                Logger.info('Database initialized successfully');
            };

            request.onerror = (event) => {
                Logger.error('Database initialization error:', event.target.error);
                this.ready = false;
            };
        }

        async getLastSession() {
            Logger.info('Getting last session...');
            if (!this.ready || !this.db) {
                Logger.info('Database not ready:', { ready: this.ready, hasDb: !!this.db });
                return null;
            }

            return new Promise((resolve, reject) => {
                try {
                    const transaction = this.db.transaction([CONFIG.DB.STORE], 'readonly');
                    const store = transaction.objectStore(CONFIG.DB.STORE);
                    const request = store.openCursor(null, 'prev');

                    request.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            Logger.info('Found last session:', {
                                id: cursor.value.id,
                                meetingId: cursor.value.meetingId,
                                timestamp: new Date(cursor.value.timestamp).toLocaleString()
                            });
                            resolve(cursor.value);
                        } else {
                            Logger.info('No previous session found');
                            resolve(null);
                        }
                    };

                    request.onerror = (event) => {
                        Logger.error('Error getting last session:', event.target.error);
                        resolve(null);
                    };
                } catch (error) {
                    Logger.error('Error in getLastSession:', error);
                    resolve(null);
                }
            });
        }

        async saveSession() {
            if (!this.ready || !this.db) {
                return;
            }

            // Get separate content for each type
            const transcriptContent = this.transcript.getTranscriptContent();
            const chatContent = this.transcript.getChatContent();
            const commentsContent = this.transcript.getCommentsContent();
            const combinedContent = this.transcript.getCombinedContent();

            // Skip save if no content at all
            if (!transcriptContent && !chatContent && !commentsContent) {
                return;
            }

            const sessionData = {
                id: this.transcript.getSessionId(),
                meetingId: this.transcript.meetingId,
                meetingTitle: this.transcript.meetingTitle,
                organizer: this.transcript.meetingOrganizer,
                [CONFIG.DB.CONTENT_TYPES.TRANSCRIPT]: transcriptContent,
                [CONFIG.DB.CONTENT_TYPES.CHAT]: chatContent,
                [CONFIG.DB.CONTENT_TYPES.COMMENTS]: commentsContent,
                [CONFIG.DB.CONTENT_TYPES.COMBINED]: combinedContent,
                timestamp: Date.now(), // creation timestamp
                lastUpdated: Date.now() // update timestamp
            };

            try {
                const transaction = this.db.transaction([CONFIG.DB.STORE], 'readwrite');
                const store = transaction.objectStore(CONFIG.DB.STORE);

                // Check for existing session
                const getRequest = store.get(sessionData.id);

                getRequest.onsuccess = () => {
                    const existingSession = getRequest.result;
                    if (existingSession) {
                        // Preserve original creation timestamp
                        sessionData.timestamp = existingSession.timestamp;

                        // For each content type, check if we should preserve existing content
                        Object.values(CONFIG.DB.CONTENT_TYPES).forEach(contentType => {
                            if (existingSession[contentType] && sessionData[contentType]) {
                                const existingLines = existingSession[contentType].split('\n').length;
                                const newLines = sessionData[contentType].split('\n').length;

                                // Only replace content if new content has more lines or existing content is empty
                                if (newLines < existingLines && existingLines > 0) {
                                    Logger.info(`Preserving existing ${contentType} content (${existingLines} lines vs ${newLines} lines)`);
                                    sessionData[contentType] = existingSession[contentType];
                                }
                            }
                        });
                    }

                    // Save the session
                    const putRequest = store.put(sessionData);

                    putRequest.onsuccess = () => {
                        // Success logging
                        Logger.debug('Session saved successfully');
                    };

                    putRequest.onerror = (error) => {
                        Logger.error('Error saving session:', error);
                        // Attempt cache backup on save failure
                        Object.values(CONFIG.DB.CONTENT_TYPES).forEach(contentType => {
                            if (sessionData[contentType]) {
                                cacheManager.saveToCache(sessionData[contentType], contentType);
                            }
                        });
                    };
                };

                getRequest.onerror = (error) => {
                    Logger.error('Error checking existing session:', error);
                    // Attempt cache backup
                    Object.values(CONFIG.DB.CONTENT_TYPES).forEach(contentType => {
                        if (sessionData[contentType]) {
                            cacheManager.saveToCache(sessionData[contentType], contentType);
                        }
                    });
                };

            } catch (error) {
                Logger.error('Save operation failed:', error);
                // Attempt cache backup
                Object.values(CONFIG.DB.CONTENT_TYPES).forEach(contentType => {
                    if (sessionData[contentType]) {
                        cacheManager.saveToCache(sessionData[contentType], contentType);
                    }
                });
            }
        }

        async getAllSessions() {
            if (!this.ready || !this.db) return [];

            return new Promise((resolve) => {
                try {
                    const transaction = this.db.transaction([CONFIG.DB.STORE], 'readonly');
                    const store = transaction.objectStore(CONFIG.DB.STORE);
                    const request = store.getAll();

                    request.onsuccess = () => {
                        resolve(request.result);
                    };

                    request.onerror = () => {
                        Logger.error('Error getting all sessions:', request.error);
                        resolve([]);
                    };
                } catch (error) {
                    Logger.error('Error in getAllSessions:', error);
                    resolve([]);
                }
            });
        }

        async cleanupOldSessions() {
            if (!this.ready || !this.db) return;

            try {
                const transaction = this.db.transaction([CONFIG.DB.STORE], 'readwrite');
                const store = transaction.objectStore(CONFIG.DB.STORE);
                const request = store.getAll();

                request.onsuccess = () => {
                    const sessions = request.result;
                    const now = Date.now();
                    const oneDayMs = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

                    sessions.forEach(session => {
                        if (now - session.timestamp > oneDayMs) {
                            Logger.info('Cleaning up old session:', session.id);
                            store.delete(session.id);
                        }
                    });
                };
            } catch (error) {
                Logger.error('Error during cleanup:', error);
            }
        }

        deleteSession(sessionId) {
            if (!this.ready || !this.db) {
                Logger.info('Cannot delete session - database not ready');
                return;
            }

            try {
                const transaction = this.db.transaction([CONFIG.DB.STORE], 'readwrite');
                const store = transaction.objectStore(CONFIG.DB.STORE);
                const request = store.delete(sessionId);

                request.onsuccess = () => {
                    Logger.info('Session deleted successfully:', sessionId);
                };

                request.onerror = (event) => {
                    Logger.error('Error deleting session:', event.target.error);
                };
            } catch (error) {
                Logger.error('Delete operation failed:', error);
            }
        }
    }

    // Function declarations
    const startCapturing = () => {
        // This function now just calls the new method in TranscriptManager
        transcriptManager.startCapturing();

        // Start periodic saves to IndexedDB (primary storage)
        setInterval(() => {
            try {
                if (dbManager.ready && transcriptManager.hasContent()) {
                    dbManager.saveSession().catch(error => {
                        Logger.error('IndexedDB save failed:', error);
                        // On IndexedDB failure, ensure we have a cache backup
                        Object.values(CONFIG.DB.CONTENT_TYPES).forEach(contentType => {
                            const content = transcriptManager.getContentByType(contentType);
                            if (content) {
                                cacheManager.saveToCache(content, contentType);
                            }
                        });
                    });
                }
            } catch (error) {
                Logger.error('Error in IndexedDB save:', error);
            }
        }, CONFIG.INTERVALS.DB_SAVE);

        // Backup to cache periodically (secondary storage)
        setInterval(() => {
            try {
                if (transcriptManager.hasContent()) {
                    Object.values(CONFIG.DB.CONTENT_TYPES).forEach(contentType => {
                        const content = transcriptManager.getContentByType(contentType);
                        if (content) {
                            cacheManager.saveToCache(content, contentType);
                        }
                    });
                }
            } catch (error) {
                Logger.error('Error in cache save:', error);
            }
        }, CONFIG.CACHE.UPDATE_INTERVAL);
    };

    // New function to block until meeting details are retrieved
    const retryUntilMeetingDetailsAvailable = async (retryCount = 0) => {
        const maxRetries = 60;  // 60 retries at 1s intervals = 60s max wait
        while (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000));  // Ensures full blocking

            // Actively fetch meeting details instead of just checking meetingId
            await transcriptManager.waitForMeetingDetails();

            if (transcriptManager.meetingId) {
                Logger.info(`Meeting details available, meetingId=${transcriptManager.meetingId}`);
                return true;
            }

            Logger.warn(`Meeting details not available yet. Retrying... (${retryCount + 1}/${maxRetries})`);
            retryCount++;
        }
        return false;  // Failed to retrieve meeting details
    };

    const waitForPageLoad = () => {
        return new Promise((resolve) => {
            if (document.readyState === 'complete') {
                resolve();
            } else {
                window.addEventListener('load', resolve);
                // Fallback timeout
                setTimeout(resolve, 5000);
            }
        });
    };

    const initialize = async () => {
        await waitForPageLoad();

        // Initialize only TranscriptManager first
        transcriptManager = new TranscriptManager();

        // Wait for meeting details before other initializations
        const success = await retryUntilMeetingDetailsAvailable();
        if (!success) {
            Logger.error("Meeting details could not be retrieved after max retries.");
            return;
        }
        Logger.info('Meeting details retrieved, proceeding with session resumption...');

        // Now initialize other managers
        uiManager = new UIManager(transcriptManager);
        dbManager = new DatabaseManager(transcriptManager);
        cacheManager = new CacheManager();

        // Initialize with dependencies
        transcriptManager.initialize(uiManager);

        // Proceed with session check and capture
        const resumed = await transcriptManager.checkForResume();
        if (resumed) {
            Logger.info('Successfully resumed existing session');
        }
        startCapturing();

        // Setup cleanup interval
        setInterval(() => {
            dbManager.cleanupOldSessions();
        }, 24 * 60 * 60 * 1000); // Once per day
    };

    // Start initialization
    setTimeout(initialize, CONFIG.MEETING.CHECK_DELAY);
})();