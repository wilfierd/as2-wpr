const express = require('express');
const router = express.Router();
const mysql = require('mysql2');
const dotenv = require('dotenv');
const cookieParser = require("cookie-parser");

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

module.exports = db;

// // Middleware for checking if the user is authenticated
// function isAuthenticated(req, res, next) {
//     if (req.cookies.userId) {
//         return res.redirect('/emails/inbox');
//     }
//     res.status(403).render('access-denied');
// }


// Render the sign-in page (homepage)
router.get('/signin', (req, res) => {
    res.render('signin'); // Render the sign-in page view (e.g., views/signin.ejs)
});

// Handle sign-up
router.post('/signup', async (req, res) => {
    const { name, email, password, confirmPassword } = req.body;

    // Error handling
    if (!name || !email || !password || !confirmPassword) {
        return res.status(400).send('All fields are required');
    }
    if (password.length < 6) {
        return res.status(400).send('Password too short');
    }
    if (password !== confirmPassword) {
        return res.status(400).send('Passwords do not match');
    }

    // Check if email is already used
    db.query('SELECT * FROM users WHERE email = ?', [email], (err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            return res.status(400).send('Email already used');
        }

         // Insert user into the database without hashing the password
         db.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, password], (err) => {
            if (err) throw err;
            res.redirect('/signin');
        });
    });
});

// Handle sign-in
router.post('/signin', (req, res) => {
    const { email, password } = req.body;

     db.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password], (err, results) => {
        if (err) throw err;
        if (results.length === 0) {
            return res.status(401).send('Invalid credentials');
        }
    
        // Set cookie for user session with additional options
        res.cookie('userId', results[0].id, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production', 
            maxAge: 5 * 60 * 1000,  // 5 minutes
            sameSite: 'strict',
            path: '/'
        });
        res.redirect('/emails/inbox');
    });
});

// Handle sign-out
router.get('/signout', (req, res) => {
    console.log('Sign out route accessed');
    res.clearCookie('userId',isAuthenticated, {
        path: '/', // Ensure the path matches the one used during cookie creation
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    });
    res.send(`
        <p>Successfully signed out. Redirecting to sign in...</p>
        <script>
            setTimeout(() => {
                window.location.href = '/auth/signin';
            }, 3000);
        </script>
    `);
});

module.exports = router;
