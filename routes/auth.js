const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const cookieParser = require("cookie-parser");

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

// Render the sign-in page (homepage)
router.get('/signin', (req, res) => {
    res.render('signin'); 
});

// Render the sign-up page
router.get('/signup', (req, res) => { 
    res.render('signup', { errors: {}, validData: {} });
});
// Handle sign-up
router.post('/signup', async (req, res) => {
    const { name, email, password, confirmPassword } = req.body;

    // Initialize an object to hold error messages and valid data
    let errors = {};
    let validData = { name, email };

    // Validation checks
    if (!name || !email || !password || !confirmPassword) {
        errors.message = 'All fields are required';
    } else {
        if (password.length < 4) {
            errors.message = 'Password too short';
        }
        if (password !== confirmPassword) {
            errors.message = 'Passwords do not match';
        }
    }

    if (Object.keys(errors).length > 0) {
        return res.render('signup', { errors, validData });
    }

    // Check if email is already used
    try {
        const [results] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (results.length > 0) {
            errors.message = 'Email already used';
            return res.render('signup', { errors, validData });
        }

        // Insert user into the database without hashing the password
        await db.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, password]);
        res.redirect('/auth/signin');
    } catch (err) {
        console.error('Error during sign-up:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Handle sign-in
router.post('/signin', async (req, res) => {
    const { email, password } = req.body;

    try {
        const [results] = await db.query('SELECT * FROM users WHERE email = ? AND password = ?', [email, password]);
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
    } catch (err) {
        console.error('Error during sign-in:', err);
        res.status(500).send('Internal Server Error');
    }
});

// Handle sign-out
router.get('/signout', (req, res) => {
    console.log('Sign out route accessed');
    res.clearCookie('userId', {
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