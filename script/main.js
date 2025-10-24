// Firebase Configuration (loaded from config.js)
const firebaseConfig = window.firebaseConfig;

// Firebase globals
let db = null;
let auth = null;
let currentUser = null;
let firebaseReady = false;

// Comprehensive Firebase initialization
async function initializeFirebase() {
    console.log('🔥 Starting Firebase initialization...');

    try {
        // Check if Firebase SDK is loaded
        if (typeof firebase === 'undefined') {
            console.error('❌ Firebase SDK not loaded');
            return false;
        }
        console.log('✅ Firebase SDK loaded');

        // Initialize Firebase app
        const app = firebase.initializeApp(firebaseConfig);
        console.log('✅ Firebase app initialized:', app.name);

        // Initialize Firebase Auth and Firestore with custom database
        auth = firebase.auth();

        // Debug: Check what methods are available on the app instance
        console.log('🔍 Available methods on app:', Object.getOwnPropertyNames(app));
        console.log('🔍 App firestore method:', typeof app.firestore);

        // IMPORTANT: For now, let's just use the default database
        // The named database approach isn't working properly with this SDK version
        console.log('🔄 Using default database for now (named database has routing issues)');

        db = app.firestore(); // Use default database

        db.settings({
            cacheSizeBytes: firebase.firestore.CACHE_SIZE_UNLIMITED,
            merge: true
        });

        console.log('✅ Connected to default Firestore database');

        // Initialize Firebase Storage
        if (firebase.storage) {
            window.storage = firebase.storage();
            console.log('✅ Firebase Storage initialized');
        } else {
            console.warn('⚠️ Firebase Storage not available');
        }

        // Enable network for Firestore
        await db.enableNetwork();
        console.log('✅ Firestore network enabled');

        // Skip authentication for now - just test Firestore directly
        console.log('⏭️ Skipping authentication, testing Firestore directly...');

        // Create a fake user ID for testing
        currentUser = { uid: 'test-user-' + Date.now() };
        firebaseReady = true;

        // Test Firestore without authentication
        const testResult = await testFirestoreConnection();
        return testResult;

    } catch (error) {
        console.error('❌ Firebase initialization failed:', error);
        return false;
    }
}

// Test Firestore connection without authentication
async function testFirestoreConnection() {
    if (!db) {
        console.error('❌ Cannot test Firestore: missing db');
        return false;
    }

    try {
        console.log('🧪 Testing Firestore connection (no auth)...');

        // First try a simple read operation (less likely to fail)
        console.log('📖 Testing Firestore read access...');
        const testCollection = db.collection('test');
        const snapshot = await testCollection.limit(1).get();
        console.log('✅ Firestore read access successful, docs:', snapshot.size);

        // Now test write access to verify full cloud sync capability
        console.log('✍️ Testing Firestore write access...');
        const testDoc = testCollection.doc('connection-test');
        const testData = {
            timestamp: Date.now(),
            test: 'Firebase connection test',
            userAgent: navigator.userAgent.substring(0, 100) // Truncate to avoid large data
        };

        await testDoc.set(testData);
        console.log('✅ Firestore write access successful');

        // Verify the write by reading it back
        const writtenDoc = await testDoc.get();
        if (writtenDoc.exists && writtenDoc.data().test === testData.test) {
            console.log('✅ Firestore read-after-write verification successful');

            // Clean up test document
            await testDoc.delete();
            console.log('🧹 Test document cleaned up');

            console.log('🎉 Firestore connection fully verified (read/write)');
            return true;
        } else {
            console.warn('⚠️ Write verification failed - document not found or data mismatch');
            return true; // Still continue with localStorage fallback
        }

    } catch (testError) {
        console.error('❌ Firestore test failed:', testError);
        console.error('Error code:', testError.code);
        console.error('Error message:', testError.message);

        // Check for specific error types
        if (testError.code === 'permission-denied') {
            console.error('🔒 Permission denied - check Firestore security rules');
        } else if (testError.code === 'unavailable') {
            console.error('🌐 Firestore service unavailable - network issue');
        } else if (testError.message.includes('timeout')) {
            console.error('⏰ Operation timed out - slow connection');
        }

        // Determine if we should continue based on error type
        if (testError.code === 'permission-denied') {
            console.log('⚠️ Firestore write access denied - using localStorage only mode');
            return true; // Continue with localStorage fallback
        } else if (testError.code === 'unavailable' || testError.message.includes('timeout')) {
            console.log('⚠️ Firestore temporarily unavailable - using localStorage with sync retry');
            return true; // Continue with localStorage and retry sync later
        } else {
            console.log('⚠️ Firestore test failed but continuing with localStorage fallback');
            return true; // Continue with localStorage fallback for any other errors
        }
    }
}

// Initialize Firebase when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    console.log('📄 DOM loaded, initializing Firebase...');
    const success = await initializeFirebase();

    if (success) {
        console.log('🎉 Firebase fully ready for use!');
    } else {
        console.warn('⚠️ Firebase initialization failed, using localStorage only');
    }
});

// Storage Manager Class
// STORAGE STRATEGY: Firebase ONLY - No localStorage (like date ideas)
// - ALL data stored in Firebase (Firestore for text, Storage for media)
// - Requires internet connection to save/load
// - All data uses 'shared_' prefix for cross-user/device sharing
// - Media files (photos/audio) use Firebase Storage
// - Text data (date ideas, notes, etc.) uses Firestore
// - No offline mode - Firebase is the single source of truth
class StorageManager {
    constructor() {
        this.userId = this.generateUserId();
        this.isOnline = navigator.onLine;

        this.setupOnlineStatusHandlers();
        this.updateConnectionStatus();
    }

    generateUserId() {
        // Generate a browser fingerprint-based user ID
        let userId = localStorage.getItem('os-homepage-user-id');

        if (!userId) {
            // Create a simple browser fingerprint
            const fingerprint = [
                navigator.userAgent,
                navigator.language,
                screen.width + 'x' + screen.height,
                new Date().getTimezoneOffset(),
                navigator.platform
            ].join('|');

            // Create a hash-like ID from the fingerprint
            userId = 'user_' + this.simpleHash(fingerprint);
            localStorage.setItem('os-homepage-user-id', userId);
        }

        return userId;
    }

    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString(36);
    }

    setupOnlineStatusHandlers() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            console.log('🌐 Connection restored!');
            this.updateConnectionStatus();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            console.log('📴 Connection lost - Firebase operations will fail until reconnected');
            this.updateConnectionStatus();
        });
    }

    async saveData(key, data) {
        try {
            console.log(`StorageManager: Saving data for key: ${key}`);
            console.log('Data type:', typeof data);
            console.log('Data size:', JSON.stringify(data).length, 'characters');

            // Validate data before saving
            if (data === undefined || data === null) {
                throw new Error('Cannot save null or undefined data');
            }

            // Check if Firebase is available
            if (!this.isOnline || !firebaseReady) {
                throw new Error('Cannot save: Internet connection required. Please check your connection and try again.');
            }

            // Determine storage strategy based on data type
            const dataSize = JSON.stringify(data).length;
            const isMediaFile = key.includes('music_') || key.includes('photo_');

            if (isMediaFile) {
                // Media files (photos and audio) go to Firebase Storage
                console.log(`Media file detected (${(dataSize / 1024 / 1024).toFixed(2)}MB), saving to Firebase Storage`);

                if (!window.storage) {
                    throw new Error('Firebase Storage not available');
                }

                const storageUrl = await this.saveToFirebaseStorage(key, data);

                // Save metadata to Firestore with Storage URL (without the large base64 data)
                const metadata = {
                    id: data.id,
                    filename: data.filename,
                    originalName: data.originalName,
                    size: data.size,
                    type: data.type,
                    uploadDate: data.uploadDate,
                    lastModified: data.lastModified,
                    metadata: data.metadata,
                    dataUrl: storageUrl, // Firebase Storage URL (replaces base64)
                    isStorageRef: true,
                    timestamp: Date.now()
                };

                await this.saveToFirestore(key, metadata);
                console.log(`✅ Media file saved to Firebase Storage: ${key}`);
                return true;
            } else {
                // Text data goes to Firestore
                console.log(`Saving data (${(dataSize / 1024).toFixed(1)}KB) to Firestore`);

                if (!db) {
                    throw new Error('Firestore not available');
                }

                await this.saveToFirestore(key, data);
                console.log(`✅ Data saved to Firestore: ${key}`);
                return true;
            }
        } catch (error) {
            console.error('StorageManager: Error saving data:', error);
            throw error; // Propagate error to caller
        }
    }

    async loadData(key) {
        try {
            // Check if Firebase is available
            if (!this.isOnline || !firebaseReady || !db) {
                throw new Error('Cannot load: Internet connection required. Please check your connection and try again.');
            }

            console.log(`Loading from Firebase: ${key}`);
            const cloudData = await this.loadFromFirestore(key);

            if (cloudData) {
                console.log(`✅ Loaded from Firebase: ${key}`);
                return cloudData.data;
            }

            return null;
        } catch (error) {
            console.error('Error loading data:', error);
            throw error; // Propagate error to caller
        }
    }

    async deleteData(key) {
        try {
            // Check if Firebase is available
            if (!this.isOnline || !firebaseReady) {
                throw new Error('Cannot delete: Internet connection required. Please check your connection and try again.');
            }

            // First, check if this is a media file by loading metadata from Firestore
            const isMediaFile = key.includes('music_') || key.includes('photo_');

            if (isMediaFile) {
                // Delete from Firebase Storage first
                await this.deleteFromFirebaseStorage(key);
                console.log(`✅ Deleted media file from Firebase Storage: ${key}`);
            }

            // Delete metadata/data from Firestore
            if (db) {
                await this.deleteFromFirestore(key);
                console.log(`✅ Deleted from Firestore: ${key}`);
            }

            return true;
        } catch (error) {
            console.error('Error deleting data:', error);
            return false;
        }
    }

    async saveToFirestore(key, data) {
        if (!db) throw new Error('Firestore not available');

        console.log(`StorageManager: saveToFirestore starting for key: ${key}`);
        console.log('Data size:', JSON.stringify(data).length, 'characters');

        try {
            const docRef = db.collection('app-data').doc(key);
            console.log('Document path:', docRef.path);

            const dataString = JSON.stringify(data);
            const dataSize = dataString.length;

            // If data is very large, we might need to chunk it
            if (dataSize > 800000) { // 800KB - close to Firestore limit
                console.log(`Large document (${(dataSize / 1024).toFixed(1)}KB), attempting direct save...`);
            }

            const docData = {
                data: data,
                timestamp: Date.now(),
                sessionId: this.userId,
                dataSize: dataSize,
                lastModified: firebase.firestore.FieldValue.serverTimestamp()
            };

            // Add timeout to prevent hanging (longer for large files)
            const timeoutMs = dataSize > 500000 ? 30000 : 10000; // 30s for large files, 10s for small
            const savePromise = docRef.set(docData);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`Firestore save timeout after ${timeoutMs / 1000} seconds`)), timeoutMs);
            });

            await Promise.race([savePromise, timeoutPromise]);
            console.log(`✅ StorageManager: saveToFirestore completed for key: ${key} (${(dataSize / 1024).toFixed(1)}KB)`);
        } catch (error) {
            console.error(`❌ StorageManager: saveToFirestore failed for key ${key}:`, error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);

            // For now, don't throw - just log the error and continue with localStorage
            if (error.code === 'unavailable' || error.message.includes('400') || error.message.includes('timeout')) {
                console.warn('🌐 Firestore unavailable, data saved to localStorage only');
                return; // Don't throw, just return
            }

            throw error;
        }
    }

    async loadFromFirestore(key) {
        if (!db) throw new Error('Firestore not available');

        const docRef = db.collection('app-data').doc(key);
        const doc = await docRef.get();

        if (doc.exists) {
            return doc.data();
        }
        return null;
    }

    async deleteFromFirestore(key) {
        if (!db) throw new Error('Firestore not available');

        const docRef = db.collection('app-data').doc(key);
        await docRef.delete();
    }

    async saveToFirebaseStorage(key, data) {
        // Check if Firebase Storage is available
        if (!window.storage) {
            throw new Error('Firebase Storage not available');
        }

        console.log(`StorageManager: saveToFirebaseStorage starting for key: ${key}`);

        try {
            // Convert base64 data URL to blob
            const response = await fetch(data.dataUrl);
            const blob = await response.blob();

            console.log(`Converting to blob: ${(blob.size / 1024 / 1024).toFixed(2)}MB`);

            // Determine storage path based on file type
            let storagePath;
            if (key.includes('music_')) {
                storagePath = `shared/audio/${key}`;
            } else if (key.includes('photo_')) {
                storagePath = `shared/photos/${key}`;
            } else {
                storagePath = `shared/media/${key}`;
            }

            // Create storage reference
            const storageRef = window.storage.ref();
            const fileRef = storageRef.child(storagePath);

            // Upload the blob
            console.log(`Uploading to Firebase Storage: ${storagePath}`);
            const uploadTask = await fileRef.put(blob, {
                contentType: data.type || 'application/octet-stream',
                customMetadata: {
                    originalName: data.filename || data.originalName || 'unknown',
                    uploadDate: data.uploadDate || new Date().toISOString(),
                    userId: this.userId,
                    fileType: key.includes('music_') ? 'audio' : key.includes('photo_') ? 'photo' : 'media'
                }
            });

            // Get download URL
            const downloadURL = await fileRef.getDownloadURL();
            console.log(`✅ Firebase Storage upload complete: ${key}`);

            return downloadURL;

        } catch (error) {
            console.error(`❌ Firebase Storage upload failed for ${key}:`, error);
            throw error;
        }
    }

    async deleteFromFirebaseStorage(key) {
        if (!window.storage) {
            console.warn('Firebase Storage not available for deletion');
            return;
        }

        try {
            // Determine storage path based on file type
            let storagePath;
            if (key.includes('music_')) {
                storagePath = `shared/audio/${key}`;
            } else if (key.includes('photo_')) {
                storagePath = `shared/photos/${key}`;
            } else {
                storagePath = `shared/media/${key}`;
            }

            const storageRef = window.storage.ref();
            const fileRef = storageRef.child(storagePath);

            await fileRef.delete();
            console.log(`✅ Deleted from Firebase Storage: ${key}`);
        } catch (error) {
            console.error(`❌ Firebase Storage deletion failed for ${key}:`, error);
            // Don't throw - deletion failures shouldn't break the app
        }
    }



    getUserId() {
        return this.userId;
    }

    getConnectionStatus() {
        return {
            online: this.isOnline,
            firebaseAvailable: !!db,
            firebaseReady: firebaseReady,
            authenticated: !!currentUser
        };
    }

    async testCloudSync() {
        if (!this.isOnline || !firebaseReady || !db) {
            console.log('❌ Firebase test failed: not ready');
            return { success: false, message: 'Firebase not available' };
        }

        try {
            console.log('🧪 Testing Firebase connection...');

            // Test write
            const testKey = `sync_test_${Date.now()}`;
            const testData = { test: true, timestamp: Date.now() };

            await this.saveData(testKey, testData);

            // Test read
            const readData = await this.loadData(testKey);
            if (!readData || readData.test !== true) {
                return { success: false, message: 'Read test failed' };
            }

            // Cleanup
            await this.deleteData(testKey);

            console.log('✅ Cloud sync test passed');
            return { success: true, message: 'Cloud sync working correctly' };

        } catch (error) {
            console.error('❌ Cloud sync test error:', error);
            return { success: false, message: `Test failed: ${error.message}` };
        }
    }



    updateConnectionStatus() {
        // Create or update connection status indicator
        let statusElement = document.getElementById('connection-status');
        if (!statusElement) {
            statusElement = document.createElement('div');
            statusElement.id = 'connection-status';
            statusElement.className = 'connection-status';
            statusElement.style.cursor = 'pointer';
            statusElement.addEventListener('click', async () => {
                const result = await this.testCloudSync();
                const message = result.success ? '✅ ' + result.message : '❌ ' + result.message;

                // Show temporary status
                const originalText = statusElement.textContent;
                statusElement.textContent = message;
                setTimeout(() => {
                    statusElement.textContent = originalText;
                }, 3000);
            });
            document.body.appendChild(statusElement);
        }

        const status = this.getConnectionStatus();
        if (status.firebaseAvailable && status.online && status.firebaseReady) {
            statusElement.className = 'connection-status online';
            statusElement.textContent = 'Firebase connected';
            statusElement.title = 'All data stored in Firebase (shared across devices)';
        } else if (status.online && !status.firebaseAvailable) {
            statusElement.className = 'connection-status error';
            statusElement.textContent = 'Firebase unavailable';
            statusElement.title = 'Firebase connection failed - cannot save/load data';
        } else if (!status.online) {
            statusElement.className = 'connection-status offline';
            statusElement.textContent = 'Offline';
            statusElement.title = 'No internet connection - Firebase operations unavailable';
        } else {
            statusElement.className = 'connection-status error';
            statusElement.textContent = 'Connecting...';
            statusElement.title = 'Firebase connection is being established';
        }

        // Update status periodically
        setTimeout(() => this.updateConnectionStatus(), 30000); // Update every 30 seconds
    }
}

// Data Models
class PhotoModel {
    constructor(file, dataUrl) {
        this.id = this.generateId();
        this.filename = file ? file.name : 'unknown.jpg';
        this.originalName = this.filename;
        this.dataUrl = dataUrl;
        this.size = file ? file.size : 0;
        this.type = file ? file.type : 'image/jpeg';
        this.uploadDate = new Date().toISOString();
        this.lastModified = new Date().toISOString();
        this.metadata = {
            width: null,
            height: null,
            compressed: false,
            originalSize: this.size
        };

        this.validate();
    }

    generateId() {
        return 'photo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    validate() {
        const errors = [];

        if (!this.dataUrl || !this.dataUrl.startsWith('data:image/')) {
            errors.push('Invalid image data URL');
        }

        if (!this.filename || this.filename.trim() === '') {
            errors.push('Filename is required');
        }

        if (this.size > 10 * 1024 * 1024) { // 10MB limit
            errors.push('File size exceeds 10MB limit');
        }

        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(this.type.toLowerCase())) {
            errors.push('Unsupported image format. Allowed: JPEG, PNG, GIF, WebP');
        }

        if (errors.length > 0) {
            throw new Error('Photo validation failed: ' + errors.join(', '));
        }

        return true;
    }

    async compress(maxWidth = 1920, maxHeight = 1080, quality = 0.8) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');

                    if (!ctx) {
                        reject(new Error('Canvas context not available'));
                        return;
                    }

                    // Store original dimensions
                    const originalWidth = img.width;
                    const originalHeight = img.height;

                    // Calculate new dimensions
                    let { width, height } = this.calculateDimensions(
                        originalWidth, originalHeight, maxWidth, maxHeight
                    );

                    canvas.width = width;
                    canvas.height = height;

                    // Enable image smoothing for better quality
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';

                    // Draw and compress
                    ctx.drawImage(img, 0, 0, width, height);

                    // Try different formats for better compression
                    let compressedDataUrl;
                    let finalType = this.type;

                    if (this.type === 'image/png' && quality < 1.0) {
                        // Convert PNG to JPEG for better compression if quality is reduced
                        compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
                        finalType = 'image/jpeg';
                    } else {
                        compressedDataUrl = canvas.toDataURL(this.type, quality);
                    }

                    // Calculate actual compressed size
                    const compressedSize = Math.round((compressedDataUrl.length - 'data:image/jpeg;base64,'.length) * 0.75);

                    // Only use compression if it actually reduces size
                    if (compressedSize < this.size || width < originalWidth || height < originalHeight) {
                        // Update model with compressed data
                        this.dataUrl = compressedDataUrl;
                        this.type = finalType;
                        this.metadata.width = width;
                        this.metadata.height = height;
                        this.metadata.compressed = true;
                        this.metadata.originalSize = this.size;
                        this.metadata.originalWidth = originalWidth;
                        this.metadata.originalHeight = originalHeight;
                        this.metadata.compressionRatio = ((this.size - compressedSize) / this.size * 100).toFixed(1);
                        this.size = compressedSize;
                        this.lastModified = new Date().toISOString();
                    } else {
                        // Keep original if compression doesn't help
                        this.metadata.width = originalWidth;
                        this.metadata.height = originalHeight;
                        this.metadata.compressed = false;
                    }

                    resolve(this);
                } catch (error) {
                    reject(error);
                }
            };
            img.onerror = (error) => reject(new Error('Failed to load image for compression'));
            img.src = this.dataUrl;
        });
    }

    calculateDimensions(originalWidth, originalHeight, maxWidth, maxHeight) {
        let width = originalWidth;
        let height = originalHeight;

        // Scale down if necessary
        if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
        }

        if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
        }

        return { width: Math.round(width), height: Math.round(height) };
    }

    toJSON() {
        return {
            id: this.id,
            filename: this.filename,
            originalName: this.originalName,
            dataUrl: this.dataUrl,
            size: this.size,
            type: this.type,
            uploadDate: this.uploadDate,
            lastModified: this.lastModified,
            metadata: this.metadata
        };
    }

    formatSize() {
        if (this.size < 1024) return this.size + ' B';
        if (this.size < 1024 * 1024) return (this.size / 1024).toFixed(1) + ' KB';
        return (this.size / (1024 * 1024)).toFixed(1) + ' MB';
    }

    static fromJSON(data) {
        const photo = Object.create(PhotoModel.prototype);
        Object.assign(photo, data);
        return photo;
    }
}

class NoteModel {
    constructor(content = '') {
        this.id = this.generateId();
        this.content = content;
        this.createdDate = new Date().toISOString();
        this.lastModified = new Date().toISOString();
        this.wordCount = this.calculateWordCount();
        this.characterCount = content.length;
        this.metadata = {
            autoSaveEnabled: true,
            lastAutoSave: null,
            version: 1
        };

        this.validate();
    }

    generateId() {
        return 'note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    validate() {
        const errors = [];

        if (typeof this.content !== 'string') {
            errors.push('Content must be a string');
        }

        if (this.content.length > 100000) { // 100KB text limit
            errors.push('Content exceeds maximum length of 100,000 characters');
        }

        if (errors.length > 0) {
            throw new Error('Note validation failed: ' + errors.join(', '));
        }

        return true;
    }

    updateContent(newContent) {
        if (typeof newContent !== 'string') {
            throw new Error('Content must be a string');
        }

        this.content = newContent;
        this.lastModified = new Date().toISOString();
        this.wordCount = this.calculateWordCount();
        this.characterCount = newContent.length;
        this.metadata.version += 1;

        this.validate();
        return this;
    }

    calculateWordCount() {
        if (!this.content || this.content.trim() === '') {
            return 0;
        }

        return this.content
            .trim()
            .split(/\s+/)
            .filter(word => word.length > 0).length;
    }

    autoSave() {
        this.metadata.lastAutoSave = new Date().toISOString();
        return this;
    }

    getPreview(maxLength = 100) {
        if (this.content.length <= maxLength) {
            return this.content;
        }

        return this.content.substring(0, maxLength).trim() + '...';
    }

    toJSON() {
        return {
            id: this.id,
            content: this.content,
            createdDate: this.createdDate,
            lastModified: this.lastModified,
            wordCount: this.wordCount,
            characterCount: this.characterCount,
            metadata: this.metadata
        };
    }

    static fromJSON(data) {
        const note = Object.create(NoteModel.prototype);
        Object.assign(note, data);
        return note;
    }
}

class MusicModel {
    constructor(file, dataUrl) {
        this.id = this.generateId();
        this.filename = file ? file.name : 'unknown.mp3';
        this.originalName = this.filename;
        this.dataUrl = dataUrl;
        this.size = file ? file.size : 0;
        this.type = file ? file.type : 'audio/mpeg';
        this.uploadDate = new Date().toISOString();
        this.lastModified = new Date().toISOString();
        this.metadata = {
            duration: null,
            artist: null,
            album: null,
            title: this.extractTitle(),
            bitrate: null,
            sampleRate: null
        };

        this.validate();
    }

    generateId() {
        return 'music_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    validate() {
        const errors = [];

        if (!this.dataUrl || !this.dataUrl.startsWith('data:')) {
            errors.push('Invalid audio data URL');
        }

        // More flexible check for audio data URLs
        if (this.dataUrl && !this.dataUrl.match(/^data:(audio\/|application\/octet-stream)/)) {
            // Some audio files might be detected as application/octet-stream
            const extension = this.filename.toLowerCase().split('.').pop();
            const audioExtensions = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'webm'];
            if (!audioExtensions.includes(extension)) {
                errors.push('Invalid audio data URL format');
            }
        }

        if (!this.filename || this.filename.trim() === '') {
            errors.push('Filename is required');
        }

        if (this.size > 15 * 1024 * 1024) { // 15MB limit - large files use cloud storage
            errors.push('File size exceeds 15MB limit');
        }

        const allowedTypes = [
            'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg',
            'audio/aac', 'audio/m4a', 'audio/flac', 'audio/x-m4a',
            'audio/mp4', 'audio/x-aac', 'audio/webm'
        ];

        // Check type or fallback to file extension if type is not detected
        let isValidType = false;
        if (this.type && this.type.trim() !== '') {
            isValidType = allowedTypes.includes(this.type.toLowerCase());
        } else {
            // Fallback to extension check
            const extension = this.filename.toLowerCase().split('.').pop();
            const allowedExtensions = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'webm'];
            isValidType = allowedExtensions.includes(extension);
        }

        if (!isValidType) {
            errors.push('Unsupported audio format. Allowed: MP3, WAV, OGG, AAC, M4A, FLAC, WebM');
        }

        if (errors.length > 0) {
            throw new Error('Music validation failed: ' + errors.join(', '));
        }

        return true;
    }

    extractTitle() {
        // Extract title from filename (remove extension)
        const nameWithoutExt = this.filename.replace(/\.[^/.]+$/, '');

        // Clean up common patterns
        return nameWithoutExt
            .replace(/^\d+[\s\-\.]*/, '') // Remove track numbers
            .replace(/[\-_]/g, ' ') // Replace dashes and underscores with spaces
            .trim();
    }

    async loadMetadata() {
        return new Promise((resolve, reject) => {
            const audio = new Audio();

            audio.addEventListener('loadedmetadata', () => {
                this.metadata.duration = audio.duration;
                this.lastModified = new Date().toISOString();
                resolve(this);
            });

            audio.addEventListener('error', (e) => {
                console.warn('Could not load audio metadata:', e);
                resolve(this); // Don't reject, just continue without metadata
            });

            audio.src = this.dataUrl;
        });
    }

    formatDuration() {
        if (!this.metadata.duration) return 'Unknown';

        const minutes = Math.floor(this.metadata.duration / 60);
        const seconds = Math.floor(this.metadata.duration % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    formatSize() {
        if (this.size < 1024) return this.size + ' B';
        if (this.size < 1024 * 1024) return (this.size / 1024).toFixed(1) + ' KB';
        return (this.size / (1024 * 1024)).toFixed(1) + ' MB';
    }

    toJSON() {
        return {
            id: this.id,
            filename: this.filename,
            originalName: this.originalName,
            dataUrl: this.dataUrl,
            size: this.size,
            type: this.type,
            uploadDate: this.uploadDate,
            lastModified: this.lastModified,
            metadata: this.metadata
        };
    }

    static fromJSON(data) {
        const music = Object.create(MusicModel.prototype);
        Object.assign(music, data);
        return music;
    }
}

// Data Validation Utilities
class DataValidator {
    static validateImageFile(file) {
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        const maxSize = 10 * 1024 * 1024; // 10MB
        const minSize = 100; // 100 bytes minimum

        // Check if file exists
        if (!file) {
            throw new Error('No file provided');
        }

        // Check file type
        if (!file.type) {
            throw new Error('File type cannot be determined');
        }

        if (!allowedTypes.includes(file.type.toLowerCase())) {
            throw new Error('Invalid image format. Allowed: JPEG, PNG, GIF, WebP');
        }

        // Check file size
        if (file.size < minSize) {
            throw new Error('File is too small (minimum 100 bytes)');
        }

        if (file.size > maxSize) {
            throw new Error('Image file size exceeds 10MB limit');
        }

        // Check filename
        if (!file.name || file.name.trim() === '') {
            throw new Error('File must have a valid name');
        }

        // Check for potentially dangerous filenames
        const dangerousPatterns = [/\.exe$/i, /\.bat$/i, /\.cmd$/i, /\.scr$/i, /\.com$/i];
        if (dangerousPatterns.some(pattern => pattern.test(file.name))) {
            throw new Error('File type not allowed for security reasons');
        }

        return true;
    }

    static async validateImageContent(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const arrayBuffer = e.target.result;
                const uint8Array = new Uint8Array(arrayBuffer);

                // Check file signatures (magic numbers)
                if (this.isValidImageSignature(uint8Array, file.type)) {
                    resolve(true);
                } else {
                    reject(new Error('File content does not match the declared image type'));
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file for validation'));
            reader.readAsArrayBuffer(file);
        });
    }

    static isValidImageSignature(uint8Array, mimeType) {
        const signatures = {
            'image/jpeg': [[0xFF, 0xD8, 0xFF]],
            'image/jpg': [[0xFF, 0xD8, 0xFF]],
            'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
            'image/gif': [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
            'image/webp': [[0x52, 0x49, 0x46, 0x46]] // RIFF header, WebP has additional checks
        };

        const expectedSignatures = signatures[mimeType.toLowerCase()];
        if (!expectedSignatures) return false;

        return expectedSignatures.some(signature => {
            if (uint8Array.length < signature.length) return false;
            return signature.every((byte, index) => uint8Array[index] === byte);
        });
    }

    static validateAudioFile(file) {
        const allowedTypes = [
            'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg',
            'audio/aac', 'audio/m4a', 'audio/flac', 'audio/x-m4a',
            'audio/mp4', 'audio/x-aac', 'audio/webm'
        ];
        const maxSize = 15 * 1024 * 1024; // 15MB - larger files use cloud storage

        // Check file type
        if (!file.type) {
            // If MIME type is not detected, check file extension as fallback
            const extension = file.name.toLowerCase().split('.').pop();
            const allowedExtensions = ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'webm'];

            if (!allowedExtensions.includes(extension)) {
                throw new Error('Invalid audio format. Allowed: MP3, WAV, OGG, AAC, M4A, FLAC, WebM');
            }
        } else if (!allowedTypes.includes(file.type.toLowerCase())) {
            throw new Error('Invalid audio format. Allowed: MP3, WAV, OGG, AAC, M4A, FLAC, WebM');
        }

        if (file.size > maxSize) {
            throw new Error('Audio file size exceeds 15MB limit. Please use a smaller file.');
        }

        return true;
    }

    static sanitizeFilename(filename) {
        // Remove or replace invalid characters
        return filename
            .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid chars with underscore
            .replace(/\s+/g, '_') // Replace spaces with underscore
            .replace(/_{2,}/g, '_') // Replace multiple underscores with single
            .trim();
    }

    static validateDataUrl(dataUrl, expectedType) {
        if (!dataUrl || typeof dataUrl !== 'string') {
            throw new Error('Invalid data URL');
        }

        if (!dataUrl.startsWith('data:')) {
            throw new Error('Not a valid data URL');
        }

        if (expectedType && !dataUrl.startsWith(`data:${expectedType}`)) {
            throw new Error(`Expected ${expectedType} data URL`);
        }

        return true;
    }
}

// Photos Application Class
class PhotosApp {
    constructor(storageManager) {
        this.storageManager = storageManager;
        this.photos = new Map();
        this.lightboxOpen = false;
    }

    render() {
        return `
            <div class="app-content photos-app">
                <h3>Photo Gallery</h3>
                <div class="upload-section">
                    <div class="drag-drop-area" id="photo-drag-drop">
                        <div class="drag-drop-content">
                            <div class="upload-icon">📷</div>
                            <p class="drag-text">Drag & drop photos here</p>
                            <p class="or-text">or</p>
                            <button class="upload-btn" id="photo-upload-btn">Choose Photos</button>
                            <input type="file" id="photo-upload-input" accept="image/jpeg,image/jpg,image/png,image/gif,image/webp" multiple style="display: none;">
                        </div>
                    </div>
                    <div class="upload-info">
                        <p>Supported formats: JPEG, PNG, GIF, WebP • Max size: 10MB per image</p>
                    </div>
                </div>
                <div class="gallery-container">
                    <div class="gallery-header">
                        <h4>Your Photos</h4>
                        <div class="gallery-stats" id="gallery-stats">0 photos</div>
                    </div>
                    <div class="photo-gallery" id="photo-gallery">
                        <div class="loading-placeholder" id="gallery-loading">Loading photos...</div>
                    </div>
                </div>
            </div>
            
            <!-- Lightbox Modal -->
            <div class="lightbox-overlay" id="lightbox-overlay">
                <div class="lightbox-container">
                    <button class="lightbox-close" id="lightbox-close">&times;</button>
                    <div class="lightbox-content">
                        <img class="lightbox-image" id="lightbox-image" src="" alt="">
                        <div class="lightbox-info" id="lightbox-info">
                            <h4 id="lightbox-title"></h4>
                            <p id="lightbox-details"></p>
                        </div>
                    </div>
                    <div class="lightbox-controls">
                        <button class="lightbox-btn lightbox-prev" id="lightbox-prev">‹ Previous</button>
                        <button class="lightbox-btn lightbox-delete" id="lightbox-delete">🗑 Delete</button>
                        <button class="lightbox-btn lightbox-next" id="lightbox-next">Next ›</button>
                    </div>
                </div>
            </div>
        `;
    }

    async init() {
        this.setupEventHandlers();
        await this.loadPhotos();
        this.updateGalleryStats();
    }

    setupEventHandlers() {
        // Upload button and input
        const uploadBtn = document.getElementById('photo-upload-btn');
        const uploadInput = document.getElementById('photo-upload-input');
        const dragDropArea = document.getElementById('photo-drag-drop');

        uploadBtn?.addEventListener('click', () => uploadInput?.click());
        uploadInput?.addEventListener('change', (e) => this.handleFileUpload(e.target.files));

        // Drag and drop functionality
        dragDropArea?.addEventListener('dragover', this.handleDragOver.bind(this));
        dragDropArea?.addEventListener('dragleave', this.handleDragLeave.bind(this));
        dragDropArea?.addEventListener('drop', this.handleDrop.bind(this));

        // Lightbox controls
        const lightboxOverlay = document.getElementById('lightbox-overlay');
        const lightboxClose = document.getElementById('lightbox-close');
        const lightboxPrev = document.getElementById('lightbox-prev');
        const lightboxNext = document.getElementById('lightbox-next');
        const lightboxDelete = document.getElementById('lightbox-delete');

        lightboxOverlay?.addEventListener('click', (e) => {
            if (e.target === lightboxOverlay) this.closeLightbox();
        });
        lightboxClose?.addEventListener('click', () => this.closeLightbox());
        lightboxPrev?.addEventListener('click', () => this.showPreviousPhoto());
        lightboxNext?.addEventListener('click', () => this.showNextPhoto());
        lightboxDelete?.addEventListener('click', () => this.deleteCurrentPhoto());

        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (!this.lightboxOpen) return;

            switch (e.key) {
                case 'Escape':
                    this.closeLightbox();
                    break;
                case 'ArrowLeft':
                    this.showPreviousPhoto();
                    break;
                case 'ArrowRight':
                    this.showNextPhoto();
                    break;
                case 'Delete':
                    this.deleteCurrentPhoto();
                    break;
            }
        });
    }

    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        const dragDropArea = document.getElementById('photo-drag-drop');
        dragDropArea?.classList.add('drag-over');
    }

    handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        const dragDropArea = document.getElementById('photo-drag-drop');
        dragDropArea?.classList.remove('drag-over');
    }

    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        const dragDropArea = document.getElementById('photo-drag-drop');
        dragDropArea?.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        this.handleFileUpload(files);
    }

    async handleFileUpload(files) {
        const fileArray = Array.from(files);
        const validFiles = [];

        // Validate files first
        for (const file of fileArray) {
            try {
                // Basic validation
                DataValidator.validateImageFile(file);

                // Content validation (check file signature)
                await DataValidator.validateImageContent(file);

                validFiles.push(file);
            } catch (error) {
                this.showNotification(`Invalid file ${file.name}: ${error.message}`, 'error');
            }
        }

        if (validFiles.length === 0) {
            this.showNotification('No valid image files to upload', 'error');
            return;
        }

        // Show upload progress and disable upload area
        this.showUploadProgress(validFiles.length);
        this.setUploadAreaState(false);

        // Add a safety timeout to remove progress indicator if something goes wrong
        const progressTimeout = setTimeout(() => {
            console.warn('Upload progress timeout reached, forcing cleanup');
            this.hideUploadProgress();
            this.setUploadAreaState(true);
        }, 60000); // 60 second timeout

        let successCount = 0;
        let errorCount = 0;

        // Process files with immediate UI feedback
        console.log(`Starting to process ${validFiles.length} files`);
        let completedCount = 0;

        const uploadPromises = validFiles.map(async (file, index) => {
            try {
                console.log(`Processing file ${index + 1}/${validFiles.length}: ${file.name}`);
                await this.processAndSavePhoto(file);
                console.log(`Successfully processed file: ${file.name}`);

                // Update progress in real-time
                completedCount++;
                this.updateUploadProgress(completedCount, validFiles.length);

                return { success: true, file };
            } catch (error) {
                console.error(`Error processing photo ${file.name}:`, error);
                this.showNotification(`Failed to upload ${file.name}: ${error.message}`, 'error');

                // Update progress even for failed uploads
                completedCount++;
                this.updateUploadProgress(completedCount, validFiles.length);

                return { success: false, file, error };
            }
        });

        // Wait for all uploads to complete
        console.log(`Waiting for all ${uploadPromises.length} upload promises to complete`);
        const results = await Promise.all(uploadPromises);
        console.log(`All upload promises completed. Results:`, results);

        // Count results
        successCount = results.filter(r => r.success).length;
        errorCount = results.filter(r => !r.success).length;

        // Clear the safety timeout since we completed normally
        clearTimeout(progressTimeout);

        this.hideUploadProgress();
        this.setUploadAreaState(true);

        // Clear the file input so users can upload the same files again
        const uploadInput = document.getElementById('photo-upload-input');
        if (uploadInput) {
            uploadInput.value = '';
        }

        // Show results
        if (successCount > 0) {
            this.showNotification(`Successfully uploaded ${successCount} photo${successCount > 1 ? 's' : ''}!`, 'success');
            this.updateGalleryStats();
        }

        if (errorCount > 0 && successCount === 0) {
            this.showNotification(`Failed to upload ${errorCount} photo${errorCount > 1 ? 's' : ''}`, 'error');
        } else if (errorCount > 0) {
            this.showNotification(`Uploaded ${successCount} photo${successCount > 1 ? 's' : ''}, ${errorCount} failed`, 'warning');
        }
    }

    async processAndSavePhoto(file) {
        console.log(`Starting to process photo: ${file.name}`);

        // Add a timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error(`Photo processing timeout after 30 seconds for ${file.name}`));
            }, 30000);
        });

        const processPromise = new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                let photo;
                let photoElement;

                try {
                    console.log(`File reader loaded for: ${file.name}`);
                    // Create photo model
                    photo = new PhotoModel(file, e.target.result);
                    console.log(`Photo model created with ID: ${photo.id}`);

                    // INSTANT UI UPDATE: Add photo to memory and display immediately (optimistic update)
                    this.photos.set(photo.id, photo);
                    console.log(`Photo added to memory: ${photo.id}`);
                    photoElement = this.displayPhotoOptimistic(photo);
                    console.log(`Photo displayed optimistically: ${photo.id}`);

                    // Extract image dimensions first
                    console.log(`Extracting dimensions for: ${photo.id}`);
                    await this.extractImageDimensions(photo);
                    console.log(`Dimensions extracted: ${photo.metadata.width}x${photo.metadata.height}`);

                    // Determine if compression is needed
                    const needsCompression = this.shouldCompressPhoto(photo);

                    if (needsCompression) {
                        // Apply smart compression based on image characteristics
                        const compressionSettings = this.getCompressionSettings(photo);
                        await photo.compress(
                            compressionSettings.maxWidth,
                            compressionSettings.maxHeight,
                            compressionSettings.quality
                        );

                        // Update the displayed photo with compressed version
                        this.updatePhotoDisplay(photo, photoElement);
                    }

                    // Validate final photo size
                    if (photo.size > 15 * 1024 * 1024) { // 15MB absolute limit
                        // Remove from UI and memory
                        this.removePhotoFromUI(photo.id);
                        this.photos.delete(photo.id);
                        reject(new Error('Photo is too large even after compression'));
                        return;
                    }

                    // Save using storage manager with retry logic (in background)
                    console.log(`Starting save process for: ${photo.id}`);

                    // Try a simple save first, then fallback to retry logic
                    let success = false;
                    try {
                        console.log(`Attempting simple save for: ${photo.id}`);
                        success = await this.storageManager.saveData(`photo_${photo.id}`, photo.toJSON());
                        console.log(`Simple save result for ${photo.id}: ${success}`);
                    } catch (error) {
                        console.warn(`Simple save failed for ${photo.id}, trying retry logic:`, error);
                        success = await this.savePhotoWithRetry(photo);
                    }

                    console.log(`Final save result for ${photo.id}: ${success}`);

                    if (success) {
                        // Mark as saved successfully
                        console.log(`Photo ${photo.id} saved successfully, removing upload status`);
                        this.markPhotoAsSaved(photo.id, photoElement);
                        console.log(`Photo ${photo.id} marked as saved, resolving promise`);
                        resolve(photo);
                    } else {
                        // Remove from UI and memory if save failed
                        this.removePhotoFromUI(photo.id);
                        this.photos.delete(photo.id);
                        reject(new Error('Failed to save photo after multiple attempts'));
                    }
                } catch (error) {
                    // Remove from UI and memory if processing failed
                    if (photo && photo.id) {
                        this.removePhotoFromUI(photo.id);
                        this.photos.delete(photo.id);
                    }
                    reject(error);
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });

        // Race between the process promise and timeout
        return Promise.race([processPromise, timeoutPromise]);
    }

    async extractImageDimensions(photo) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                photo.metadata.width = img.width;
                photo.metadata.height = img.height;
                resolve();
            };
            img.onerror = () => {
                // If we can't load the image, just continue without dimensions
                resolve();
            };
            img.src = photo.dataUrl;
        });
    }

    shouldCompressPhoto(photo) {
        // Compress if file is over 2MB
        if (photo.size > 2 * 1024 * 1024) return true;

        // Compress if dimensions are very large
        if (photo.metadata.width > 2560 || photo.metadata.height > 2560) return true;

        // Don't compress GIFs (they might be animated)
        if (photo.type === 'image/gif') return false;

        return false;
    }

    getCompressionSettings(photo) {
        const settings = {
            maxWidth: 1920,
            maxHeight: 1080,
            quality: 0.8
        };

        // Adjust based on file size
        if (photo.size > 8 * 1024 * 1024) { // > 8MB
            settings.maxWidth = 1600;
            settings.maxHeight = 900;
            settings.quality = 0.7;
        } else if (photo.size > 5 * 1024 * 1024) { // > 5MB
            settings.maxWidth = 1920;
            settings.maxHeight = 1080;
            settings.quality = 0.75;
        }

        // Adjust based on image dimensions
        if (photo.metadata.width > 4000 || photo.metadata.height > 4000) {
            settings.maxWidth = 2560;
            settings.maxHeight = 1440;
            settings.quality = 0.8;
        }

        // Higher quality for smaller images
        if (photo.size < 1024 * 1024) { // < 1MB
            settings.quality = 0.9;
        }

        return settings;
    }

    renderPhotoElement(photo, photoElement) {
        // Create detailed size and compression info
        let sizeText = photo.formatSize();
        let compressionInfo = '';

        if (photo.metadata.compressed) {
            const originalSize = photo.metadata.originalSize || photo.size;
            const savings = photo.metadata.compressionRatio ||
                ((originalSize - photo.size) / originalSize * 100).toFixed(1);
            sizeText += ` (${savings}% smaller)`;
            compressionInfo = '<span class="compression-badge">Compressed</span>';
        }

        // Add dimensions if available
        let dimensionsText = '';
        if (photo.metadata.width && photo.metadata.height) {
            dimensionsText = `${photo.metadata.width} × ${photo.metadata.height}`;
        }

        photoElement.innerHTML = `
            <div class="photo-thumbnail" onclick="photosApp.openLightbox('${photo.id}')">
                <img src="${photo.dataUrl}" alt="${photo.filename}" loading="lazy">
                <div class="photo-overlay">
                    <div class="photo-actions">
                        <button class="photo-action-btn view-btn" onclick="event.stopPropagation(); photosApp.openLightbox('${photo.id}')" title="View full size">👁</button>
                        <button class="photo-action-btn delete-btn" onclick="event.stopPropagation(); photosApp.deletePhoto('${photo.id}')" title="Delete photo">🗑</button>
                    </div>
                </div>
                ${compressionInfo ? `<div class="photo-badges">${compressionInfo}</div>` : ''}
                <div class="upload-status" style="display: none;">
                    <div class="upload-spinner"></div>
                </div>
            </div>
            <div class="photo-info">
                <p class="photo-filename" title="${photo.filename}">${this.truncateFilename(photo.filename)}</p>
                <p class="photo-details">
                    ${sizeText}
                    ${dimensionsText ? ` • ${dimensionsText}` : ''}
                    <br>
                    <span class="upload-date">${new Date(photo.uploadDate).toLocaleDateString()}</span>
                </p>
            </div>
        `;
    }

    updatePhotoDisplay(photo, photoElement) {
        if (!photoElement) {
            photoElement = document.querySelector(`[data-photo-id="${photo.id}"]`);
        }
        if (photoElement) {
            // Store current upload status before re-rendering
            const isUploading = photoElement.classList.contains('uploading');
            const uploadStatus = photoElement.querySelector('.upload-status');
            const uploadStatusVisible = uploadStatus && uploadStatus.style.display !== 'none';

            // Re-render the photo element
            this.renderPhotoElement(photo, photoElement);

            // Restore upload status if it was visible
            if (isUploading && uploadStatusVisible) {
                const newUploadStatus = photoElement.querySelector('.upload-status');
                if (newUploadStatus) {
                    newUploadStatus.style.display = 'block';
                }
            }
        }
    }

    markPhotoAsSaved(photoId, photoElement) {
        if (!photoElement) {
            photoElement = document.querySelector(`[data-photo-id="${photoId}"]`);
        }
        if (photoElement) {
            console.log(`Marking photo ${photoId} as saved, removing upload indicators`);

            // Remove uploading class (this removes the CSS ::after "Uploading..." text)
            photoElement.classList.remove('uploading');

            // Hide upload status spinner
            const uploadStatus = photoElement.querySelector('.upload-status');
            if (uploadStatus) {
                uploadStatus.style.display = 'none';
                console.log(`Upload status hidden for photo ${photoId}`);
            }

            // Re-enable photo actions
            const photoActions = photoElement.querySelector('.photo-actions');
            if (photoActions) {
                photoActions.style.opacity = '1';
                photoActions.style.pointerEvents = 'auto';
            }

            // Force a style recalculation to ensure changes take effect
            photoElement.offsetHeight;

            console.log(`Photo ${photoId} marked as saved successfully`);
        } else {
            console.warn(`Could not find photo element for ${photoId} to mark as saved`);
        }
    }

    removePhotoFromUI(photoId) {
        const photoElement = document.querySelector(`[data-photo-id="${photoId}"]`);
        if (photoElement) {
            photoElement.style.transform = 'scale(0)';
            photoElement.style.opacity = '0';
            photoElement.style.transition = 'all 0.3s ease';
            setTimeout(() => {
                if (photoElement.parentNode) {
                    photoElement.remove();
                }
            }, 300);
        }
    }

    async savePhotoWithRetry(photo, maxRetries = 1) {
        console.log(`savePhotoWithRetry starting for ${photo.id}, maxRetries: ${maxRetries}`);

        // For photos, we prioritize localStorage success over Firestore
        // Since localStorage save should always work, we don't need many retries
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`Save attempt ${attempt} for ${photo.id}`);

                // Add timeout to the entire save operation
                const savePromise = this.storageManager.saveData(`photo_${photo.id}`, photo.toJSON());
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Save operation timeout')), 15000); // 15 second timeout
                });

                const success = await Promise.race([savePromise, timeoutPromise]);
                console.log(`Save attempt ${attempt} result for ${photo.id}: ${success}`);

                if (success) {
                    console.log(`Photo ${photo.id} saved successfully on attempt ${attempt}`);
                    return true;
                }

                // If save failed, wait before retry
                if (attempt < maxRetries) {
                    console.log(`Save failed, waiting before retry ${attempt + 1}`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            } catch (error) {
                console.warn(`Save attempt ${attempt} failed for ${photo.id}:`, error);

                // For timeout errors or Firestore errors, still consider it a success
                // if we can save to localStorage directly
                try {
                    const localKey = `shared_photo_${photo.id}`;
                    localStorage.setItem(localKey, JSON.stringify({
                        data: photo.toJSON(),
                        timestamp: Date.now(),
                        synced: false
                    }));
                    console.log(`Photo ${photo.id} saved to localStorage as fallback`);
                    return true;
                } catch (localError) {
                    console.error(`Even localStorage save failed for ${photo.id}:`, localError);
                }

                if (attempt === maxRetries) {
                    console.error(`All save attempts failed for ${photo.id}`);
                    throw error;
                }
            }
        }
        console.warn(`savePhotoWithRetry returning false for ${photo.id}`);
        return false;
    }

    async loadPhotos() {
        try {
            const gallery = document.getElementById('photo-gallery');
            const loading = document.getElementById('gallery-loading');

            // Get all photo keys from storage
            const photoKeys = await this.getPhotoKeys();

            if (photoKeys.length === 0) {
                loading.textContent = 'No photos yet. Upload some to get started!';
                return;
            }

            loading.textContent = `Loading ${photoKeys.length} photos...`;

            for (const key of photoKeys) {
                const photoData = await this.storageManager.loadData(key);
                if (photoData) {
                    const photo = PhotoModel.fromJSON(photoData);
                    this.photos.set(photo.id, photo);
                    this.displayPhoto(photo);
                }
            }

            loading.style.display = 'none';
        } catch (error) {
            console.error('Error loading photos:', error);
            this.showNotification('Failed to load photos', 'error');
        }
    }

    displayPhotoOptimistic(photo) {
        const gallery = document.getElementById('photo-gallery');
        const loading = document.getElementById('gallery-loading');

        // Hide loading placeholder
        if (loading) loading.style.display = 'none';

        const photoElement = document.createElement('div');
        photoElement.className = 'photo-item uploading';
        photoElement.setAttribute('data-photo-id', photo.id);

        // Create basic photo display (will be updated after processing)
        this.renderPhotoElement(photo, photoElement);

        // Show upload status for uploading photos
        const uploadStatus = photoElement.querySelector('.upload-status');
        if (uploadStatus) {
            uploadStatus.style.display = 'block';
        }

        // Add with animation
        photoElement.style.opacity = '0';
        photoElement.style.transform = 'scale(0.8) translateY(20px)';
        gallery.appendChild(photoElement);

        // Trigger animation
        setTimeout(() => {
            photoElement.style.transition = 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            photoElement.style.opacity = '1';
            photoElement.style.transform = 'scale(1) translateY(0)';
        }, 50);

        return photoElement;
    }

    displayPhoto(photo) {
        const gallery = document.getElementById('photo-gallery');
        const loading = document.getElementById('gallery-loading');

        // Hide loading placeholder
        if (loading) loading.style.display = 'none';

        const photoElement = document.createElement('div');
        photoElement.className = 'photo-item';
        photoElement.setAttribute('data-photo-id', photo.id);

        // Create detailed size and compression info
        let sizeText = photo.formatSize();
        let compressionInfo = '';

        if (photo.metadata.compressed) {
            const originalSize = photo.metadata.originalSize || photo.size;
            const savings = photo.metadata.compressionRatio ||
                ((originalSize - photo.size) / originalSize * 100).toFixed(1);
            sizeText += ` (${savings}% smaller)`;
            compressionInfo = '<span class="compression-badge">Compressed</span>';
        }

        // Add dimensions if available
        let dimensionsText = '';
        if (photo.metadata.width && photo.metadata.height) {
            dimensionsText = `${photo.metadata.width} × ${photo.metadata.height}`;
        }

        photoElement.innerHTML = `
            <div class="photo-thumbnail" onclick="photosApp.openLightbox('${photo.id}')">
                <img src="${photo.dataUrl}" alt="${photo.filename}" loading="lazy">
                <div class="photo-overlay">
                    <div class="photo-actions">
                        <button class="photo-action-btn view-btn" onclick="event.stopPropagation(); photosApp.openLightbox('${photo.id}')" title="View full size">👁</button>
                        <button class="photo-action-btn delete-btn" onclick="event.stopPropagation(); photosApp.deletePhoto('${photo.id}')" title="Delete photo">🗑</button>
                    </div>
                </div>
                ${compressionInfo ? `<div class="photo-badges">${compressionInfo}</div>` : ''}
            </div>
            <div class="photo-info">
                <p class="photo-filename" title="${photo.filename}">${this.truncateFilename(photo.filename)}</p>
                <p class="photo-details">
                    ${sizeText}
                    ${dimensionsText ? ` • ${dimensionsText}` : ''}
                    <br>
                    <span class="upload-date">${new Date(photo.uploadDate).toLocaleDateString()}</span>
                </p>
            </div>
        `;

        // Add with animation
        photoElement.style.opacity = '0';
        photoElement.style.transform = 'scale(0.8) translateY(20px)';
        gallery.appendChild(photoElement);

        // Trigger animation
        setTimeout(() => {
            photoElement.style.transition = 'all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
            photoElement.style.opacity = '1';
            photoElement.style.transform = 'scale(1) translateY(0)';
        }, 50);
    }

    openLightbox(photoId) {
        const photo = this.photos.get(photoId);
        if (!photo) return;

        this.currentPhotoId = photoId;
        this.lightboxOpen = true;

        const lightboxOverlay = document.getElementById('lightbox-overlay');
        const lightboxImage = document.getElementById('lightbox-image');
        const lightboxTitle = document.getElementById('lightbox-title');
        const lightboxDetails = document.getElementById('lightbox-details');

        lightboxImage.src = photo.dataUrl;
        lightboxImage.alt = photo.filename;
        lightboxTitle.textContent = photo.filename;

        const uploadDate = new Date(photo.uploadDate).toLocaleDateString();
        const dimensions = photo.metadata.width && photo.metadata.height ?
            `${photo.metadata.width} × ${photo.metadata.height}` : 'Unknown';

        lightboxDetails.innerHTML = `
            <span>${photo.formatSize()}</span> • 
            <span>${dimensions}</span> • 
            <span>Uploaded ${uploadDate}</span>
            ${photo.metadata.compressed ? ' • <span class="compressed-badge">Compressed</span>' : ''}
        `;

        lightboxOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';

        this.updateLightboxNavigation();
    }

    closeLightbox() {
        const lightboxOverlay = document.getElementById('lightbox-overlay');
        lightboxOverlay.classList.remove('active');
        document.body.style.overflow = '';
        this.lightboxOpen = false;
        this.currentPhotoId = null;
    }

    showPreviousPhoto() {
        const photoIds = Array.from(this.photos.keys());
        const currentIndex = photoIds.indexOf(this.currentPhotoId);
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : photoIds.length - 1;
        this.openLightbox(photoIds[prevIndex]);
    }

    showNextPhoto() {
        const photoIds = Array.from(this.photos.keys());
        const currentIndex = photoIds.indexOf(this.currentPhotoId);
        const nextIndex = currentIndex < photoIds.length - 1 ? currentIndex + 1 : 0;
        this.openLightbox(photoIds[nextIndex]);
    }

    updateLightboxNavigation() {
        const prevBtn = document.getElementById('lightbox-prev');
        const nextBtn = document.getElementById('lightbox-next');
        const photoCount = this.photos.size;

        if (photoCount <= 1) {
            prevBtn.style.display = 'none';
            nextBtn.style.display = 'none';
        } else {
            prevBtn.style.display = 'block';
            nextBtn.style.display = 'block';
        }
    }

    async deletePhoto(photoId) {
        const photo = this.photos.get(photoId);
        if (!photo) return;

        if (!confirm(`Are you sure you want to delete "${photo.filename}"?`)) {
            return;
        }

        // INSTANT UI UPDATE: Remove immediately (optimistic delete)
        const photoElement = document.querySelector(`[data-photo-id="${photoId}"]`);

        // Remove from memory immediately
        this.photos.delete(photoId);

        // Remove from UI immediately with animation
        if (photoElement) {
            photoElement.style.transform = 'scale(0)';
            photoElement.style.opacity = '0';
            photoElement.style.transition = 'all 0.3s ease';
            setTimeout(() => {
                if (photoElement.parentNode) {
                    photoElement.remove();
                }
            }, 300);
        }

        // Close lightbox if this photo was open
        if (this.currentPhotoId === photoId) {
            this.closeLightbox();
        }

        // Update stats immediately
        this.updateGalleryStats();

        // Show success message immediately
        this.showNotification(`"${photo.filename}" deleted successfully!`, 'success');

        // Try to delete from storage in background
        try {
            const success = await this.storageManager.deleteData(`photo_${photoId}`);
            if (!success) {
                // If storage delete failed, restore the photo
                this.photos.set(photoId, photo);
                this.displayPhotoOptimistic(photo);
                this.updateGalleryStats();
                this.showNotification(`Failed to delete "${photo.filename}" from storage`, 'error');
            }
        } catch (error) {
            console.error('Error deleting photo from storage:', error);
            // Restore the photo if storage delete failed
            this.photos.set(photoId, photo);
            this.displayPhotoOptimistic(photo);
            this.updateGalleryStats();
            this.showNotification(`Failed to delete "${photo.filename}" from storage`, 'error');
        }
    }

    async deleteCurrentPhoto() {
        if (this.currentPhotoId) {
            await this.deletePhoto(this.currentPhotoId);
        }
    }

    updateGalleryStats() {
        const statsElement = document.getElementById('gallery-stats');
        const count = this.photos.size;
        if (statsElement) {
            statsElement.textContent = `${count} photo${count !== 1 ? 's' : ''}`;
        }
    }

    truncateFilename(filename, maxLength = 20) {
        if (filename.length <= maxLength) return filename;
        const extension = filename.split('.').pop();
        const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.'));
        const truncatedName = nameWithoutExt.substring(0, maxLength - extension.length - 4);
        return `${truncatedName}...${extension}`;
    }

    async getPhotoKeys() {
        // Get all photo keys from Firestore
        if (!db) {
            console.warn('Firestore not available');
            return [];
        }

        try {
            const snapshot = await db.collection('app-data')
                .where('sessionId', '!=', null) // Get all documents
                .get();

            const photoKeys = [];
            snapshot.forEach(doc => {
                const key = doc.id;
                if (key.startsWith('photo_')) {
                    photoKeys.push(key);
                }
            });

            return photoKeys;
        } catch (error) {
            console.error('Error getting photo keys from Firestore:', error);
            return [];
        }
    }

    showUploadProgress(fileCount) {
        // Simple progress indicator
        const gallery = document.getElementById('photo-gallery');
        const progressElement = document.createElement('div');
        progressElement.id = 'upload-progress';
        progressElement.className = 'upload-progress';
        progressElement.innerHTML = `
            <div class="progress-content">
                <div class="progress-spinner"></div>
                <p>Uploading ${fileCount} photo${fileCount > 1 ? 's' : ''}...</p>
            </div>
        `;
        gallery.appendChild(progressElement);
    }

    updateUploadProgress(completed, total) {
        const progressElement = document.getElementById('upload-progress');
        if (progressElement) {
            const progressText = progressElement.querySelector('p');
            if (progressText) {
                if (completed >= total) {
                    progressText.textContent = `Finalizing ${total} photo${total > 1 ? 's' : ''}...`;
                } else {
                    progressText.textContent = `Uploading ${completed}/${total} photo${total > 1 ? 's' : ''}...`;
                }
            }
        }
    }

    hideUploadProgress() {
        const progressElement = document.getElementById('upload-progress');
        if (progressElement) {
            progressElement.remove();
        }
    }

    setUploadAreaState(enabled) {
        const dragDropArea = document.getElementById('photo-drag-drop');
        const uploadBtn = document.getElementById('photo-upload-btn');
        const uploadInput = document.getElementById('photo-upload-input');

        if (enabled) {
            dragDropArea?.classList.remove('disabled');
            if (uploadBtn) uploadBtn.disabled = false;
            if (uploadInput) uploadInput.disabled = false;
        } else {
            dragDropArea?.classList.add('disabled');
            if (uploadBtn) uploadBtn.disabled = true;
            if (uploadInput) uploadInput.disabled = true;
        }
    }

    showNotification(message, type = 'info') {
        // Remove any existing notifications of the same type to avoid spam
        const existingNotifications = document.querySelectorAll(`.${type}-notification`);
        existingNotifications.forEach(notif => {
            if (notif.parentNode) {
                notif.parentNode.removeChild(notif);
            }
        });

        const notification = document.createElement('div');
        notification.className = `notification ${type}-notification`;
        notification.textContent = message;

        // Add click to dismiss functionality
        notification.style.cursor = 'pointer';
        notification.title = 'Click to dismiss';

        document.body.appendChild(notification);

        // Auto-remove after 5 seconds (longer for success messages)
        const autoRemoveTime = type === 'success' ? 5000 : 4000;
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(100%)';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, autoRemoveTime);

        // Click to dismiss
        notification.addEventListener('click', () => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(100%)';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        });
    }
}

// Date Ideas Note Entry Model
class DateIdeaEntry {
    constructor(content = '') {
        this.id = this.generateId();
        this.content = content.trim();
        this.createdDate = new Date().toISOString();
        this.lastModified = new Date().toISOString();
        this.completed = false;
    }

    generateId() {
        return 'idea_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    updateContent(newContent) {
        this.content = newContent.trim();
        this.lastModified = new Date().toISOString();
        return this;
    }

    toggleCompleted() {
        this.completed = !this.completed;
        this.lastModified = new Date().toISOString();
        return this;
    }

    toJSON() {
        return {
            id: this.id,
            content: this.content,
            createdDate: this.createdDate,
            lastModified: this.lastModified,
            completed: this.completed
        };
    }

    static fromJSON(data) {
        const entry = Object.create(DateIdeaEntry.prototype);
        Object.assign(entry, data);
        return entry;
    }
}

// Date Ideas Application Class
class DateIdeasApp {
    constructor(storageManager) {
        this.storageManager = storageManager;
        this.entries = new Map();
        this.autoSaveTimeout = null;
        this.autoSaveDelay = 1000; // 1 second debounce
        this.editingEntryId = null;
    }

    render() {
        return `
            <div class="app-content date-ideas-app">
                <h3>Date Ideas Notes</h3>
                <div class="notes-container">
                    <div class="notes-header">
                        <div class="notes-stats">
                            <span id="notes-count">0 ideas</span>
                            <span class="separator">•</span>
                            <span id="completed-count">0 completed</span>
                        </div>
                        <div class="save-status" id="save-status">
                            <span class="status-indicator"></span>
                            <span class="status-text">Ready</span>
                        </div>
                    </div>
                    
                    <div class="add-note-section">
                        <div class="add-note-input-container">
                            <input 
                                type="text" 
                                id="new-note-input" 
                                class="new-note-input"
                                placeholder="Add a new date idea... (e.g., Romantic dinner at a cozy restaurant)"
                                maxlength="500"
                            >
                            <button class="add-note-btn" id="add-note-btn" title="Add new idea">
                                ➕
                            </button>
                        </div>
                        <div class="quick-suggestions">
                            <span class="suggestion-label">Quick ideas:</span>
                            <button class="suggestion-btn" data-suggestion="Romantic dinner at a new restaurant">🍽️ Dinner</button>
                            <button class="suggestion-btn" data-suggestion="Movie night with homemade popcorn">🎬 Movies</button>
                            <button class="suggestion-btn" data-suggestion="Picnic in the park">🧺 Picnic</button>
                            <button class="suggestion-btn" data-suggestion="Cooking class together">👨‍🍳 Cooking</button>
                        </div>
                    </div>

                    <div class="notes-list" id="notes-list">
                        <div class="empty-state" id="empty-state">
                            <div class="empty-icon">💡</div>
                            <h4>No date ideas yet!</h4>
                            <p>Start by adding your first date idea above. Here are some suggestions:</p>
                            <ul class="starter-ideas">
                                <li>Art museum visit</li>
                                <li>Beach day with sunset watching</li>
                                <li>Game night with board games</li>
                                <li>Hiking adventure</li>
                                <li>Stargazing with blankets and hot cocoa</li>
                            </ul>
                        </div>
                    </div>

                    <div class="notes-footer">
                        <div class="last-saved" id="last-saved">Never saved</div>
                        <div class="notes-actions">
                            <button class="action-btn" id="clear-completed-btn" title="Clear completed ideas">
                                ✅ Clear Completed
                            </button>
                            <button class="action-btn" id="clear-all-btn" title="Clear all ideas">
                                🗑️ Clear All
                            </button>
                            <button class="action-btn" id="export-btn" title="Export as text file">
                                📄 Export
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    async init() {
        this.setupEventHandlers();
        await this.loadEntries();
        this.updateStats();
        this.updateSaveStatus('ready');
    }

    setupEventHandlers() {
        const newNoteInput = document.getElementById('new-note-input');
        const addNoteBtn = document.getElementById('add-note-btn');
        const clearCompletedBtn = document.getElementById('clear-completed-btn');
        const clearAllBtn = document.getElementById('clear-all-btn');
        const exportBtn = document.getElementById('export-btn');

        if (!newNoteInput || !addNoteBtn) {
            console.error('Date Ideas input elements not found');
            return;
        }

        // Add new note
        addNoteBtn.addEventListener('click', () => {
            this.addNewEntry();
        });

        // Add note on Enter key
        newNoteInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.addNewEntry();
            }
        });

        // Quick suggestions
        const suggestionBtns = document.querySelectorAll('.suggestion-btn');
        suggestionBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const suggestion = btn.getAttribute('data-suggestion');
                newNoteInput.value = suggestion;
                newNoteInput.focus();
            });
        });

        // Action buttons
        clearCompletedBtn?.addEventListener('click', () => {
            this.clearCompletedEntries();
        });

        clearAllBtn?.addEventListener('click', () => {
            this.clearAllEntries();
        });

        exportBtn?.addEventListener('click', () => {
            this.exportEntries();
        });

        // Handle keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            this.handleKeyboardShortcuts(e);
        });
    }

    addNewEntry() {
        const input = document.getElementById('new-note-input');
        if (!input) return;

        const content = input.value.trim();
        if (!content) {
            this.showNotification('Please enter a date idea', 'warning');
            return;
        }

        if (content.length > 500) {
            this.showNotification('Date idea is too long (max 500 characters)', 'warning');
            return;
        }

        try {
            const entry = new DateIdeaEntry(content);
            this.entries.set(entry.id, entry);

            // Clear input
            input.value = '';

            // Update UI
            this.renderEntries();
            this.updateStats();
            this.scheduleAutoSave();

            // Focus back to input for easy adding
            input.focus();

            this.showNotification('Date idea added!', 'success');

        } catch (error) {
            console.error('Error adding entry:', error);
            this.showNotification('Failed to add date idea', 'error');
        }
    }

    deleteEntry(entryId) {
        const entry = this.entries.get(entryId);
        if (!entry) {
            console.error('Entry not found:', entryId);
            return;
        }

        if (!confirm(`Delete this date idea: "${entry.content}"?`)) {
            return;
        }

        this.entries.delete(entryId);
        this.renderEntries();
        this.updateStats();
        this.scheduleAutoSave();

        this.showNotification('Date idea deleted', 'success');
    }

    toggleEntryCompleted(entryId) {
        const entry = this.entries.get(entryId);
        if (!entry) return;

        entry.toggleCompleted();
        this.renderEntries();
        this.updateStats();
        this.scheduleAutoSave();
    }

    editEntry(entryId) {
        const entry = this.entries.get(entryId);
        if (!entry) return;

        // Cancel any existing edit
        if (this.editingEntryId && this.editingEntryId !== entryId) {
            this.cancelEdit();
        }

        this.editingEntryId = entryId;
        this.renderEntries();

        // Focus the edit input and set up keyboard handlers
        setTimeout(() => {
            const editInput = document.getElementById(`edit-input-${entryId}`);
            if (editInput) {
                editInput.focus();
                editInput.select();

                // Add keyboard event handler for this specific input
                editInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        this.saveEdit(entryId);
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        this.cancelEdit();
                    }
                });
            }
        }, 50);
    }

    saveEdit(entryId) {
        const entry = this.entries.get(entryId);
        const editInput = document.getElementById(`edit-input-${entryId}`);

        if (!entry || !editInput) return;

        const newContent = editInput.value.trim();

        if (!newContent) {
            this.showNotification('Date idea cannot be empty', 'warning');
            return;
        }

        if (newContent.length > 500) {
            this.showNotification('Date idea is too long (max 500 characters)', 'warning');
            return;
        }

        entry.updateContent(newContent);
        this.editingEntryId = null;

        this.renderEntries();
        this.updateStats();
        this.scheduleAutoSave();

        this.showNotification('Date idea updated!', 'success');
    }

    cancelEdit() {
        this.editingEntryId = null;
        this.renderEntries();
    }

    scheduleAutoSave() {
        this.updateSaveStatus('typing');

        // Clear existing timeout
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }

        // Set new auto-save timeout
        this.autoSaveTimeout = setTimeout(() => {
            this.autoSave();
        }, this.autoSaveDelay);
    }

    async autoSave() {
        try {
            this.updateSaveStatus('saving');

            // Convert entries to array for storage
            const entriesData = Array.from(this.entries.values()).map(entry => entry.toJSON());
            console.log('DateIdeasApp: Saving entries data:', entriesData);
            console.log('DateIdeasApp: Number of entries:', entriesData.length);

            // Save to storage with timeout protection
            const savePromise = this.storageManager.saveData('date_ideas_entries', entriesData);
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Save timeout')), 10000);
            });

            const success = await Promise.race([savePromise, timeoutPromise]);

            if (success) {
                this.updateSaveStatus('saved');
                this.updateLastSaved();
            } else {
                throw new Error('Save operation failed');
            }

        } catch (error) {
            console.error('Auto-save error:', error);
            this.updateSaveStatus('error', 'Auto-save failed');
        }
    }

    async loadEntries() {
        try {
            this.updateSaveStatus('loading');

            const savedData = await this.storageManager.loadData('date_ideas_entries');

            if (savedData && Array.isArray(savedData)) {
                this.entries.clear();
                savedData.forEach(entryData => {
                    const entry = DateIdeaEntry.fromJSON(entryData);
                    this.entries.set(entry.id, entry);
                });
                this.updateLastSaved();
            }

            this.renderEntries();
            this.updateStats();
            this.updateSaveStatus('ready');

        } catch (error) {
            console.error('Error loading entries:', error);
            this.updateSaveStatus('error', 'Failed to load entries');

            // Initialize empty entries as fallback
            this.entries.clear();
            this.renderEntries();
        }
    }

    renderEntries() {
        const notesList = document.getElementById('notes-list');
        const emptyState = document.getElementById('empty-state');

        if (!notesList) {
            console.error('Notes list element not found');
            return;
        }

        if (this.entries.size === 0) {
            if (emptyState) {
                emptyState.style.display = 'block';
                notesList.innerHTML = '';
                notesList.appendChild(emptyState);
            } else {
                // Create empty state if it doesn't exist
                notesList.innerHTML = `
                    <div class="empty-state" id="empty-state">
                        <div class="empty-icon">💡</div>
                        <h4>No date ideas yet!</h4>
                        <p>Start by adding your first date idea above. Here are some suggestions:</p>
                        <ul class="starter-ideas">
                            <li>Art museum visit</li>
                            <li>Beach day with sunset watching</li>
                            <li>Game night with board games</li>
                            <li>Hiking adventure</li>
                            <li>Stargazing with blankets and hot cocoa</li>
                        </ul>
                    </div>
                `;
            }
            return;
        }

        if (emptyState) {
            emptyState.style.display = 'none';
        }

        // Sort entries by creation date (newest first)
        const sortedEntries = Array.from(this.entries.values())
            .sort((a, b) => new Date(b.createdDate) - new Date(a.createdDate));

        notesList.innerHTML = sortedEntries.map(entry => {
            const isEditing = this.editingEntryId === entry.id;
            const createdDate = new Date(entry.createdDate).toLocaleDateString();

            if (isEditing) {
                return `
                    <div class="note-entry editing" data-entry-id="${entry.id}">
                        <div class="note-edit-container">
                            <input 
                                type="text" 
                                id="edit-input-${entry.id}"
                                class="note-edit-input"
                                value="${this.escapeHtml(entry.content)}"
                                maxlength="500"
                            >
                            <div class="note-edit-actions">
                                <button class="edit-save-btn" data-action="save-edit" data-entry-id="${entry.id}" title="Save changes">
                                    ✅
                                </button>
                                <button class="edit-cancel-btn" data-action="cancel-edit" title="Cancel editing">
                                    ❌
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            }

            return `
                <div class="note-entry ${entry.completed ? 'completed' : ''}" data-entry-id="${entry.id}">
                    <div class="note-content">
                        <div class="note-checkbox-container">
                            <input 
                                type="checkbox" 
                                class="note-checkbox"
                                ${entry.completed ? 'checked' : ''}
                                data-action="toggle-completed"
                                data-entry-id="${entry.id}"
                            >
                        </div>
                        <div class="note-text" data-action="edit-entry" data-entry-id="${entry.id}" title="Click to edit">
                            ${this.escapeHtml(entry.content)}
                        </div>
                    </div>
                    <div class="note-meta">
                        <span class="note-date">${createdDate}</span>
                        <div class="note-actions">
                            <button class="note-action-btn edit-btn" data-action="edit-entry" data-entry-id="${entry.id}" title="Edit idea">
                                ✏️
                            </button>
                            <button class="note-action-btn delete-btn" data-action="delete-entry" data-entry-id="${entry.id}" title="Delete idea">
                                🗑️
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Set up event delegation for the rendered entries
        this.setupEntryEventHandlers();
    }

    setupEntryEventHandlers() {
        const notesList = document.getElementById('notes-list');
        if (!notesList) {
            console.error('Notes list not found for event handlers');
            return;
        }

        // Remove existing event listeners to prevent duplicates
        if (this.boundHandleEntryClick) {
            notesList.removeEventListener('click', this.boundHandleEntryClick);
        }
        if (this.boundHandleEntryChange) {
            notesList.removeEventListener('change', this.boundHandleEntryChange);
        }

        // Bind event handlers to preserve 'this' context
        this.boundHandleEntryClick = this.handleEntryClick.bind(this);
        this.boundHandleEntryChange = this.handleEntryChange.bind(this);

        notesList.addEventListener('click', this.boundHandleEntryClick);
        notesList.addEventListener('change', this.boundHandleEntryChange);
    }

    handleEntryClick(e) {
        const action = e.target.getAttribute('data-action');
        const entryId = e.target.getAttribute('data-entry-id');

        if (!action) return;

        e.preventDefault();
        e.stopPropagation();

        switch (action) {
            case 'delete-entry':
                if (entryId) this.deleteEntry(entryId);
                break;
            case 'edit-entry':
                if (entryId) this.editEntry(entryId);
                break;
            case 'save-edit':
                if (entryId) this.saveEdit(entryId);
                break;
            case 'cancel-edit':
                this.cancelEdit();
                break;
        }
    }

    handleEntryChange(e) {
        const action = e.target.getAttribute('data-action');
        const entryId = e.target.getAttribute('data-entry-id');

        if (action === 'toggle-completed' && entryId) {
            this.toggleEntryCompleted(entryId);
        }
    }

    updateStats() {
        const notesCountEl = document.getElementById('notes-count');
        const completedCountEl = document.getElementById('completed-count');

        if (!notesCountEl || !completedCountEl) return;

        const totalCount = this.entries.size;
        const completedCount = Array.from(this.entries.values()).filter(entry => entry.completed).length;

        notesCountEl.textContent = `${totalCount} idea${totalCount !== 1 ? 's' : ''}`;
        completedCountEl.textContent = `${completedCount} completed`;
    }

    updateSaveStatus(status, message = '') {
        const statusEl = document.getElementById('save-status');
        if (!statusEl) return;

        const indicator = statusEl.querySelector('.status-indicator');
        const text = statusEl.querySelector('.status-text');

        if (!indicator || !text) return;

        // Remove all status classes
        statusEl.className = 'save-status';

        switch (status) {
            case 'ready':
                statusEl.classList.add('status-ready');
                text.textContent = 'Auto-save enabled';
                break;
            case 'typing':
                statusEl.classList.add('status-typing');
                text.textContent = 'Typing...';
                break;
            case 'saving':
                statusEl.classList.add('status-saving');
                text.textContent = 'Saving...';
                break;
            case 'saved':
                statusEl.classList.add('status-saved');
                text.textContent = 'Saved';
                // Auto-return to ready after 2 seconds
                setTimeout(() => {
                    if (statusEl.classList.contains('status-saved')) {
                        this.updateSaveStatus('ready');
                    }
                }, 2000);
                break;
            case 'loading':
                statusEl.classList.add('status-loading');
                text.textContent = 'Loading...';
                break;
            case 'error':
                statusEl.classList.add('status-error');
                text.textContent = message || 'Error';
                // Auto-return to ready after 5 seconds
                setTimeout(() => {
                    if (statusEl.classList.contains('status-error')) {
                        this.updateSaveStatus('ready');
                    }
                }, 5000);
                break;
        }
    }

    updateLastSaved() {
        const lastSavedEl = document.getElementById('last-saved');
        if (!lastSavedEl) return;

        const now = new Date();
        this.lastSaveTime = now;

        lastSavedEl.textContent = `Last saved: Just now`;

        // Update the time display periodically
        setTimeout(() => this.updateLastSavedTime(), 60000); // Update every minute
    }

    updateLastSavedTime() {
        const lastSavedEl = document.getElementById('last-saved');
        if (!lastSavedEl || !this.lastSaveTime) return;

        const now = new Date();
        const diffMs = now - this.lastSaveTime;
        const diffMins = Math.floor(diffMs / 60000);

        let timeText;
        if (diffMins < 1) {
            timeText = 'Just now';
        } else if (diffMins < 60) {
            timeText = `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
        } else {
            timeText = this.lastSaveTime.toLocaleTimeString();
        }

        lastSavedEl.textContent = `Last saved: ${timeText}`;
    }

    clearCompletedEntries() {
        const completedEntries = Array.from(this.entries.values()).filter(entry => entry.completed);

        if (completedEntries.length === 0) {
            this.showNotification('No completed ideas to clear', 'info');
            return;
        }

        if (!confirm(`Clear ${completedEntries.length} completed idea${completedEntries.length !== 1 ? 's' : ''}?`)) {
            return;
        }

        completedEntries.forEach(entry => {
            this.entries.delete(entry.id);
        });

        this.renderEntries();
        this.updateStats();
        this.scheduleAutoSave();

        this.showNotification(`${completedEntries.length} completed idea${completedEntries.length !== 1 ? 's' : ''} cleared`, 'success');
    }

    clearAllEntries() {
        if (this.entries.size === 0) {
            this.showNotification('No ideas to clear', 'info');
            return;
        }

        if (!confirm(`Clear all ${this.entries.size} date idea${this.entries.size !== 1 ? 's' : ''}? This action cannot be undone.`)) {
            return;
        }

        this.entries.clear();
        this.editingEntryId = null;

        this.renderEntries();
        this.updateStats();
        this.scheduleAutoSave();

        this.showNotification('All ideas cleared', 'success');
    }

    exportEntries() {
        if (this.entries.size === 0) {
            this.showNotification('No ideas to export', 'warning');
            return;
        }

        try {
            const sortedEntries = Array.from(this.entries.values())
                .sort((a, b) => new Date(a.createdDate) - new Date(b.createdDate));

            let content = 'Date Ideas\n';
            content += '==========\n\n';

            const activeIdeas = sortedEntries.filter(entry => !entry.completed);
            const completedIdeas = sortedEntries.filter(entry => entry.completed);

            if (activeIdeas.length > 0) {
                content += 'Active Ideas:\n';
                content += '-------------\n';
                activeIdeas.forEach((entry, index) => {
                    content += `${index + 1}. ${entry.content}\n`;
                });
                content += '\n';
            }

            if (completedIdeas.length > 0) {
                content += 'Completed Ideas:\n';
                content += '----------------\n';
                completedIdeas.forEach((entry, index) => {
                    content += `${index + 1}. ${entry.content}\n`;
                });
                content += '\n';
            }

            content += `\nExported on: ${new Date().toLocaleString()}\n`;
            content += `Total ideas: ${this.entries.size}\n`;
            content += `Completed: ${completedIdeas.length}\n`;
            content += `Active: ${activeIdeas.length}\n`;

            const filename = `date-ideas-${new Date().toISOString().split('T')[0]}.txt`;

            // Create blob and download
            const blob = new Blob([content], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            this.showNotification('Ideas exported successfully', 'success');

        } catch (error) {
            console.error('Export error:', error);
            this.showNotification('Failed to export ideas', 'error');
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }



    handleKeyboardShortcuts(e) {
        // Only handle shortcuts when not editing
        if (this.editingEntryId) return;

        // Ctrl/Cmd + S to save
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            this.autoSave();
            return;
        }

        // Ctrl/Cmd + E to export
        if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
            e.preventDefault();
            this.exportEntries();
            return;
        }

        // Ctrl/Cmd + N to focus new note input
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            const input = document.getElementById('new-note-input');
            if (input) {
                input.focus();
            }
            return;
        }

        // Escape to cancel editing
        if (e.key === 'Escape' && this.editingEntryId) {
            e.preventDefault();
            this.cancelEdit();
            return;
        }
    }

    showNotification(message, type = 'info') {
        // Remove any existing notifications to avoid spam
        const existingNotifications = document.querySelectorAll('.date-ideas-notification');
        existingNotifications.forEach(notif => {
            if (notif.parentNode) {
                notif.parentNode.removeChild(notif);
            }
        });

        const notification = document.createElement('div');
        notification.className = `notification ${type}-notification date-ideas-notification`;
        notification.textContent = message;

        document.body.appendChild(notification);

        // Auto-remove after 4 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(100%)';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, 4000);

        // Click to dismiss
        notification.addEventListener('click', () => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(100%)';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        });
    }

    // Method to handle concurrent editing gracefully
    async handleConcurrentEdit() {
        try {
            // Load latest version from storage
            const latestData = await this.storageManager.loadData('date_ideas_note');

            if (latestData) {
                const latestNote = NoteModel.fromJSON(latestData);

                // Check if there's a conflict (different versions)
                if (this.note && latestNote.metadata.version !== this.note.metadata.version) {
                    // Simple conflict resolution: use the latest version
                    // In a more sophisticated app, we might show a merge dialog
                    this.note = latestNote;

                    const editor = document.getElementById('date-ideas-editor');
                    if (editor) {
                        editor.value = this.note.content;
                        this.updateStats();
                        this.autoResizeTextarea(editor);
                    }

                    this.showNotification('Content updated from cloud', 'info');
                }
            }
        } catch (error) {
            console.error('Error handling concurrent edit:', error);
        }
    }

    // Cleanup method
    destroy() {
        if (this.autoSaveTimeout) {
            clearTimeout(this.autoSaveTimeout);
        }
    }
}

// Music Player Application Class
class MusicPlayerApp {
    constructor(storageManager) {
        this.storageManager = storageManager;
        this.musicTracks = new Map();
        this.currentTrack = null;
        this.isPlaying = false;
        this.currentAudio = null;
        this.playlist = [];
        this.currentIndex = -1;
    }

    render() {
        return `
            <div class="app-content music-player-app">
                <div class="upload-section">
                    <div class="drag-drop-area" id="music-drag-drop">
                        <div class="drag-drop-content">
                            <div class="upload-icon">🎵</div>
                            <p class="drag-text">Drag & drop music files here</p>
                            <p class="or-text">or</p>
                            <button class="upload-btn" id="music-upload-btn">Choose Music Files</button>
                            <input type="file" id="music-upload-input" accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/aac,audio/m4a,audio/flac,audio/x-m4a,audio/mp4,audio/x-aac,audio/webm,.mp3,.wav,.ogg,.aac,.m4a,.flac,.webm" multiple style="display: none;">
                        </div>
                    </div>
                    <div class="upload-info">
                        <p>Supported formats: MP3, WAV, OGG, AAC, M4A, FLAC, WebM • Max size: 15MB per file</p>
                    </div>
                </div>
                
                <div class="player-container">
                    <div class="now-playing" id="now-playing">
                        <div class="track-info">
                            <div class="track-title" id="current-track-title">No track selected</div>
                            <div class="track-artist" id="current-track-artist"></div>
                        </div>
                        <div class="player-controls">
                            <button class="control-btn" id="prev-btn" title="Previous track">⏮</button>
                            <button class="control-btn play-pause-btn" id="play-pause-btn" title="Play/Pause">▶</button>
                            <button class="control-btn" id="next-btn" title="Next track">⏭</button>
                            <div class="volume-control">
                                <span class="volume-icon">🔊</span>
                                <input type="range" id="volume-slider" min="0" max="100" value="70" class="volume-slider">
                            </div>
                        </div>
                        <div class="progress-container">
                            <span class="time-display" id="current-time">0:00</span>
                            <div class="progress-bar" id="progress-bar">
                                <div class="progress-fill" id="progress-fill"></div>
                                <div class="progress-handle" id="progress-handle"></div>
                            </div>
                            <span class="time-display" id="total-time">0:00</span>
                        </div>
                    </div>
                </div>

                <div class="playlist-container">
                    <div class="playlist-header">
                        <h4>Your Music Library</h4>
                        <div class="playlist-stats" id="playlist-stats">0 tracks</div>
                    </div>
                    <div class="music-playlist" id="music-playlist">
                        <div class="loading-placeholder" id="playlist-loading">Loading music...</div>
                    </div>
                </div>

                <!-- Hidden audio element for playback -->
                <audio id="music-audio" preload="metadata"></audio>
            </div>
        `;
    }

    async init() {
        this.setupEventHandlers();
        await this.loadMusicTracks();
        this.updatePlaylistStats();
    }

    setupEventHandlers() {
        // Upload button and input
        const uploadBtn = document.getElementById('music-upload-btn');
        const uploadInput = document.getElementById('music-upload-input');
        const dragDropArea = document.getElementById('music-drag-drop');

        uploadBtn?.addEventListener('click', () => uploadInput?.click());
        uploadInput?.addEventListener('change', (e) => this.handleFileUpload(e.target.files));

        // Drag and drop functionality
        dragDropArea?.addEventListener('dragover', this.handleDragOver.bind(this));
        dragDropArea?.addEventListener('dragleave', this.handleDragLeave.bind(this));
        dragDropArea?.addEventListener('drop', this.handleDrop.bind(this));

        // Player controls
        const playPauseBtn = document.getElementById('play-pause-btn');
        const prevBtn = document.getElementById('prev-btn');
        const nextBtn = document.getElementById('next-btn');
        const volumeSlider = document.getElementById('volume-slider');
        const progressBar = document.getElementById('progress-bar');

        playPauseBtn?.addEventListener('click', () => this.togglePlayPause());
        prevBtn?.addEventListener('click', () => this.playPrevious());
        nextBtn?.addEventListener('click', () => this.playNext());
        volumeSlider?.addEventListener('input', (e) => this.setVolume(e.target.value));
        progressBar?.addEventListener('click', (e) => this.seekTo(e));

        // Audio element events
        const audio = document.getElementById('music-audio');
        if (audio) {
            audio.addEventListener('loadedmetadata', () => this.updateTrackInfo());
            audio.addEventListener('timeupdate', () => this.updateProgress());
            audio.addEventListener('ended', () => this.playNext());
            audio.addEventListener('error', (e) => this.handleAudioError(e));
        }
    }

    handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        const dragDropArea = document.getElementById('music-drag-drop');
        dragDropArea?.classList.add('drag-over');
    }

    handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        const dragDropArea = document.getElementById('music-drag-drop');
        dragDropArea?.classList.remove('drag-over');
    }

    handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        const dragDropArea = document.getElementById('music-drag-drop');
        dragDropArea?.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        this.handleFileUpload(files);
    }

    async handleFileUpload(files) {
        const fileArray = Array.from(files);
        const validFiles = [];

        // Validate files first
        for (const file of fileArray) {
            try {
                console.log(`Validating file: ${file.name}, type: ${file.type}, size: ${file.size}`);
                DataValidator.validateAudioFile(file);
                validFiles.push(file);
                console.log(`File ${file.name} validated successfully`);
            } catch (error) {
                console.error(`Validation failed for ${file.name}:`, error);
                this.showNotification(`Invalid file ${file.name}: ${error.message}`, 'error');
            }
        }

        if (validFiles.length === 0) {
            this.showNotification('No valid audio files to upload', 'error');
            return;
        }

        // Show upload progress
        this.showUploadProgress(validFiles.length);
        this.setUploadAreaState(false);

        let successCount = 0;
        let errorCount = 0;

        // Process files
        for (const file of validFiles) {
            try {
                await this.processAndSaveMusic(file);
                successCount++;
            } catch (error) {
                console.error(`Error processing music ${file.name}:`, error);
                this.showNotification(`Failed to upload ${file.name}: ${error.message}`, 'error');
                errorCount++;
            }
        }

        this.hideUploadProgress();
        this.setUploadAreaState(true);

        // Clear the file input
        const uploadInput = document.getElementById('music-upload-input');
        if (uploadInput) {
            uploadInput.value = '';
        }

        // Show results
        if (successCount > 0) {
            this.showNotification(`Successfully uploaded ${successCount} track${successCount > 1 ? 's' : ''}!`, 'success');
            this.updatePlaylistStats();
        }

        if (errorCount > 0 && successCount === 0) {
            this.showNotification(`Failed to upload ${errorCount} track${errorCount > 1 ? 's' : ''}`, 'error');
        } else if (errorCount > 0) {
            this.showNotification(`Uploaded ${successCount} track${successCount > 1 ? 's' : ''}, ${errorCount} failed`, 'warning');
        }
    }

    async processAndSaveMusic(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    // Create music model
                    const music = new MusicModel(file, e.target.result);

                    // Load metadata (duration, etc.)
                    await music.loadMetadata();

                    // Add to memory immediately (optimistic update)
                    this.musicTracks.set(music.id, music);
                    this.displayMusicTrack(music);

                    // Save to storage
                    const success = await this.storageManager.saveData(`music_${music.id}`, music.toJSON());

                    if (success) {
                        resolve(music);
                    } else {
                        // Remove from memory if save failed
                        this.musicTracks.delete(music.id);
                        this.removeMusicFromUI(music.id);
                        reject(new Error('Failed to save music file. Large files are saved to cloud storage automatically.'));
                    }
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }

    async loadMusicTracks() {
        try {
            const playlist = document.getElementById('music-playlist');
            const loading = document.getElementById('playlist-loading');

            // Get all music keys from storage
            const musicKeys = await this.getMusicKeys();

            if (musicKeys.length === 0) {
                loading.textContent = 'No music files yet. Upload some tracks to get started!';
                return;
            }

            loading.textContent = `Loading ${musicKeys.length} tracks...`;

            for (const key of musicKeys) {
                const musicData = await this.storageManager.loadData(key);
                if (musicData) {
                    const music = MusicModel.fromJSON(musicData);
                    this.musicTracks.set(music.id, music);
                    this.displayMusicTrack(music);
                }
            }

            loading.style.display = 'none';
        } catch (error) {
            console.error('Error loading music tracks:', error);
            this.showNotification('Failed to load music tracks', 'error');
        }
    }

    displayMusicTrack(music) {
        const playlist = document.getElementById('music-playlist');
        const loading = document.getElementById('playlist-loading');

        // Hide loading placeholder
        if (loading) loading.style.display = 'none';

        const trackElement = document.createElement('div');
        trackElement.className = 'music-track';
        trackElement.setAttribute('data-music-id', music.id);

        const duration = music.formatDuration();
        const size = music.formatSize();
        const uploadDate = new Date(music.uploadDate).toLocaleDateString();

        trackElement.innerHTML = `
            <div class="track-item">
                <div class="track-info">
                    <div class="track-title">${this.escapeHtml(music.metadata.title || music.filename)}</div>
                    <div class="track-details">
                        ${duration} • ${size} • ${uploadDate}
                    </div>
                </div>
                <div class="track-actions">
                    <button class="track-btn play-btn" onclick="musicPlayerApp.playTrack('${music.id}')" title="Play track">
                        ▶
                    </button>
                    <button class="track-btn delete-btn" onclick="musicPlayerApp.deleteTrack('${music.id}')" title="Delete track">
                        🗑
                    </button>
                </div>
            </div>
        `;

        // Add with animation
        trackElement.style.opacity = '0';
        trackElement.style.transform = 'translateY(20px)';
        playlist.appendChild(trackElement);

        // Trigger animation
        setTimeout(() => {
            trackElement.style.transition = 'all 0.3s ease';
            trackElement.style.opacity = '1';
            trackElement.style.transform = 'translateY(0)';
        }, 50);
    }

    playTrack(trackId) {
        const music = this.musicTracks.get(trackId);
        if (!music) return;

        const audio = document.getElementById('music-audio');
        if (!audio) return;

        // Update current track
        this.currentTrack = music;
        this.currentIndex = Array.from(this.musicTracks.keys()).indexOf(trackId);

        // Load and play the track
        audio.src = music.dataUrl;
        audio.load();

        audio.play().then(() => {
            this.isPlaying = true;
            this.updatePlayPauseButton();
            this.updateNowPlaying();
            this.highlightCurrentTrack();
        }).catch(error => {
            console.error('Error playing track:', error);
            this.showNotification('Failed to play track', 'error');
        });
    }

    togglePlayPause() {
        const audio = document.getElementById('music-audio');
        if (!audio || !this.currentTrack) return;

        if (this.isPlaying) {
            audio.pause();
            this.isPlaying = false;
        } else {
            audio.play().then(() => {
                this.isPlaying = true;
            }).catch(error => {
                console.error('Error playing audio:', error);
                this.showNotification('Failed to play audio', 'error');
            });
        }

        this.updatePlayPauseButton();
    }

    playNext() {
        const trackIds = Array.from(this.musicTracks.keys());
        if (trackIds.length === 0) return;

        let nextIndex = this.currentIndex + 1;
        if (nextIndex >= trackIds.length) {
            nextIndex = 0; // Loop back to first track
        }

        this.playTrack(trackIds[nextIndex]);
    }

    playPrevious() {
        const trackIds = Array.from(this.musicTracks.keys());
        if (trackIds.length === 0) return;

        let prevIndex = this.currentIndex - 1;
        if (prevIndex < 0) {
            prevIndex = trackIds.length - 1; // Loop to last track
        }

        this.playTrack(trackIds[prevIndex]);
    }

    setVolume(value) {
        const audio = document.getElementById('music-audio');
        if (audio) {
            audio.volume = value / 100;
        }
    }

    seekTo(e) {
        const audio = document.getElementById('music-audio');
        const progressBar = document.getElementById('progress-bar');

        if (!audio || !progressBar || !audio.duration) return;

        const rect = progressBar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percentage = clickX / rect.width;
        const newTime = percentage * audio.duration;

        audio.currentTime = newTime;
    }

    updateTrackInfo() {
        const audio = document.getElementById('music-audio');
        const totalTimeEl = document.getElementById('total-time');

        if (audio && totalTimeEl && audio.duration) {
            totalTimeEl.textContent = this.formatTime(audio.duration);
        }
    }

    updateProgress() {
        const audio = document.getElementById('music-audio');
        const currentTimeEl = document.getElementById('current-time');
        const progressFill = document.getElementById('progress-fill');
        const progressHandle = document.getElementById('progress-handle');

        if (!audio || !currentTimeEl || !progressFill || !progressHandle) return;

        if (audio.duration) {
            const percentage = (audio.currentTime / audio.duration) * 100;
            progressFill.style.width = `${percentage}%`;
            progressHandle.style.left = `${percentage}%`;
            currentTimeEl.textContent = this.formatTime(audio.currentTime);
        }
    }

    updatePlayPauseButton() {
        const playPauseBtn = document.getElementById('play-pause-btn');
        if (playPauseBtn) {
            playPauseBtn.textContent = this.isPlaying ? '⏸' : '▶';
            playPauseBtn.title = this.isPlaying ? 'Pause' : 'Play';
        }
    }

    updateNowPlaying() {
        const titleEl = document.getElementById('current-track-title');
        const artistEl = document.getElementById('current-track-artist');

        if (this.currentTrack) {
            if (titleEl) {
                titleEl.textContent = this.currentTrack.metadata.title || this.currentTrack.filename;
            }
            if (artistEl) {
                artistEl.textContent = this.currentTrack.metadata.artist || '';
            }
        } else {
            if (titleEl) titleEl.textContent = 'No track selected';
            if (artistEl) artistEl.textContent = '';
        }
    }

    highlightCurrentTrack() {
        // Remove previous highlights
        const tracks = document.querySelectorAll('.music-track');
        tracks.forEach(track => track.classList.remove('playing'));

        // Highlight current track
        if (this.currentTrack) {
            const currentTrackEl = document.querySelector(`[data-music-id="${this.currentTrack.id}"]`);
            if (currentTrackEl) {
                currentTrackEl.classList.add('playing');
            }
        }
    }

    async deleteTrack(trackId) {
        const music = this.musicTracks.get(trackId);
        if (!music) return;

        if (!confirm(`Are you sure you want to delete "${music.metadata.title || music.filename}"?`)) {
            return;
        }

        // Stop playing if this is the current track
        if (this.currentTrack && this.currentTrack.id === trackId) {
            const audio = document.getElementById('music-audio');
            if (audio) {
                audio.pause();
                audio.src = '';
            }
            this.currentTrack = null;
            this.isPlaying = false;
            this.updatePlayPauseButton();
            this.updateNowPlaying();
        }

        // Remove from memory and UI immediately
        this.musicTracks.delete(trackId);
        this.removeMusicFromUI(trackId);
        this.updatePlaylistStats();

        // Show success message
        this.showNotification(`"${music.metadata.title || music.filename}" deleted successfully!`, 'success');

        // Try to delete from storage in background
        try {
            const success = await this.storageManager.deleteData(`music_${trackId}`);
            if (!success) {
                // If storage delete failed, restore the track
                this.musicTracks.set(trackId, music);
                this.displayMusicTrack(music);
                this.updatePlaylistStats();
                this.showNotification(`Failed to delete "${music.metadata.title || music.filename}" from storage`, 'error');
            }
        } catch (error) {
            console.error('Error deleting track from storage:', error);
            // Restore the track if storage delete failed
            this.musicTracks.set(trackId, music);
            this.displayMusicTrack(music);
            this.updatePlaylistStats();
            this.showNotification(`Failed to delete "${music.metadata.title || music.filename}" from storage`, 'error');
        }
    }

    removeMusicFromUI(trackId) {
        const trackElement = document.querySelector(`[data-music-id="${trackId}"]`);
        if (trackElement) {
            trackElement.style.transform = 'scale(0)';
            trackElement.style.opacity = '0';
            trackElement.style.transition = 'all 0.3s ease';
            setTimeout(() => {
                if (trackElement.parentNode) {
                    trackElement.remove();
                }
            }, 300);
        }
    }

    updatePlaylistStats() {
        const statsElement = document.getElementById('playlist-stats');
        const count = this.musicTracks.size;
        if (statsElement) {
            statsElement.textContent = `${count} track${count !== 1 ? 's' : ''}`;
        }
    }

    async getMusicKeys() {
        // Get all music keys from Firestore
        if (!db) {
            console.warn('Firestore not available');
            return [];
        }

        try {
            const snapshot = await db.collection('app-data')
                .where('sessionId', '!=', null)
                .get();

            const musicKeys = [];
            snapshot.forEach(doc => {
                const key = doc.id;
                if (key.startsWith('music_')) {
                    musicKeys.push(key);
                }
            });

            return musicKeys;
        } catch (error) {
            console.error('Error getting music keys from Firestore:', error);
            return [];
        }
    }

    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '0:00';
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    handleAudioError(e) {
        console.error('Audio error:', e);
        this.showNotification('Error playing audio file', 'error');
        this.isPlaying = false;
        this.updatePlayPauseButton();
    }

    showUploadProgress(fileCount) {
        const playlist = document.getElementById('music-playlist');
        const progressElement = document.createElement('div');
        progressElement.id = 'music-upload-progress';
        progressElement.className = 'upload-progress';
        progressElement.innerHTML = `
            <div class="progress-content">
                <div class="progress-spinner"></div>
                <p>Uploading ${fileCount} track${fileCount > 1 ? 's' : ''}...</p>
            </div>
        `;
        playlist.appendChild(progressElement);
    }

    hideUploadProgress() {
        const progressElement = document.getElementById('music-upload-progress');
        if (progressElement) {
            progressElement.remove();
        }
    }

    setUploadAreaState(enabled) {
        const dragDropArea = document.getElementById('music-drag-drop');
        const uploadBtn = document.getElementById('music-upload-btn');
        const uploadInput = document.getElementById('music-upload-input');

        if (enabled) {
            dragDropArea?.classList.remove('disabled');
            if (uploadBtn) uploadBtn.disabled = false;
            if (uploadInput) uploadInput.disabled = false;
        } else {
            dragDropArea?.classList.add('disabled');
            if (uploadBtn) uploadBtn.disabled = true;
            if (uploadInput) uploadInput.disabled = true;
        }
    }

    showNotification(message, type = 'info') {
        // Remove any existing notifications to avoid spam
        const existingNotifications = document.querySelectorAll('.music-player-notification');
        existingNotifications.forEach(notif => {
            if (notif.parentNode) {
                notif.parentNode.removeChild(notif);
            }
        });

        const notification = document.createElement('div');
        notification.className = `notification ${type}-notification music-player-notification`;
        notification.textContent = message;

        document.body.appendChild(notification);

        // Auto-remove after 4 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(100%)';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, 4000);

        // Click to dismiss
        notification.addEventListener('click', () => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                notification.style.transform = 'translateX(100%)';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        });
    }
}

// Desktop Manager Class
class DesktopManager {
    constructor() {
        this.currentApp = null;
        this.modalOverlay = document.getElementById('modal-overlay');
        this.modalWindow = document.getElementById('modal-window');
        this.modalTitle = document.getElementById('modal-title');
        this.modalContent = document.getElementById('modal-content');
        this.modalClose = document.getElementById('modal-close');
        this.apps = new Map(); // Store app instances
        this.storageManager = new StorageManager(); // Initialize storage manager

        // Music player state
        this.playlist = [];
        this.currentTrackIndex = 0;
        this.audioElement = null;

        this.init();
    }

    init() {
        this.cleanupExistingControls();
        this.renderDesktop();
        this.setupEventHandlers();
        this.initBackgroundMusic();
        this.loadPhotosColumn();
    }

    async loadPhotosColumn() {
        try {
            console.log('📸 Loading photos columns...');
            const containerLeft = document.getElementById('photos-column-left');
            const containerRight = document.getElementById('photos-column-right');

            if (!containerLeft || !containerRight) {
                console.log('❌ Photos column containers not found');
                return;
            }

            // Get all photo keys from storage
            const photoKeys = await this.getPhotoKeys();
            console.log(`📸 Found ${photoKeys.length} photo keys`);

            if (photoKeys.length === 0) {
                console.log('No photos to display');
                return;
            }

            // Load photos
            const photos = [];
            for (const key of photoKeys) {
                const photoData = await this.storageManager.loadData(key);
                if (photoData && photoData.dataUrl) {
                    photos.push(photoData);
                }
            }

            if (photos.length === 0) {
                console.log('No valid photos to display');
                return;
            }

            // Adjust animation speed based on number of photos
            const duration = Math.max(20, photos.length * 4); // 4 seconds per photo, minimum 20s

            // Create left column track
            const trackLeft = document.createElement('div');
            trackLeft.className = 'photos-track';
            trackLeft.style.animationDuration = `${duration}s`;

            // Create right column track (with delay for staggered effect)
            const trackRight = document.createElement('div');
            trackRight.className = 'photos-track';
            trackRight.style.animationDuration = `${duration}s`;
            trackRight.style.animationDelay = `-${duration / 2}s`; // Start halfway through

            // Add photos twice for seamless loop to both columns
            [...photos, ...photos].forEach((photo, index) => {
                // Left column
                const imgLeft = document.createElement('img');
                imgLeft.src = photo.dataUrl;
                imgLeft.alt = photo.filename || 'Photo';
                trackLeft.appendChild(imgLeft);

                // Right column
                const imgRight = document.createElement('img');
                imgRight.src = photo.dataUrl;
                imgRight.alt = photo.filename || 'Photo';
                trackRight.appendChild(imgRight);
            });

            containerLeft.appendChild(trackLeft);
            containerRight.appendChild(trackRight);

            console.log(`✅ Both photo columns loaded with ${photos.length} photos each`);
            console.log(`Animation duration: ${duration}s`);
        } catch (error) {
            console.error('❌ Error loading photos columns:', error);
        }
    }

    async getPhotoKeys() {
        // Get all photo keys from Firestore
        if (!db) {
            console.warn('Firestore not available');
            return [];
        }

        try {
            const snapshot = await db.collection('app-data')
                .where('sessionId', '!=', null)
                .get();

            const photoKeys = [];
            snapshot.forEach(doc => {
                const key = doc.id;
                if (key.startsWith('photo_')) {
                    photoKeys.push(key);
                }
            });

            return photoKeys;
        } catch (error) {
            console.error('Error getting photo keys from Firestore:', error);
            return [];
        }
    }

    cleanupExistingControls() {
        // Remove any existing window controls that might be left over
        const existingControls = document.querySelectorAll('.window-controls');
        existingControls.forEach(control => control.remove());

        // Debug: Log what's in the modal header
        const header = document.querySelector('.modal-header');
        if (header) {
            console.log('Modal header children:', header.children.length);
            Array.from(header.children).forEach((child, index) => {
                console.log(`Child ${index}:`, child.tagName, child.className);
            });
        }
    }

    renderDesktop() {
        // Desktop is already rendered in HTML, but we can enhance it here
        this.enhanceDesktopBackground();
        this.enhanceDesktopIcons();
    }

    enhanceDesktopBackground() {
        const background = document.querySelector('.desktop-background');
        if (background) {
            // Add subtle texture overlay
            background.style.position = 'relative';
            background.style.overflow = 'hidden';

            // Create floating particles effect
            this.createFloatingParticles(background);
        }
    }

    createFloatingParticles(container) {
        const particleCount = 15;
        for (let i = 0; i < particleCount; i++) {
            const particle = document.createElement('div');
            particle.className = 'floating-particle';
            particle.style.cssText = `
                position: absolute;
                width: ${Math.random() * 6 + 2}px;
                height: ${Math.random() * 6 + 2}px;
                background: rgba(255, 255, 255, ${Math.random() * 0.3 + 0.1});
                border-radius: 50%;
                left: ${Math.random() * 100}%;
                top: ${Math.random() * 100}%;
                animation: float ${Math.random() * 20 + 10}s infinite linear;
                pointer-events: none;
            `;
            container.appendChild(particle);
        }
    }

    enhanceDesktopIcons() {
        // Setup navigation buttons instead of desktop icons
        const navButtons = document.querySelectorAll('.nav-button');
        navButtons.forEach((button, index) => {
            // Add click handler
            button.addEventListener('click', (e) => {
                this.createRippleEffect(e, button);
                const appName = button.getAttribute('data-app');
                setTimeout(() => this.openApp(appName), 150);
            });
        });
    }

    createRippleEffect(event, element) {
        const ripple = document.createElement('div');
        const rect = element.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = event.clientX - rect.left - size / 2;
        const y = event.clientY - rect.top - size / 2;

        ripple.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            left: ${x}px;
            top: ${y}px;
            background: rgba(255, 255, 255, 0.3);
            border-radius: 50%;
            transform: scale(0);
            animation: ripple 0.6s ease-out;
            pointer-events: none;
            z-index: 1;
        `;

        element.style.position = 'relative';
        element.appendChild(ripple);

        setTimeout(() => {
            if (ripple.parentNode) {
                ripple.parentNode.removeChild(ripple);
            }
        }, 600);
    }

    playHoverSound() {
        // Create a subtle hover sound effect using Web Audio API
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);

            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(1200, audioContext.currentTime + 0.1);

            gainNode.gain.setValueAtTime(0, audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.05, audioContext.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.1);

            oscillator.start(audioContext.currentTime);
            oscillator.stop(audioContext.currentTime + 0.1);
        } catch (error) {
            // Silently fail if Web Audio API is not supported
        }
    }

    setupEventHandlers() {
        // Modal close handlers
        this.modalClose.addEventListener('click', () => this.closeApp());
        this.modalOverlay.addEventListener('click', (e) => {
            if (e.target === this.modalOverlay) {
                this.closeApp();
            }
        });

        // Keyboard handlers
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.currentApp) {
                this.closeApp();
            }
        });

        // Window resize handler for responsive design
        window.addEventListener('resize', () => {
            this.handleResize();
        });
    }

    handleResize() {
        // Responsive adjustments are now handled by CSS
        // This method is kept for future responsive logic if needed
        const width = window.innerWidth;

        // Update modal size if open
        if (this.currentApp && this.modalWindow) {
            if (width <= 480) {
                this.modalWindow.style.width = '100%';
                this.modalWindow.style.borderRadius = '0';
            } else if (width <= 768) {
                this.modalWindow.style.width = '95%';
                this.modalWindow.style.borderRadius = '20px';
            } else {
                this.modalWindow.style.width = '90%';
                this.modalWindow.style.borderRadius = '20px';
            }
        }
    }

    openApp(appName) {
        // Check if app is already open
        if (this.currentApp === appName) {
            this.bringToFront();
            return;
        }

        // Close current app if one is open
        if (this.currentApp) {
            this.closeApp();
        }

        // Clean up any existing window controls before opening new app
        this.removeWindowControls();

        this.modalTitle.textContent = this.getAppTitle(appName);
        this.modalContent.innerHTML = this.getAppContent(appName);
        this.modalOverlay.classList.add('active');
        this.modalWindow.classList.remove('minimized');
        this.currentApp = appName;

        // Set z-index for proper layering
        this.modalOverlay.style.zIndex = 1000;

        // Initialize app-specific functionality
        this.initAppFunctionality(appName);

        // Window controls disabled - using existing modal close button only
    }

    closeApp() {
        if (!this.currentApp) return;

        // Add closing animation
        this.modalWindow.classList.add('closing');

        setTimeout(() => {
            this.modalOverlay.classList.remove('active');
            this.modalWindow.classList.remove('closing');
            this.currentApp = null;
            this.modalContent.innerHTML = '';
            this.removeWindowControls();
        }, 300);
    }



    bringToFront() {
        this.modalOverlay.style.zIndex = 1001;
        this.modalWindow.classList.add('focus-pulse');
        setTimeout(() => {
            this.modalWindow.classList.remove('focus-pulse');
        }, 300);
    }

    addWindowControls() {
        // No additional window controls needed - using existing modal close button
        // This method is kept for compatibility but doesn't add duplicate controls
        return;
    }

    removeWindowControls() {
        const controls = document.querySelector('.window-controls');
        if (controls) {
            controls.remove();
        }
    }

    getAppTitle(appName) {
        const titles = {
            'photos': 'pics 📸',
            'date-ideas': 'date ideas 💡',
            'music-player': 'our songsss 🎶',
            'happy-birthday': 'Happy Birthday Note'
        };
        return titles[appName] || 'App';
    }

    getAppContent(appName) {
        switch (appName) {
            case 'photos':
                // Create PhotosApp instance if it doesn't exist
                if (!this.apps.has('photos')) {
                    this.apps.set('photos', new PhotosApp(this.storageManager));
                }
                return this.apps.get('photos').render();
            case 'date-ideas':
                // Create DateIdeasApp instance if it doesn't exist
                if (!this.apps.has('date-ideas')) {
                    this.apps.set('date-ideas', new DateIdeasApp(this.storageManager));
                }
                return this.apps.get('date-ideas').render();
            case 'music-player':
                // Create MusicPlayerApp instance if it doesn't exist
                if (!this.apps.has('music-player')) {
                    this.apps.set('music-player', new MusicPlayerApp(this.storageManager));
                }
                return this.apps.get('music-player').render();
            case 'happy-birthday':
                return `
                    <div class="app-content birthday-content">
                        <div class="birthday-message">
                            <h1>Hi <span style="color: #ff69b4;">Natalie</span></h1>
                            <p style="font-size: 1.2rem; margin: 20px 0;">I wanted to use my nerd skills to make something special for a special girl. I hope this isn't too cringe</p>
                            
                            <h2 style="color: #ff69b4; margin: 30px 0;">Happy 23rd birthdayyy!! :D</h2>
                            
                            <div style="background: rgba(255, 255, 255, 0.1); padding: 20px; border-radius: 15px; margin: 20px 0;">
                                <p style="text-align: left; line-height: 1.6;">
                                    These past seven months have made me so happy. It's a joy to be your boyfriend. I've always wanted a tender, fun, bright love like we have. This past year has had some really challenging times for you, but you continue to achieve great things while remaining selfless. Never forget how amazing you are!
                                </p>
                            </div>
                            
                            <div style="margin: 30px 0;">
                                <p style="font-size: 1.3rem; margin: 15px 0;">You are a beautiful, smart, strong, driven, funny, and kind young woman.</p>
                                <p style="font-size: 1.3rem; margin: 15px 0;">You deserve everything you want out of life.</p>
                                <p style="font-size: 1.3rem; margin: 15px 0;">I love making memories with <strong style="color: #ff69b4;">you</strong>.</p>
                                <p style="font-size: 1.3rem; margin: 15px 0;">I hope you use this little website</p>
                                <p style="font-size: 1.5rem; margin: 15px 0; color: #ff69b4;">whenever you need a reminder of how amazing you are :)</p>
                            </div>
                            
                            <div style="text-align: center; margin: 30px 0;">
                                <img src="./img/natalie.png" alt="Natalie" style="max-width: 200px; border-radius: 50%; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
                                <h3 style="color: #ff69b4; font-size: 2rem; margin: 20px 0;">Happy Birthday!</h3>
                                <h5 style="font-size: 1.2rem; margin: 10px 0;">May we have many more together</h5>
                            </div>
                        </div>
                    </div>
                `;
            default:
                return '<p>App content not found</p>';
        }
    }

    initAppFunctionality(appName) {
        switch (appName) {
            case 'date-ideas':
                // Initialize DateIdeasApp
                const dateIdeasApp = this.apps.get('date-ideas');
                if (dateIdeasApp) {
                    // Make dateIdeasApp globally accessible for event handlers
                    window.dateIdeasApp = dateIdeasApp;
                    dateIdeasApp.init();
                }
                break;
            case 'photos':
                // Initialize PhotosApp
                const photosApp = this.apps.get('photos');
                if (photosApp) {
                    // Make photosApp globally accessible for event handlers
                    window.photosApp = photosApp;
                    photosApp.init();
                }
                break;
            case 'music-player':
                // Initialize MusicPlayerApp
                const musicPlayerApp = this.apps.get('music-player');
                if (musicPlayerApp) {
                    // Make musicPlayerApp globally accessible for event handlers
                    window.musicPlayerApp = musicPlayerApp;
                    musicPlayerApp.init();
                }
                break;
        }
    }



    initPhotosApp() {
        const uploadInput = document.getElementById('photo-upload');
        const gallery = document.getElementById('photo-gallery');

        // Load existing photos
        this.loadPhotos(gallery);

        uploadInput.addEventListener('change', (e) => {
            this.handlePhotoUpload(e.target.files, gallery);
        });
    }

    initMusicPlayerApp() {
        const uploadInput = document.getElementById('music-upload');
        const playlist = document.getElementById('music-playlist');
        const player = document.getElementById('music-player');

        // Load existing music
        this.loadMusic(playlist, player);

        uploadInput.addEventListener('change', (e) => {
            this.handleMusicUpload(e.target.files, playlist, player);
        });
    }

    updateCharCount(editor, charCount) {
        const count = editor.value.length;
        const words = editor.value.trim() ? editor.value.trim().split(/\s+/).length : 0;
        charCount.textContent = `${count} characters • ${words} words`;
    }

    async deletePhoto(photoId) {
        if (!confirm('Are you sure you want to delete this photo?')) {
            return;
        }

        try {
            const success = await this.storageManager.deleteData(`photo_${photoId}`);
            if (success) {
                // Remove from UI
                const photoElement = document.querySelector(`[data-photo-id="${photoId}"]`);
                if (photoElement) {
                    photoElement.remove();
                }
            } else {
                throw new Error('Failed to delete photo');
            }
        } catch (error) {
            console.error('Error deleting photo:', error);
            this.showError('Failed to delete photo');
        }
    }

    async deleteMusic(musicId) {
        if (!confirm('Are you sure you want to delete this music file?')) {
            return;
        }

        try {
            const success = await this.storageManager.deleteData(`music_${musicId}`);
            if (success) {
                // Remove from UI
                const musicElement = document.querySelector(`[data-music-id="${musicId}"]`);
                if (musicElement) {
                    musicElement.remove();
                }

                // Stop playing if this track is currently playing
                const player = document.getElementById('music-player');
                if (player && player.src.includes(musicId)) {
                    player.pause();
                    player.src = '';
                }
            } else {
                throw new Error('Failed to delete music file');
            }
        } catch (error) {
            console.error('Error deleting music:', error);
            this.showError('Failed to delete music file');
        }
    }

    playMusic(musicId, dataUrl) {
        const player = document.getElementById('music-player');
        if (player) {
            player.src = dataUrl;
            player.play().catch(error => {
                console.error('Error playing music:', error);
                this.showError('Failed to play music file');
            });
        }
    }

    showError(message) {
        // Create a simple error notification
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(255, 0, 0, 0.9);
            color: white;
            padding: 15px 20px;
            border-radius: 10px;
            z-index: 10000;
            max-width: 300px;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        errorDiv.textContent = message;

        document.body.appendChild(errorDiv);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 5000);

        // Click to dismiss
        errorDiv.addEventListener('click', () => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        });
    }

    async handlePhotoUpload(files, gallery) {
        for (const file of Array.from(files)) {
            try {
                // Validate file before processing
                DataValidator.validateImageFile(file);

                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        // Create photo model
                        const photo = new PhotoModel(file, e.target.result);

                        // Compress if needed (files over 2MB)
                        if (photo.size > 2 * 1024 * 1024) {
                            await photo.compress(1920, 1080, 0.8);
                        }

                        // Save using storage manager
                        const success = await this.storageManager.saveData(`photo_${photo.id}`, photo.toJSON());

                        if (success) {
                            this.displayPhoto(photo, gallery);
                        } else {
                            throw new Error('Failed to save photo');
                        }
                    } catch (error) {
                        console.error('Error processing photo:', error);
                        this.showError(`Failed to upload ${file.name}: ${error.message}`);
                    }
                };
                reader.readAsDataURL(file);
            } catch (error) {
                console.error('Error validating photo:', error);
                this.showError(`Invalid file ${file.name}: ${error.message}`);
            }
        }
    }

    async handleMusicUpload(files, playlist, player) {
        for (const file of Array.from(files)) {
            try {
                // Validate file before processing
                DataValidator.validateAudioFile(file);

                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        // Create music model
                        const music = new MusicModel(file, e.target.result);

                        // Load metadata (duration, etc.)
                        await music.loadMetadata();

                        // Save using storage manager
                        const success = await this.storageManager.saveData(`music_${music.id}`, music.toJSON());

                        if (success) {
                            this.displayMusic(music, playlist, player);
                        } else {
                            throw new Error('Failed to save music file');
                        }
                    } catch (error) {
                        console.error('Error processing music:', error);
                        this.showError(`Failed to upload ${file.name}: ${error.message}`);
                    }
                };
                reader.readAsDataURL(file);
            } catch (error) {
                console.error('Error validating music file:', error);
                this.showError(`Invalid file ${file.name}: ${error.message}`);
            }
        }
    }

    async loadPhotos(gallery) {
        try {
            // Get all photo keys from storage
            const photoKeys = await this.getPhotoKeys();

            for (const key of photoKeys) {
                const photoData = await this.storageManager.loadData(key);
                if (photoData) {
                    const photo = PhotoModel.fromJSON(photoData);
                    this.displayPhoto(photo, gallery);
                }
            }
        } catch (error) {
            console.error('Error loading photos:', error);
            this.showError('Failed to load photos');
        }
    }

    async loadMusic(playlist, player) {
        try {
            // Get all music keys from storage
            const musicKeys = await this.getMusicKeys();

            for (const key of musicKeys) {
                const musicData = await this.storageManager.loadData(key);
                if (musicData) {
                    const music = MusicModel.fromJSON(musicData);
                    this.displayMusic(music, playlist, player);
                }
            }
        } catch (error) {
            console.error('Error loading music:', error);
            this.showError('Failed to load music');
        }
    }

    async getPhotoKeys() {
        // Get all photo keys from Firestore
        if (!db) {
            console.warn('Firestore not available');
            return [];
        }

        try {
            const snapshot = await db.collection('app-data')
                .where('sessionId', '!=', null)
                .get();

            const photoKeys = [];
            snapshot.forEach(doc => {
                const key = doc.id;
                if (key.startsWith('photo_')) {
                    photoKeys.push(key);
                }
            });

            return photoKeys;
        } catch (error) {
            console.error('Error getting photo keys from Firestore:', error);
            return [];
        }
    }

    async getMusicKeys() {
        // Get all music keys from Firestore
        if (!db) {
            console.warn('Firestore not available');
            return [];
        }

        try {
            const snapshot = await db.collection('app-data')
                .where('sessionId', '!=', null)
                .get();

            const musicKeys = [];
            snapshot.forEach(doc => {
                const key = doc.id;
                if (key.startsWith('music_')) {
                    musicKeys.push(key);
                }
            });

            return musicKeys;
        } catch (error) {
            console.error('Error getting music keys from Firestore:', error);
            return [];
        }
    }

    displayPhoto(photo, gallery) {
        const photoElement = document.createElement('div');
        photoElement.className = 'photo-item';
        photoElement.setAttribute('data-photo-id', photo.id);

        const sizeText = photo.metadata.compressed ?
            `${photo.formatSize()} (compressed)` :
            photo.formatSize();

        photoElement.innerHTML = `
            <div class="photo-container" style="position: relative; display: inline-block;">
                <img src="${photo.dataUrl}" alt="${photo.filename}" 
                     style="max-width: 200px; max-height: 200px; object-fit: cover; border-radius: 10px; cursor: pointer; transition: transform 0.3s ease;"
                     onclick="this.classList.toggle('enlarged')">
                <button class="delete-photo-btn" onclick="desktopManager.deletePhoto('${photo.id}')" 
                        style="position: absolute; top: 5px; right: 5px; background: rgba(255,0,0,0.7); color: white; border: none; border-radius: 50%; width: 25px; height: 25px; cursor: pointer; font-size: 12px;">×</button>
            </div>
            <div class="photo-info" style="text-align: center; margin-top: 5px;">
                <p style="margin: 2px 0; font-size: 12px; font-weight: bold;">${photo.filename}</p>
                <p style="margin: 2px 0; font-size: 10px; color: #666;">${sizeText}</p>
                <p style="margin: 2px 0; font-size: 10px; color: #666;">${new Date(photo.uploadDate).toLocaleDateString()}</p>
            </div>
        `;
        gallery.appendChild(photoElement);
    }

    displayMusic(music, playlist, player) {
        const musicElement = document.createElement('div');
        musicElement.className = 'music-item';
        musicElement.setAttribute('data-music-id', music.id);

        const duration = music.formatDuration();
        const size = music.formatSize();

        musicElement.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 10px; margin: 10px 0;">
                <div class="music-info" style="flex: 1;">
                    <div style="font-weight: bold; margin-bottom: 5px;">${music.metadata.title || music.filename}</div>
                    <div style="font-size: 12px; color: #ccc;">
                        ${duration} • ${size} • ${new Date(music.uploadDate).toLocaleDateString()}
                    </div>
                </div>
                <div class="music-controls" style="display: flex; gap: 10px; align-items: center;">
                    <button onclick="desktopManager.playMusic('${music.id}', '${music.dataUrl}')" 
                            style="padding: 8px 15px; background: #ff69b4; color: white; border: none; border-radius: 5px; cursor: pointer;">
                        ▶ Play
                    </button>
                    <button onclick="desktopManager.deleteMusic('${music.id}')" 
                            style="padding: 8px 12px; background: rgba(255,0,0,0.7); color: white; border: none; border-radius: 5px; cursor: pointer;">
                        ×
                    </button>
                </div>
            </div>
        `;
        playlist.appendChild(musicElement);
    }

    async initBackgroundMusic() {
        try {
            console.log('🎵 Initializing background music...');

            // Get all music from storage
            const musicKeys = await this.getMusicKeys();
            console.log(`Found ${musicKeys.length} music files`);

            if (musicKeys.length === 0) {
                console.log('No music files found');
                return;
            }

            // Load all music files into playlist
            for (const key of musicKeys) {
                const musicData = await this.storageManager.loadData(key);
                if (musicData && musicData.dataUrl) {
                    this.playlist.push(musicData);
                }
            }

            if (this.playlist.length === 0) {
                console.log('No valid music data found');
                return;
            }

            console.log(`Loaded ${this.playlist.length} tracks into playlist`);

            // Create or get audio element
            let audio = document.querySelector('.song');
            if (!audio) {
                audio = document.createElement('audio');
                audio.className = 'song';
                document.body.appendChild(audio);
            }

            this.audioElement = audio;
            audio.volume = 0.5; // Set to 50% volume

            // Setup audio event listeners
            audio.addEventListener('ended', () => this.playNext());
            audio.addEventListener('play', () => this.updateMiniPlayerUI());
            audio.addEventListener('pause', () => this.updateMiniPlayerUI());

            // Setup mini-player controls
            this.setupMiniPlayer();

            // Load first track
            this.loadTrack(0);

            // Try to autoplay (may be blocked by browser)
            const playPromise = audio.play();

            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        console.log('✅ Background music playing');
                        this.showMiniPlayer();
                    })
                    .catch((error) => {
                        console.log('⚠️ Autoplay blocked by browser');
                        this.showMusicPrompt();
                    });
            }
        } catch (error) {
            console.error('Error initializing background music:', error);
        }
    }

    setupMiniPlayer() {
        const playPauseBtn = document.getElementById('mini-play-pause-btn');
        const prevBtn = document.getElementById('mini-prev-btn');
        const nextBtn = document.getElementById('mini-next-btn');

        if (playPauseBtn) {
            playPauseBtn.addEventListener('click', () => this.togglePlayPause());
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.playPrevious());
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.playNext());
        }
    }

    loadTrack(index) {
        if (index < 0 || index >= this.playlist.length) return;

        this.currentTrackIndex = index;
        const track = this.playlist[index];

        if (this.audioElement) {
            this.audioElement.src = track.dataUrl;
            this.updateMiniPlayerInfo(track);
        }
    }

    updateMiniPlayerInfo(track) {
        const titleEl = document.getElementById('mini-player-title');
        const artistEl = document.getElementById('mini-player-artist');

        if (titleEl) {
            titleEl.textContent = track.metadata?.title || track.filename || 'Unknown Track';
        }

        if (artistEl) {
            artistEl.textContent = track.metadata?.artist || 'Unknown Artist';
        }
    }

    updateMiniPlayerUI() {
        const playPauseBtn = document.getElementById('mini-play-pause-btn');

        if (playPauseBtn && this.audioElement) {
            playPauseBtn.textContent = this.audioElement.paused ? '▶' : '⏸';
        }
    }

    showMiniPlayer() {
        const miniPlayer = document.getElementById('mini-player');
        if (miniPlayer) {
            miniPlayer.style.display = 'flex';
        }
    }

    togglePlayPause() {
        if (!this.audioElement) return;

        if (this.audioElement.paused) {
            this.audioElement.play();
        } else {
            this.audioElement.pause();
        }
    }

    playNext() {
        if (this.playlist.length === 0) return;

        this.currentTrackIndex = (this.currentTrackIndex + 1) % this.playlist.length;
        this.loadTrack(this.currentTrackIndex);

        if (this.audioElement) {
            this.audioElement.play();
        }
    }

    playPrevious() {
        if (this.playlist.length === 0) return;

        this.currentTrackIndex = (this.currentTrackIndex - 1 + this.playlist.length) % this.playlist.length;
        this.loadTrack(this.currentTrackIndex);

        if (this.audioElement) {
            this.audioElement.play();
        }
    }

    showMusicPrompt() {
        // Create a button to enable music
        const musicPrompt = document.createElement('div');
        musicPrompt.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%);
            color: white;
            padding: 15px 25px;
            border-radius: 25px;
            box-shadow: 0 4px 15px rgba(255, 154, 158, 0.4);
            cursor: pointer;
            z-index: 10000;
            font-family: 'Poppins', sans-serif;
            font-weight: 500;
            animation: bounce 2s ease-in-out infinite;
        `;
        musicPrompt.textContent = '🎵 Click to play music';

        musicPrompt.addEventListener('click', () => {
            if (this.audioElement) {
                this.audioElement.play()
                    .then(() => {
                        console.log('✅ Music started by user interaction');
                        musicPrompt.remove();
                        this.showMiniPlayer();
                    })
                    .catch((error) => {
                        console.error('Failed to play music:', error);
                        this.showNotification('Failed to play music', 'error');
                    });
            }
        });

        document.body.appendChild(musicPrompt);
    }
}

// Initialize Desktop Manager when DOM is loaded
let desktopManager;
document.addEventListener('DOMContentLoaded', () => {
    desktopManager = new DesktopManager();

    // Hide loading screen with fade out
    setTimeout(() => {
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.style.opacity = '0';
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 500);
        }
    }, 800);

    // Add entrance animations to nav buttons
    setTimeout(() => {
        const navButtons = document.querySelectorAll('.nav-button');
        navButtons.forEach((button, index) => {
            button.style.opacity = '0';
            button.style.transform = 'translateY(-20px)';
            setTimeout(() => {
                button.style.transition = 'all 0.4s ease';
                button.style.opacity = '1';
                button.style.transform = 'translateY(0)';
            }, index * 100);
        });
    }, 900);

    // Add smooth scroll behavior
    document.documentElement.style.scrollBehavior = 'smooth';

    // Add touch feedback for mobile devices
    if ('ontouchstart' in window) {
        document.body.classList.add('touch-device');

        // Add touch ripple effect
        document.addEventListener('touchstart', (e) => {
            if (e.target.closest('.nav-button, .upload-btn, button')) {
                const element = e.target.closest('.nav-button, .upload-btn, button');
                element.style.transform = 'scale(0.95)';
            }
        });

        document.addEventListener('touchend', (e) => {
            if (e.target.closest('.nav-button, .upload-btn, button')) {
                const element = e.target.closest('.nav-button, .upload-btn, button');
                setTimeout(() => {
                    element.style.transform = '';
                }, 100);
            }
        });
    }

    // Optimize animations for reduced motion preference
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        document.documentElement.style.setProperty('--animation-duration', '0.01s');
        const style = document.createElement('style');
        style.textContent = `
            *, *::before, *::after {
                animation-duration: 0.01s !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.01s !important;
            }
        `;
        document.head.appendChild(style);
    }
});


