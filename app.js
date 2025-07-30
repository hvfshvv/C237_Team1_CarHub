const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const app = express();
const bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));



// Set up multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/images');
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname); 
    }
});
const upload = multer({ storage: storage });

const connection = mysql.createConnection({
    host: 'c237-boss.mysql.database.azure.com',
    user: 'c237boss',
    password: 'c237boss!',
    database: 'c237_024_team1'
});

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL:', err);
        return;
    }
    console.log('Connected to MySQL database');
});

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.urlencoded({ extended: false }));

app.use(session({
    secret: 'secret',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(flash());

const checkAuthenticated = (req, res, next) => {
    if (req.session.user) return next();
    req.flash('error', 'Please log in to view this resource');
    res.redirect('/login');
};

const checkAdmin = (req, res, next) => {
    if (req.session.user.role === 'admin') return next();
    req.flash('error', 'Access denied');
    res.redirect('/browseCars');
};

const validateRegistration = (req, res, next) => {
    const { username, email, password, address, contact, role } = req.body;
    if (!username || !email || !password || !address || !contact || !role) {
        return res.status(400).send('All fields are required.');
    }
    if (password.length < 6) {
        req.flash('error', 'Password should be at least 6 characters');
        req.flash('formData', req.body);
        return res.redirect('/register');
    }
    next();
};

// Routes
app.get('/', (req, res) => {
    res.render('index', { user: req.session.user });
});

app.get('/inventory', checkAuthenticated, checkAdmin, (req, res) => {
    connection.query('SELECT * FROM cars', (error, results) => {
        if (error) throw error;
        res.render('inventory', { cars: results, user: req.session.user });
    });
});

app.get('/register', (req, res) => {
    res.render('register', { messages: req.flash('error'), formData: req.flash('formData')[0] });
});

app.post('/register', validateRegistration, (req, res) => {
    const { username, email, password, address, contact, role } = req.body;
    const sql = 'INSERT INTO users (username, email, password, address, contact, role) VALUES (?, ?, SHA1(?), ?, ?, ?)';
    connection.query(sql, [username, email, password, address, contact, role], (err, result) => {
        if (err) throw err;
        req.flash('success', 'Registration successful! Please log in.');
        res.redirect('/login');
    });
});

app.get('/login', (req, res) => {
    res.render('login', { messages: req.flash('success'), errors: req.flash('error') });
});

app.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        req.flash('error', 'All fields are required.');
        return res.redirect('/login');
    }
    const sql = 'SELECT * FROM users WHERE email = ? AND password = SHA1(?)';
    connection.query(sql, [email, password], (err, results) => {
        if (err) throw err;
        if (results.length > 0) {
            req.session.user = results[0];
            if (req.session.user.role === 'admin') {
                res.redirect('/inventory');
            } else {
                res.redirect('/product');
            }
        } else {
            req.flash('error', 'Invalid email or password.');
            res.redirect('/login');
        }
    });
});
app.get('/updateCars/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const carId = req.params.id;
    connection.query('SELECT * FROM cars WHERE carId = ?', [carId], (error, results) => {
        if (error) throw error;
        if (results.length > 0) {
            res.render('updateCars', { car: results[0] });
        } else {
            res.status(404).send('Car not found');
        }
    });
});

app.post('/updateCars/:id', upload.single('image'), (req, res) => {
    const id = req.params.id;
    const { carModel, Year, price, description, status } = req.body;

    let image = req.body.currentImage;
    if (req.file) image = req.file.filename;

    connection.query(
        'UPDATE cars SET carModel = ?, Year = ?, price = ?, description = ?, status = ?, image = ? WHERE carId = ?',
        [carModel, Year, price, description, status, image, id],
        (err, result) => {
            if (err) {
                console.error('Error updating car:', err);
                return res.status(500).send("Error updating car");
            }
            res.redirect('/inventory');
        }
    );
});

app.get('/updateUsers/:id', checkAuthenticated, checkAdmin, (req, res) => {
    const userId = req.params.id;
    connection.query('SELECT * FROM users WHERE userId = ?', [userId], (error, results) => {
        if (error) throw error;
        if (results.length > 0) {
            res.render('updateUsers', { user: results[0] });
        } else {
            res.status(404).send('User not found');
        }
    });
});

app.post('/updateUsers/:id', (req, res) => {
    const id = req.params.id;
    const { username, email, address, contact, role } = req.body;

    connection.query(
        'UPDATE users SET username = ?, email = ?, address = ?, contact = ?, role = ? WHERE userId = ?',
        [username, email, address, contact, role, id],
        (err, result) => {
            if (err) {
                console.error('Error updating user:', err);
                return res.status(500).send("Error updating user");
            }
            res.redirect('/viewusers');
        }
    );
});



app.post('/add-to-cart/:id', checkAuthenticated, (req, res) => {
    const carId = parseInt(req.params.id);

    connection.query('SELECT * FROM cars WHERE carId = ?', [carId], (error, results) => {
        if (error) throw error;

        if (results.length > 0) {
            const car = results[0];
            if (!req.session.cart) req.session.cart = [];

            const existingItem = req.session.cart.find(item => item.carId === carId);
            if (existingItem) {
                return res.redirect('/cart?duplicate=true');
            }

            req.session.cart.push({
                carId: car.carId,
                carModel: car.carModel,
                Year: car.Year,
                price: car.price,
                description: car.description,
                image: car.image
            });

            res.redirect('/cart');
        } else {
            res.status(404).send("Car not found");
        }
    });
});


app.get('/cart', checkAuthenticated, (req, res) => {
    const cart = req.session.cart || [];
    res.render('cart', { cart, user: req.session.user });
});

app.post('/cart/delete', (req, res) => {
  const carIdToDelete = req.body.carId;

  if (req.session.cart) {
    req.session.cart = req.session.cart.filter(item => item.carId !== parseInt(carIdToDelete));
  }

  res.redirect('/cart');
});


app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/car/:id', checkAuthenticated, (req, res) => {
    const carId = parseInt(req.params.id);
    connection.query('SELECT * FROM cars WHERE carId = ?', [carId], (error, results) => {
        if (error) throw error;
        if (results.length > 0) {
            // Get the user cart from session, or empty array if none
            const cart = req.session.cart || [];
            // check for duplicates
            const isInCart = cart.some(item => item.carId === carId);

            res.render('car', { car: results[0], user: req.session.user, isInCart });
        } else {
            res.status(404).send('Car not found');
        }
    });
});


app.get('/addCar', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('addCar', { user: req.session.user });
});

app.post('/addCar', upload.single('image'), (req, res) => {
    const { carModel, Year, description, status, price } = req.body;
    const image = req.file ? req.file.filename : null;
    const sql = 'INSERT INTO cars (carModel, Year, description, status, price, image) VALUES (?, ?, ?, ?, ?, ?)';
    connection.query(sql, [carModel, Year, description, status, price, image], (error, results) => {
        if (error) {
            console.error("Error adding car:", error);
            res.status(500).send('Error adding car');
        } else {
            res.redirect('/inventory');
        }
    });
});


app.get('/deleteCar/:id', (req, res) => {
    const carId = req.params.id;
    connection.query('DELETE FROM cars WHERE carId = ?', [carId], (error, results) => {
        if (error) {
            console.error("Error deleting car:", error);
            res.status(500).send('Error deleting car');
        } else {
            res.redirect('/inventory');
        }
    });
});



app.get('/product', checkAuthenticated, (req, res) => {
    connection.query('SELECT * FROM cars', (error, results) => {
        if (error) throw error;
        res.render('product', { user: req.session.user, cars: results });
    });
});


app.get('/viewusers', checkAuthenticated, checkAdmin, (req, res) => {
    connection.query('SELECT * FROM users', (error, results) => {
        if (error) throw error;
        res.render('viewusers', { users: results, user: req.session.user });
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CarHub running on port ${PORT}`));
