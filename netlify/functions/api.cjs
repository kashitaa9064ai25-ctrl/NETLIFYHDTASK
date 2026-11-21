const express = require('express');
const cors = require('cors');
const formData = require('form-data');
const Mailgun = require('mailgun.js');
const nodemailer = require('nodemailer');
const { initializeApp, getApps, getApp } = require('firebase/app');
const {
    getFirestore,
    collection,
    doc,
    addDoc,
    getDocs,
    getDoc,
    deleteDoc,
    updateDoc,
    increment,
} = require('firebase/firestore');
require('dotenv').config();
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Project Firebase Configuration
const firebaseConfig = {
    apiKey: process.env.VITE_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN,
    projectId:
        process.env.VITE_FIREBASE_PROJECT_ID ||
        process.env.FIREBASE_PROJECT_ID ||
        'task-p4-765a4',
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.VITE_FIREBASE_APP_ID || process.env.FIREBASE_APP_ID,
};

// Safe Firebase App Initialization
const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(firebaseApp);

// Primary: Mailgun Client
const mailgun = new Mailgun(formData);
const mg = mailgun.client({
    username: 'api',
    key: process.env.MAILGUN_API_KEY || 'fake-key',
});

// Secondary / Fallback: Nodemailer Gmail Transporter
const fallbackEmailUser = process.env.GMAIL_USER || 'nkashitaa5@gmail.com';
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: fallbackEmailUser,
        pass: process.env.GMAIL_APP_PASSWORD || '',
    },
});

// In-Memory OTP Store: { "user@email.com": { code: "123456", expiresAt: 1730000000 } }
const emailOtpStore = new Map();


async function sendEmailWithFallback({ to, subject, text }) {
    const recipient = to.toLowerCase().trim();

    // 1. Try Mailgun
    try {
        const mailgunResponse = await mg.messages.create(process.env.MAILGUN_DOMAIN, {
            from: `DEV@Deakin <mailgun@${process.env.MAILGUN_DOMAIN}>`,
            to: [recipient],
            subject: subject,
            text: text,
        });
        console.log(`[Task HD Email] Successfully sent via Mailgun to ${recipient}:`, mailgunResponse.id || 'OK');
        return { success: true, provider: 'mailgun' };
    } catch (mailgunError) {
        console.warn(`[Task HD Email] Mailgun delivery failed for ${recipient}. Reason: ${mailgunError.message}`);
        console.log('[Task HD Email] Switching to Nodemailer fallback...');

        // 2. Failover to Nodemailer
        try {
            const nodemailerInfo = await transporter.sendMail({
                from: `"DEV@Deakin Security" <${fallbackEmailUser}>`,
                to: recipient,
                subject: subject,
                text: text,
            });
            console.log(`[Task HD Email] Successfully delivered via Nodemailer fallback to ${recipient}:`, nodemailerInfo.messageId);
            return { success: true, provider: 'nodemailer' };
        } catch (nodemailerError) {
            console.error(`[Task HD Email] Both Mailgun and Nodemailer failed for ${recipient}:`, nodemailerError.message);
            throw new Error(`Email dispatch failed on both providers. Mailgun: ${mailgunError.message} | Nodemailer: ${nodemailerError.message}`);
        }
    }
}

// Helper: Check Admin Authorization strictly against owner email
const verifyIsAdmin = async (userId) => {
    if (!userId) return false;
    try {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) return false;

        const userData = userSnap.data();
        const userEmail = (userData.email || '').toLowerCase().trim();
        const authorizedAdminEmail = (
            process.env.ADMIN_EMAIL ||
            process.env.VITE_ADMIN_EMAIL ||
            'nkashitaa5@gmail.com'
        ).toLowerCase().trim();

        return userEmail === authorizedAdminEmail;
    } catch (err) {
        console.error('[Task HD] Admin verification check failed:', err);
        return false;
    }
};

// 1. Newsletter Subscription Endpoint

app.post('/subscribe', async (req, res) => {
    const { email } = req.body;
    if (!email || !email.trim() || !email.includes('@')) {
        return res.status(400).json({ success: false, message: 'A valid email is required.' });
    }

    try {
        await sendEmailWithFallback({
            to: email.trim(),
            subject: 'Welcome to DEV@Deakin Daily Insider!',
            text: 'Thank you for subscribing to our Daily Insider newsletter!',
        });
        return res.status(200).json({ success: true, message: 'Subscribed successfully!' });
    } catch (err) {
        console.error('Subscription email delivery error:', err);
        return res.status(500).json({ success: false, message: 'Failed to send subscription email.' });
    }
});

// 2. 6-Digit Email OTP Endpoints (Mailgun with Fallback)
app.post('/api/auth/send-email-otp', async (req, res) => {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
        return res.status(400).json({ success: false, message: 'A valid email address is required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5-minute validity window

    emailOtpStore.set(cleanEmail, { code: otpCode, expiresAt });

    // Always log to terminal so testing is never blocked
    console.log(`[DEV@Deakin OTP] Code for ${cleanEmail}: ${otpCode}`);

    try {
        const result = await sendEmailWithFallback({
            to: cleanEmail,
            subject: 'Your DEV@Deakin 6-Digit Verification Code',
            text: `Hello,\n\nYour 6-digit security verification code is: ${otpCode}\n\nThis code will expire in 5 minutes.\n\nIf you did not request this, please ignore this email.`,
        });

        return res.status(200).json({
            success: true,
            provider: result.provider,
            message: `6-digit verification code sent via ${result.provider}.`,
        });
    } catch (err) {
        console.error('[Task HD] Failed to send OTP:', err.message);
        // Allow local demonstration to proceed even if offline or credentials expired
        return res.status(200).json({
            success: true,
            message: 'OTP generated. (Check server terminal console if mailbox delivery is blocked).',
        });
    }
});

app.post('/api/auth/verify-email-otp', (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) {
        return res.status(400).json({ success: false, message: 'Email and 6-digit code are required.' });
    }

    const cleanEmail = email.toLowerCase().trim();
    const record = emailOtpStore.get(cleanEmail);

    if (!record) {
        return res.status(400).json({ success: false, message: 'No OTP requested for this address or code expired.' });
    }
    if (Date.now() > record.expiresAt) {
        emailOtpStore.delete(cleanEmail);
        return res.status(400).json({ success: false, message: 'Code has expired. Please request a new OTP.' });
    }
    if (record.code !== code.trim()) {
        return res.status(400).json({ success: false, message: 'Invalid 6-digit code. Please check your inbox or server terminal.' });
    }

    emailOtpStore.delete(cleanEmail);
    return res.status(200).json({ success: true, message: 'Email OTP confirmed successfully.' });
});

// 3. Post Creation Endpoint
app.post('/api/posts', async (req, res) => {
    const { userId, authorName, postType, plan, title, abstract, text, tags, image, diagram } = req.body;

    if (!userId) {
        return res.status(401).json({ success: false, message: 'You must be logged in to create a post.' });
    }
    if (!title || !title.trim()) {
        return res.status(400).json({ success: false, message: 'Post title is required.' });
    }
    if (!text || !text.trim()) {
        return res.status(400).json({ success: false, message: 'Post text is required.' });
    }

    try {
        const newPost = {
            userId,
            authorName: authorName || 'Anonymous',
            postType: postType === 'Question' ? 'Question' : 'Article',
            plan: plan === 'Paid' ? 'Paid' : 'Free',
            title: title.trim(),
            abstract: abstract ? abstract.trim() : '',
            text: text.trim(),
            image: image || null,
            diagram: diagram && diagram.trim() ? diagram.trim() : null,
            votes: 0,
            votedBy: [],
            tags: Array.isArray(tags) ? tags : (tags ? tags.split(',').map((t) => t.trim()) : []),
            createdAt: new Date().toISOString(),
        };

        const docRef = await addDoc(collection(db, 'posts'), newPost);
        console.log(`[Task HD] New Post saved: ${docRef.id} (${newPost.plan})`);
        return res.status(201).json({ success: true, id: docRef.id, post: newPost });
    } catch (error) {
        console.error('[Task HD] Error creating post:', error);
        return res.status(500).json({ success: false, message: 'Failed to save post: ' + error.message });
    }
});

// 4. Browse Posts Endpoint (Enforces Tier Access)
app.get('/api/posts', async (req, res) => {
    const userPlan = (req.query.userPlan || 'Free').trim();

    try {
        const snapshot = await getDocs(collection(db, 'posts'));

        let posts = [];
        snapshot.forEach((docItem) => {
            const data = docItem.data();
            posts.push({
                id: docItem.id,
                ...data,
                votes: typeof data.votes === 'number' ? data.votes : 0,
                plan: data.plan || 'Free',
            });
        });

        if (userPlan !== 'Paid') {
            posts = posts.filter((p) => p.plan === 'Free');
        }

        // Sort newest first
        posts.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        return res.status(200).json({ success: true, posts });
    } catch (error) {
        console.error('[Task HD] Firestore Fetch Error:', error);
        return res.status(500).json({
            success: false,
            message: `Failed to retrieve posts: ${error.message}`,
        });
    }
});

// 5. Interactive Upvoting Endpoint
app.patch('/api/posts/:id/vote', async (req, res) => {
    const { id } = req.params;
    const { userId } = req.body;

    if (!userId) {
        return res.status(401).json({
            success: false,
            message: 'You must be logged in to vote on posts.',
        });
    }

    try {
        const postRef = doc(db, 'posts', id);
        const postSnap = await getDoc(postRef);

        if (!postSnap.exists()) {
            return res.status(404).json({ success: false, message: 'Post not found.' });
        }

        const postData = postSnap.data();
        const votedBy = Array.isArray(postData.votedBy) ? postData.votedBy : [];

        // Prevent duplicate votes from the same user
        if (votedBy.includes(userId)) {
            return res.status(400).json({
                success: false,
                message: 'You have already voted on this post.',
            });
        }

        await updateDoc(postRef, {
            votes: increment(1),
            votedBy: [...votedBy, userId],
        });

        return res.status(200).json({
            success: true,
            message: 'Upvote recorded successfully.',
        });
    } catch (error) {
        console.error('[Task HD] Error updating upvote:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to register vote: ' + error.message,
        });
    }
});
// 6. Author-Validated Deletion Endpoint
app.delete('/api/posts/:id', async (req, res) => {
    const { id } = req.params;
    const userId = req.body?.userId || req.query?.userId;
    const authorName = (req.body?.authorName || req.query?.authorName || '').toLowerCase().trim();

    if (!userId && !authorName) {
        return res.status(401).json({ success: false, message: 'Authentication required to delete posts.' });
    }

    try {
        const postRef = doc(db, 'posts', id);
        const postSnap = await getDoc(postRef);

        if (!postSnap.exists()) {
            return res.status(404).json({ success: false, message: 'Post not found.' });
        }

        const postData = postSnap.data();
        const postAuthorName = (postData.authorName || '').toLowerCase().trim();

        const isOwner =
            (postData.userId && postData.userId === userId) ||
            (authorName && postAuthorName && authorName.includes(postAuthorName)) ||
            (!postData.userId && postAuthorName === 'kashitaa');

        if (!isOwner) {
            return res.status(403).json({
                success: false,
                message: 'Permission denied: You can only delete posts that you authored.',
            });
        }

        await deleteDoc(postRef);
        console.log(`[Task HD] Post ${id} permanently deleted.`);
        return res.status(200).json({ success: true, message: 'Post permanently deleted.' });
    } catch (error) {
        console.error('[Task HD] Error deleting post:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete post: ' + error.message });
    }
});

// 7. 7-Day Free Paid Trial Activation
app.post('/api/users/:uid/start-trial', async (req, res) => {
    const { uid } = req.params;
    try {
        const userRef = doc(db, 'users', uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            return res.status(404).json({ success: false, message: 'User profile not found.' });
        }

        const userData = userSnap.data();
        if (userData.trialUsed) {
            return res.status(400).json({ success: false, message: '7-day trial has already been used on this account.' });
        }

        const trialDurationMs = 7 * 24 * 60 * 60 * 1000;
        const trialExpiresAt = new Date(Date.now() + trialDurationMs).toISOString();

        await updateDoc(userRef, {
            plan: 'Paid',
            isTrial: true,
            trialUsed: true,
            trialExpiresAt,
            upgradedAt: new Date().toISOString(),
        });

        console.log(`[Task HD] 7-Day trial activated for user ${uid}.`);
        return res.status(200).json({
            success: true,
            message: '7-day Paid trial activated successfully!',
            plan: 'Paid',
            trialExpiresAt,
        });
    } catch (error) {
        console.error('[Task HD] Trial activation error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// 8. Comments & Answers Sub-Collection
app.get('/api/posts/:postId/comments', async (req, res) => {
    const { postId } = req.params;
    try {
        const commentsSnapshot = await getDocs(collection(db, 'posts', postId, 'comments'));
        const comments = [];
        commentsSnapshot.forEach((docItem) => {
            comments.push({ id: docItem.id, ...docItem.data() });
        });

        comments.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
        return res.status(200).json({ success: true, comments });
    } catch (error) {
        console.error('[Task HD] Fetch comments error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/posts/:postId/comments', async (req, res) => {
    const { postId } = req.params;
    const { userId, authorName, text } = req.body;

    if (!userId) return res.status(401).json({ success: false, message: 'Login required.' });
    if (!text || !text.trim()) return res.status(400).json({ success: false, message: 'Comment content cannot be empty.' });

    try {
        const newComment = {
            userId,
            authorName: authorName || 'Anonymous',
            text: text.trim(),
            isSolution: false,
            createdAt: new Date().toISOString(),
        };

        const docRef = await addDoc(collection(db, 'posts', postId, 'comments'), newComment);
        return res.status(201).json({ success: true, id: docRef.id, comment: newComment });
    } catch (error) {
        console.error('[Task HD] Post comment error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.patch('/api/posts/:postId/comments/:commentId/solution', async (req, res) => {
    const { postId, commentId } = req.params;
    const { userId } = req.body;

    try {
        const postRef = doc(db, 'posts', postId);
        const postSnap = await getDoc(postRef);

        if (!postSnap.exists()) return res.status(404).json({ success: false, message: 'Post not found.' });
        if (postSnap.data().userId !== userId) {
            return res.status(403).json({ success: false, message: 'Only the author of the question can mark solutions.' });
        }

        const commentRef = doc(db, 'posts', postId, 'comments', commentId);
        const commentSnap = await getDoc(commentRef);
        if (!commentSnap.exists()) return res.status(404).json({ success: false, message: 'Comment not found.' });

        const currentStatus = commentSnap.data().isSolution || false;
        await updateDoc(commentRef, { isSolution: !currentStatus });

        return res.status(200).json({ success: true, isSolution: !currentStatus });
    } catch (error) {
        console.error('[Task HD] Solution toggle error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// 9. Two-Factor Authentication (TOTP) Setup
app.post('/api/2fa/generate', async (req, res) => {
    const { userId, email } = req.body;
    if (!userId) return res.status(401).json({ success: false, message: 'Authentication required.' });

    try {
        const secret = speakeasy.generateSecret({
            name: `DEV@Deakin (${email || 'User'})`,
            issuer: 'DEV@Deakin',
            length: 20,
        });

        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
            tempTwoFactorSecret: secret.base32,
        });

        const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);

        return res.status(200).json({
            success: true,
            secret: secret.base32,
            qrCode: qrCodeDataUrl,
        });
    } catch (error) {
        console.error('[Task HD] Error generating 2FA secret:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/2fa/verify-and-enable', async (req, res) => {
    const { userId, token } = req.body;
    if (!userId || !token) {
        return res.status(400).json({ success: false, message: 'User ID and 6-digit token are required.' });
    }

    try {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const userData = userSnap.data();
        const secretToVerify = userData.tempTwoFactorSecret || userData.twoFactorSecret;

        if (!secretToVerify) {
            return res.status(400).json({ success: false, message: 'No 2FA setup in progress.' });
        }

        const verified = speakeasy.totp.verify({
            secret: secretToVerify,
            encoding: 'base32',
            token: token.trim(),
            window: 1,
        });

        if (!verified) {
            return res.status(400).json({ success: false, message: 'Invalid 6-digit security code. Try again.' });
        }

        await updateDoc(userRef, {
            twoFactorEnabled: true,
            twoFactorSecret: secretToVerify,
            tempTwoFactorSecret: null,
        });

        return res.status(200).json({ success: true, message: 'Two-Factor Authentication activated successfully!' });
    } catch (error) {
        console.error('[Task HD] 2FA verification error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/2fa/disable', async (req, res) => {
    const { userId, token } = req.body;
    if (!userId || !token) return res.status(400).json({ success: false, message: 'Missing credentials.' });

    try {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) return res.status(404).json({ success: false, message: 'User not found.' });

        const userData = userSnap.data();
        if (!userData.twoFactorEnabled || !userData.twoFactorSecret) {
            return res.status(400).json({ success: false, message: '2FA is not enabled on this account.' });
        }

        const verified = speakeasy.totp.verify({
            secret: userData.twoFactorSecret,
            encoding: 'base32',
            token: token.trim(),
            window: 1,
        });

        if (!verified) {
            return res.status(400).json({ success: false, message: 'Invalid 6-digit security code.' });
        }

        await updateDoc(userRef, {
            twoFactorEnabled: false,
            twoFactorSecret: null,
        });

        return res.status(200).json({ success: true, message: '2FA has been disabled.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

// 10. Login-Cycle 2FA Checker & Completer
app.post('/api/2fa/check-login-requirement', async (req, res) => {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'Missing userId.' });

    try {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const userData = userSnap.data();
        const loginCount = (userData.loginCount || 0) + 1;
        const has2FAConfigured = !!userData.twoFactorSecret;

        // Require OTP only on the 1st login and every 5th login (1, 5, 10, 15...)
        const requires2FA = loginCount === 1 || loginCount % 5 === 0;

        return res.status(200).json({
            success: true,
            requires2FA,
            has2FAConfigured,
            loginCount,
            email: userData.email,
        });
    } catch (error) {
        console.error('2FA check error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/2fa/complete-login', async (req, res) => {
    const { userId, email, token } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'Missing userId.' });

    try {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }

        const userData = userSnap.data();
        const loginCount = (userData.loginCount || 0) + 1;
        const requires2FA = loginCount === 1 || loginCount % 5 === 0;

        // Only verify OTP/TOTP when the current login count hits 1, 5, 10, 15...
        if (requires2FA) {
            if (!token) {
                return res.status(400).json({ success: false, message: '6-digit code required.' });
            }

            const trimmedToken = token.trim();
            let isValid = false;

            // Check 1: Email OTP verification
            const cleanEmail = (email || userData.email || '').toLowerCase().trim();
            const record = emailOtpStore.get(cleanEmail);
            if (record && Date.now() <= record.expiresAt && record.code === trimmedToken) {
                isValid = true;
                emailOtpStore.delete(cleanEmail);
            }

            // Check 2: Authenticator TOTP fallback
            if (!isValid) {
                const secret = userData.tempTwoFactorSecret || userData.twoFactorSecret;
                if (secret) {
                    isValid = speakeasy.totp.verify({
                        secret,
                        encoding: 'base32',
                        token: trimmedToken,
                        window: 1,
                    });
                }
            }

            if (!isValid) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid 6-digit security code. Check your email or backend terminal.',
                });
            }
        }

        await updateDoc(userRef, {
            twoFactorEnabled: true,
            loginCount: loginCount,
            lastLoginAt: new Date().toISOString(),
        });

        return res.status(200).json({
            success: true,
            loginCount,
            message: 'Authentication successful.',
        });
    } catch (error) {
        console.error('Error completing login:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

// 11. Admin Analytics & Content Moderation Dashboard
app.get('/api/admin/analytics', async (req, res) => {
    const userId = req.headers['x-admin-userid'];
    const isAdmin = await verifyIsAdmin(userId);

    if (!isAdmin) {
        return res.status(403).json({
            success: false,
            message: 'Access denied: Only the authorized Mailgun platform owner can access the admin dashboard.',
        });
    }

    try {
        const postsSnap = await getDocs(collection(db, 'posts'));
        let totalPosts = 0;
        let questionsCount = 0;
        let articlesCount = 0;
        let freePostsCount = 0;
        let paidPostsCount = 0;
        let totalVotes = 0;
        const tagFrequencies = {};

        postsSnap.forEach((docItem) => {
            totalPosts++;
            const p = docItem.data();
            if (p.postType === 'Question') questionsCount++;
            else articlesCount++;

            if (p.plan === 'Paid') paidPostsCount++;
            else freePostsCount++;

            totalVotes += typeof p.votes === 'number' ? p.votes : 0;

            if (Array.isArray(p.tags)) {
                p.tags.forEach((tag) => {
                    const t = tag.trim().toLowerCase();
                    if (t) tagFrequencies[t] = (tagFrequencies[t] || 0) + 1;
                });
            }
        });

        const usersSnap = await getDocs(collection(db, 'users'));
        let totalUsers = 0;
        let paidSubscribers = 0;
        let twoFactorUsers = 0;

        usersSnap.forEach((uDoc) => {
            totalUsers++;
            const u = uDoc.data();
            if (u.plan === 'Paid') paidSubscribers++;
            if (u.twoFactorEnabled) twoFactorUsers++;
        });

        return res.status(200).json({
            success: true,
            analytics: {
                totalPosts,
                questionsCount,
                articlesCount,
                freePostsCount,
                paidPostsCount,
                totalVotes,
                topTags: Object.entries(tagFrequencies)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5),
                totalUsers,
                paidSubscribers,
                twoFactorUsers,
            },
        });
    } catch (error) {
        console.error('[Task HD] Admin Analytics Error:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
});

app.delete('/api/admin/posts/:id', async (req, res) => {
    const { id } = req.params;
    const userId = req.headers['x-admin-userid'];

    const isAdmin = await verifyIsAdmin(userId);
    if (!isAdmin) {
        return res.status(403).json({
            success: false,
            message: 'Access denied: Admin privileges required.',
        });
    }

    try {
        const postRef = doc(db, 'posts', id);
        await deleteDoc(postRef);
        console.log(`[Task HD Admin] Post ${id} permanently removed by administrator ${userId}`);
        return res.status(200).json({ success: true, message: 'Post removed by administrator.' });
    } catch (error) {
        return res.status(500).json({ success: false, message: error.message });
    }
});

const serverless = require('serverless-http');
module.exports.handler = serverless(app, {
    basePath: '/.netlify/functions/api',
});