const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const mysql = require('mysql2');
const dotenv = require('dotenv');

dotenv.config(); // Load environment variables

// Create a MySQL connection
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

// Connect to the database
db.connect(err => {
    if (err) {
        console.error('Database connection failed:', err);
        return;
    }
});


const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/'); // Store files in "uploads" directory
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname)); // Append timestamp to filename
    },
});

const upload = multer({ storage });

// Middleware to check authentication
function isAuthenticated(req, res, next) {
    if (req.cookies.userId) {
        return next();
    }
    res.status(403).render('access-denied');
}

// Inbox page
router.get('/inbox', isAuthenticated, (req, res) => {
    const userId = req.cookies.userId;

    db.query('SELECT * FROM emails WHERE to_user_id= ? ORDER BY sent_at DESC ', [userId], (err, emails) => {
        if (err) throw err;
        res.render('inbox', { emails });
    });
});
 
//email detail page
router.get("/detail/:id", (req, res) => {
    const emailId = req.params.id;
    const userId = req.cookies.userId;
    const query = `
    SELECT emails.*, users.email AS senderEmail, users_to.email AS recipientEmail
    FROM emails
    JOIN users ON emails.from_user_id = users.id
    LEFT JOIN users AS users_to ON emails.to_user_id = users_to.id
    WHERE emails.id = ? AND (emails.from_user_id = ? OR emails.to_user_id = ?)
`;
db.query(query, [emailId, userId, userId], (err, results) => {
    if (err) {
        console.error('Error fetching email details:', err);
        return res.status(500).send('Internal Server Error');
    }

    if (results.length === 0) {
        return res.status(404).send('Email not found');
    }

    const email = results[0];
    
    // If the email is unread, mark it as read
    if (!email.read) {
        const updateQuery = 'UPDATE emails SET read_status = 1 WHERE id = ?';
        db.query(updateQuery, [emailId], (updateErr) => {
            if (updateErr) {
                console.error('Error marking email as read:', updateErr);
            }
            // Proceed to render the email details
            res.render('detail', { email: email });
        });
    } else {
        res.render('detail', { email: email });
    }
    
  });
});


// Compose page
router.get('/compose', isAuthenticated, (req, res) => {
    db.query('SELECT * FROM users WHERE id != ?', [req.cookies.userId], (err, users) => {
        if (err) throw err;
        res.render('compose', { users });
    });
});

// Handle sending emails
router.post('/compose', isAuthenticated, upload.single('attachment'), (req, res) => {
    const { recipientId, subject, body } = req.body;
    const attachment = req.file ? req.file.path : null; // Store path if a file is uploaded

    db.query('INSERT INTO emails (from_user_id, to_user_id, subject, content, attachment) VALUES (?, ?, ?, ?, ?)', [req.cookies.userId, recipientId, subject, body, attachment], (err) => {
        if (err) {
            console.error('Error inserting email:', err);
            return res.status(500).send('Internal Server Error');
        }
        res.send(`
            <p>Sign up successful! Redirecting to inbox...</p>
            <script>
                setTimeout(() => {
                    window.location.href = '/emails/inbox';
                }, 1000);
            </script>
        `);
    });
});

// Outbox page
router.get('/outbox', isAuthenticated, (req, res) => {
    const userId = req.cookies.userId;

    db.query('SELECT * FROM emails WHERE from_user_id = ? ORDER BY sent_at DESC ', [userId], (err, emails) => {
        if (err) throw err;
        res.render('outbox', { emails });
    });
});

// Delete email
router.delete('/delete/:id', isAuthenticated, (req, res) => {
    db.query('DELETE FROM emails WHERE id = ?', [req.params.id], (err) => {
        if (err) throw err;
        res.send('Email deleted');
    });
});


module.exports = router;
