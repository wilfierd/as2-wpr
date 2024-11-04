const express = require('express');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config(); // Load environment variables

const app = express();
const PORT = 8000;

// MySQL connection
async function connectToDatabase() {
    try {
        const db = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
        });
        return db;
    } catch (err) {
        console.error('Cannot connect to the database:', err);
        process.exit(1); // Exit the process with an error code
    }
}

connectToDatabase();

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.set('view engine', 'ejs');

// Routes
const authRoute = require('./routes/auth');
const emailRoute = require('./routes/email');
// Render the sign-in page (homepage)
function isAuthenticated(req, res, next) {
    if (req.cookies.userId) {
        return res.redirect('/emails/inbox');
    }
    next();
}


app.use('/auth', authRoute);
app.use('/emails', emailRoute);
app.get('/', isAuthenticated,(req, res) => {
    res.render('signin');
});
  


app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});