const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config(); // Load environment variables

// Create a MySQL connection
let db;
async function connectToDatabase() {
    try {
        db = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });
    } catch (err) {
        console.error('Cannot connect to the database:', err);
        process.exit(1); // Exit the process with an error code
    }
}

connectToDatabase();

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../uploads')); // Use absolute path
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type'));
        }
    }
})



// Middleware to check authentication
function isAuthenticated(req, res, next) {
    if (req.cookies.userId) {
        return next();
    }
    res.status(403).render('access-denied');
}

// Inbox page
router.get('/inbox', isAuthenticated, async (req, res) => {
    const userId = req.cookies.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const offset = (page - 1) * limit;

    try {
        // Get total count of emails
        const [countResult] = await db.query('SELECT COUNT(*) as count FROM emails WHERE to_user_id = ?', [userId]);
        const totalEmails = countResult[0].count;
        const totalPages = Math.ceil(totalEmails / limit);

        // Fetch emails with pagination
        const [emails] = await db.query('SELECT * FROM emails WHERE to_user_id = ? ORDER BY sent_at DESC LIMIT ? OFFSET ?', [userId, limit, offset]);

        res.render('inbox', { 
            emails, 
            currentPage: page, 
            totalPages 
        });
    } catch (err) {
        console.error('Error fetching inbox emails:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Email detail page
router.get("/detail/:id", isAuthenticated, async (req, res) => {
    const emailId = req.params.id;
    const userId = req.cookies.userId;
    const query = `
        SELECT emails.*, users.email AS senderEmail, users_to.email AS recipientEmail
        FROM emails
        JOIN users ON emails.from_user_id = users.id
        LEFT JOIN users AS users_to ON emails.to_user_id = users_to.id
        WHERE emails.id = ? AND (emails.from_user_id = ? OR emails.to_user_id = ?)
    `;

    try {
        const [results] = await db.query(query, [emailId, userId, userId]);
        if (results.length === 0) {
            return res.status(404).send('Email not found');
        }

        const email = results[0];

        // If the email is unread, mark it as read
        if (!email.read) {
            const updateQuery = 'UPDATE emails SET read_status = 1 WHERE id = ?';
            await db.query(updateQuery, [emailId]);
        }

        res.render('detail', { email: email });
    } catch (err) {
        console.error('Error fetching email details:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Compose page
router.get('/compose', isAuthenticated, async (req, res) => {
    try {
        const [users] = await db.query('SELECT * FROM users WHERE id != ?', [req.cookies.userId]);
        res.render('compose', { users });
    } catch (err) {
        console.error('Error fetching users for compose:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Handle sending emails
router.post('/compose', isAuthenticated, upload.single('attachment'), async (req, res) => {
    const { recipientId, subject, body } = req.body;
    const attachment = req.file ? req.file.path : null; // Store path if a file is uploaded

    try {
        await db.query('INSERT INTO emails (from_user_id, to_user_id, subject, content, attachment) VALUES (?, ?, ?, ?, ?)', [req.cookies.userId, recipientId, subject, body, attachment]);
        res.send(`
            <p>Email sent successfully! Redirecting to inbox...</p>
            <script>
                setTimeout(() => {
                    window.location.href = '/emails/inbox';
                }, 1000);
            </script>
        `);
    } catch (err) {
        console.error('Error sending email:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Outbox page
router.get('/outbox', isAuthenticated, async (req, res) => {
    const userId = req.cookies.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const offset = (page - 1) * limit;

    try {
        // Get total count of emails
        const [countResult] = await db.query('SELECT COUNT(*) as count FROM emails WHERE from_user_id = ?', [userId]);
        const totalEmails = countResult[0].count;
        const totalPages = Math.ceil(totalEmails / limit);

        // Fetch emails with pagination
        const [emails] = await db.query('SELECT * FROM emails WHERE from_user_id = ? ORDER BY sent_at DESC LIMIT ? OFFSET ?', [userId, limit, offset]);

        res.render('outbox', { 
            emails, 
            currentPage: page, 
            totalPages 
        });
    } catch (err) {
        console.error('Error fetching outbox emails:', err);
        res.status(500).send('Internal Server Error');
    }
});


// Delete emails
router.delete('/delete', isAuthenticated, express.json(), async (req, res) => {
    const { ids } = req.body;

    console.log('Request to delete emails:', ids);

    if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).send('No emails selected');
    }

    const userId = req.cookies.userId;
    const placeholders = ids.map(() => '?').join(',');
    const query = `
        DELETE FROM emails
        WHERE id IN (${placeholders})
        AND to_user_id = ?
    `;
    console.log('Userid :', userId);

    console.log('Executing query:', query);

    try {
        await db.query(query, [...ids, userId]);
        res.status(200).send('Emails deleted successfully');
    } catch (err) {
        console.error('Error deleting emails:', err);
        res.status(500).send('Internal Server Error');
    }
});

module.exports = router;