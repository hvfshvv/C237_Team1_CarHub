const express = require('express');
const mysql = require('mysql2');
const session = require('express-session');
const flash = require('connect-flash');
const multer = require('multer');
const app = express();

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
            if (req.session.user.role === 'user') res.redirect('/browseCars');
            else res.redirect('/inventory');
        } else {
            req.flash('error', 'Invalid email or password.');
            res.redirect('/login');
        }
    });
});
app.get('/updateCars/:id', (req, res) => {
  const carId = req.params.id;

  db.query('SELECT * FROM cars WHERE carId = ?', [carId], (err, result) => {
    if (err) {
      console.error('Error fetching car for edit:', err);
      return res.status(500).send('Internal Server Error');
    }

    if (result.length === 0) {
      return res.status(404).send('Car not found');
    }

    // Render the edit form and pass the car details to EJS
    res.render('updateCars', { car: result[0] });
  });
});

app.post('/updateCars/:id', (req, res) => {
    const id = req.params.id;
    const { carModel,Year, price, description, status } = req.body;

    db.query(
        'UPDATE cars SET carModel = ?, Year = ?, price = ?, description = ?, status = ? WHERE carId = ?',
        [carModel,Year, price, description, status, id],
        (err, result) => {
            if (err) {
                console.error('Error updating car:', err);
                return res.status(500).send("Error updating car");
            }

            res.redirect('/cars'); // or your item list page
        }
    );
});

app.get('/browseCars', checkAuthenticated, (req, res) => {
    connection.query('SELECT * FROM cars', (error, results) => {
        if (error) throw error;
        res.render('browseCars', { user: req.session.user, cars: results });
    });
});

app.post('/add-to-cart/:id', checkAuthenticated, (req, res) => {
    const carId = parseInt(req.params.id);
    const quantity = parseInt(req.body.quantity) || 1;
    connection.query('SELECT * FROM cars WHERE carId = ?', [carId], (error, results) => {
        if (error) throw error;
        if (results.length > 0) {
            const cars = results[0];
            if (!req.session.cart) req.session.cart = [];
            const existingItem = req.session.cart.find(item => item.carId === carId);
            if (existingItem) {
                existingItem.quantity += quantity;
            } else {
                req.session.cart.push({
                    carId: cars.carId,
                    Year: cars.Year,
                    carModel: cars.carModel,
                    price: cars.price,
                    quantity: cars.quantity,
                    image: cars.image
                });
            }
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

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.get('/car/:id', checkAuthenticated, (req, res) => {
    const carId = req.params.id;
    connection.query('SELECT * FROM cars WHERE carId = ?', [carId], (error, results) => {
        if (error) throw error;
        if (results.length > 0) {
            res.render('car', { car: results[0], user: req.session.user });
        } else {
            res.status(404).send('Car not found');
        }
    });
});

app.get('/addCar', checkAuthenticated, checkAdmin, (req, res) => {
    res.render('addCar', { user: req.session.user });
});

app.post('/addCar', upload.single('image'), (req, res) => {
    const { model, year, price } = req.body;
    const image = req.file ? req.file.filename : null;
    const sql = 'INSERT INTO cars (carModel,Year,description,status ,quantity, price, image) VALUES (?, ?, ?, ?, ?, ?)';
    connection.query(sql, [model, year, price, image], (error, results) => {
        if (error) {
            console.error("Error adding car:", error);
            res.status(500).send('Error adding car');
        } else {
            res.redirect('/inventory');
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
    const carId = req.params.id;
    const { model, year, price } = req.body;

     if (!model || !year || !price || isNaN(Year) || isNaN(price)) {
        req.flash('error', 'All fields must be filled out correctly.');
        return res.redirect(`/updateCars/${carId}`);
    }
    
    let image = req.body.currentImage;
    if (req.file) image = req.file.filename;
    const sql = 'UPDATE cars SET carModel = ?, year = ?, price = ?, image = ? WHERE carId = ?';
    connection.query(sql, [model, Year, price, image, carId], (error, results) => {
        if (error) {
            console.error("Error updating car:", error);
            res.status(500).send('Error updating car');
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CarHub running on port ${PORT}`));
