const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");  // ✅ JWT ADDED

const app = express();
app.use(express.json());
app.use(cors({
  origin: "*", // Allow all origins for development
  credentials: true
}));

// 🔥 ✅ JWT AUTHENTICATION MIDDLEWARE (NEW)
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key', (err, user) => {
    if (err) return res.status(403).json({ message: "Invalid token" });
    req.user = user;
    next();
  });
};

// MongoDB Connection
const mongoURI = process.env.MONGO_URI;
if (!mongoURI) {
  console.error("❌ MONGO_URI not found!");
  process.exit(1);
}

mongoose.connect(mongoURI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

// 🔥 ✅ PROPER MANUFACTURER SCHEMA WITH PRODUCTS
const manufacturerSchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  ownerName: { type: String, required: true },
  mobile: String,
  email: { type: String, required: true, unique: true },
  username: { type: String, unique: true },
  password: String,
  city: String,
  state: String,
  products: [{
    name: { type: String, required: true },
    description: String,
    price: { type: Number, required: true },
    updatedAt: { type: Date, default: Date.now }
  }],
  updatedAt: { type: Date, default: Date.now }
});

const Manufacturer = mongoose.model("Manufacturer", manufacturerSchema);

const buyerSchema = new mongoose.Schema({
  name: String,
  mobile: String,
  email: String,
  username: { type: String, unique: true },
  password: String
});

const orderSchema = new mongoose.Schema({
  id: String, // ORD123 format
  buyerId: String,
  buyerName: String,
  manufacturerId: String,
  manufacturerName: String,
  product: String,
  quantity: Number,
  price: Number,
  total: Number,
  status: { type: String, default: 'Pending' },
  orderDate: Date,
  statusUpdatedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});


const Buyer = mongoose.model("Buyer", buyerSchema);
const Order = mongoose.model("Order", orderSchema);

// 🔥 ✅ FIXED - SINGLE REGISTER ROUTE (UPDATED WITH PASSWORD SUPPORT)
app.post("/api/manufacturer/register", async (req, res) => {
  try {
    const { companyName, ownerName, mobile, email, username, password, products, city, state } = req.body;

    // Mandatory validation
    if (!companyName || !ownerName || !mobile || !email || !username || !password) {
      return res.status(400).send({ message: "All fields are required" });
    }

    // Duplicate check (email OR username)
    const exists = await Manufacturer.findOne({ 
      $or: [{ email }, { username }] 
    });

    if (exists) {
      return res.status(400).send({ message: "Email or Username already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new manufacturer object
    const m = new Manufacturer({
      companyName,
      ownerName,
      mobile,
      email,
      username,
      password: hashedPassword,
      city,
      state,
      products: products || []
    });

    await m.save();

    res.send({ message: "Manufacturer Registered Successfully", user: m });

  } catch (err) {
    res.status(500).send({
      message: "Server Error",
      error: err.message
    });
  }
});

// 🔥 ✅ MANUFACTURER LOGIN WITH JWT (UPDATED)
app.post("/api/manufacturer/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await Manufacturer.findOne({
      $or: [{ username }, { email: username }]
    }).select('+password');

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(400).json({ message: "Invalid password" });
    }

    // ✅ JWT TOKEN GENERATE
    const token = jwt.sign(
      { 
        id: user._id, 
        type: 'manufacturer',
        companyName: user.companyName 
      }, 
      process.env.JWT_SECRET || 'your_secret_key',
      { expiresIn: '24h' }
    );

    res.json({
      message: "Login successful",
      token: token,  // ✅ TOKEN ADDED
      user: {
        _id: user._id,
        companyName: user.companyName,
        email: user.email,
        mobile: user.mobile,
        city: user.city,
        state: user.state,
        products: user.products
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Login error" });
  }
});

// 🔥 ✅ PROTECTED - UPDATE PRODUCTS (CURRENT USER ONLY)
app.put("/api/manufacturer/update-products", authenticateToken, async (req, res) => {
  try {
    // ✅ ONLY MANUFACTURER ACCESS
    if (req.user.type !== 'manufacturer') {
      return res.status(403).json({ message: "Access denied" });
    }

    console.log("📥 Update request:", req.body); // Debug log
    
    const { products } = req.body; // id not needed - use token id
    
    if (!Array.isArray(products)) {
      return res.status(400).json({ message: "Products must be an array" });
    }

    const manufacturer = await Manufacturer.findByIdAndUpdate(
      req.user.id,  // ✅ CURRENT USER ID FROM TOKEN
      { 
        products,
        updatedAt: new Date()
      },
      { 
        new: true,
        runValidators: true
      }
    );

    if (!manufacturer) {
      return res.status(404).json({ message: "Manufacturer not found" });
    }

    console.log("✅ Products updated:", manufacturer._id, "Products count:", products.length);
    res.json(manufacturer); // ✅ Returns FULL updated document
  } catch (error) {
    console.error("❌ Update products error:", error);
    res.status(500).json({ 
      message: "Failed to update products", 
      error: error.message 
    });
  }
});

// 🔥 ✅ PROTECTED - MANUFACTURER PROFILE (CURRENT USER ONLY)
app.get("/api/manufacturer/profile", authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'manufacturer') {
      return res.status(403).json({ message: "Access denied" });
    }
    
    const manufacturer = await Manufacturer.findById(req.user.id);
    if (!manufacturer) {
      return res.status(404).json({ message: "Manufacturer not found" });
    }
    
    res.json(manufacturer);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// Get all manufacturers (PUBLIC - for buyer selection)
app.get("/api/manufacturer/all", async (req, res) => {
  try {
    const manufacturers = await Manufacturer.find({}, { password: 0 });
    console.log(`📊 Total manufacturers: ${manufacturers.length}`);
    res.json(manufacturers);
  } catch (error) {
    console.error("❌ Get all error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// Buyer & Order routes (PROTECTED)
app.post("/api/buyer/register", async (req, res) => {
  try {
    const hashed = await bcrypt.hash(req.body.password, 10);
    const buyer = new Buyer({ ...req.body, password: hashed });
    await buyer.save();
    res.json({ message: "Buyer registered" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// 🔥 ✅ BUYER LOGIN WITH JWT (UPDATED)
app.post("/api/buyer/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await Buyer.findOne({ username }).select('+password');
    
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // ✅ JWT TOKEN FOR BUYER
    const token = jwt.sign(
      { id: user._id, type: 'buyer', name: user.name }, 
      process.env.JWT_SECRET || 'your_secret_key',
      { expiresIn: '24h' }
    );

    res.json({ 
      message: "Login success", 
      token: token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// 🔥 ✅ PROTECTED - CREATE ORDER (BUYER ONLY)
app.post("/api/order/create", authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'buyer') {
      return res.status(403).json({ message: "Access denied" });
    }
    
    const order = new Order({
      ...req.body,
      buyerId: req.user.id,
      buyerName: req.user.name
    });
    await order.save();
    res.json({ message: "Order created" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// 🔥 ✅ PROTECTED - MANUFACTURER ORDERS (CURRENT USER ONLY)
app.get("/api/orders/manufacturer", authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'manufacturer') {
      return res.status(403).json({ message: "Access denied" });
    }
    const orders = await Order.find({ manufacturerId: req.user.id });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// 🔥 ✅ PROTECTED - BUYER ORDERS (CURRENT USER ONLY)
app.get("/api/orders/buyer", authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'buyer') {
      return res.status(403).json({ message: "Access denied" });
    }
    const orders = await Order.find({ buyerId: req.user.id });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// 🔥 ✅ PROTECTED - UPDATE ORDER STATUS (MANUFACTURER ONLY)
app.put("/api/order/status/:id", authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'manufacturer') {
      return res.status(403).json({ message: "Access denied" });
    }
    
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    
    if (order.manufacturerId.toString() !== req.user.id) {
      return res.status(403).json({ message: "Not authorized for this order" });
    }
    
    await Order.findByIdAndUpdate(req.params.id, { status: req.body.status });
    res.json({ message: "Status updated" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// BACKWARD COMPATIBILITY ROUTES (Deprecated)
app.get("/api/orders/manufacturer/:id", async (req, res) => {
  console.warn("⚠️ Deprecated route: /api/orders/manufacturer/:id");
  const orders = await Order.find({ manufacturerId: req.params.id });
  res.json(orders);
});

app.get("/api/orders/buyer/:id", async (req, res) => {
  console.warn("⚠️ Deprecated route: /api/orders/buyer/:id");
  const orders = await Order.find({ buyerId: req.params.id });
  res.json(orders);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔗 Profile: http://localhost:${PORT}/api/manufacturer/profile`);
  console.log(`🔗 Orders: http://localhost:${PORT}/api/orders/manufacturer`);
  console.log(`🔗 Update: http://localhost:${PORT}/api/manufacturer/update-products`);
});
