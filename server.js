const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
app.use(cors({
  origin: "*", 
  credentials: true
}));

// 🔥 JWT AUTHENTICATION MIDDLEWARE
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

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

// SCHEMAS
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
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    department: { type: String, default: '' },           // ✅ NEW
    category: { type: String, default: '' },             // ✅ NEW
    district: { type: String, default: '' },             // ✅ NEW
    state: { type: String, default: 'Tamil Nadu' },      // ✅ NEW
    mfgDate: { type: Date },                             // ✅ NEW
    image: { type: String },                             // ✅ NEW
    updatedAt: { type: Date, default: Date.now }
  }],
  updatedAt: { type: Date, default: Date.now }
});


const buyerSchema = new mongoose.Schema({
  name: String,
  mobile: String,
  email: String,
  username: { type: String, unique: true },
  password: String
});

const orderSchema = new mongoose.Schema({
  id: String,
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

const Manufacturer = mongoose.model("Manufacturer", manufacturerSchema);
const Buyer = mongoose.model("Buyer", buyerSchema);
const Order = mongoose.model("Order", orderSchema);

// 🔥 HEALTH CHECK - Frontend expects this
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 🔥 MANUFACTURER ROUTES
app.post("/api/manufacturer/register", async (req, res) => {
  try {
    const { companyName, ownerName, mobile, email, username, password, products, city, state } = req.body;

    if (!companyName || !ownerName || !mobile || !email || !username || !password) {
      return res.status(400).send({ message: "All fields are required" });
    }

    const exists = await Manufacturer.findOne({ $or: [{ email }, { username }] });
    if (exists) {
      return res.status(400).send({ message: "Email or Username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const m = new Manufacturer({
      companyName, ownerName, mobile, email, username,
      password: hashedPassword, city, state, products: products || []
    });

    await m.save();
    res.send({ message: "Manufacturer Registered Successfully", user: m });
  } catch (err) {
    res.status(500).send({ message: "Server Error", error: err.message });
  }
});

app.post("/api/manufacturer/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await Manufacturer.findOne({ $or: [{ username }, { email: username }] }).select('+password');

    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, type: 'manufacturer', companyName: user.companyName },
      process.env.JWT_SECRET || 'your_secret_key',
      { expiresIn: '24h' }
    );

    res.json({
      message: "Login successful",
      token,
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

// 🔥 BUYER ROUTES - FIXED FOR FRONTEND COMPATIBILITY
app.post("/api/buyer/register", async (req, res) => {
  try {
    const hashed = await bcrypt.hash(req.body.password, 10);
    const buyer = new Buyer({ ...req.body, password: hashed });
    await buyer.save();
    
    // Return buyerId for frontend localStorage
    res.json({ 
      message: "Buyer registered", 
      buyerId: buyer._id.toString(),
      buyerName: buyer.name 
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/buyer/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await Buyer.findOne({ username }).select('+password');
    
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { 
        id: user._id, 
        type: 'buyer', 
        name: user.name,
        buyerId: user._id.toString()  // ✅ FIXED: Frontend expects this
      },
      process.env.JWT_SECRET || 'your_secret_key',
      { expiresIn: '24h' }
    );

    res.json({ 
      message: "Login success", 
      token,
      user: {
        _id: user._id,
        buyerId: user._id.toString(),  // ✅ Frontend expects this
        name: user.name,
        email: user.email
      }
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// 🔥 NEW: FRONTEND EXPECTS /api/orders (POST)
app.post("/api/orders", authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'buyer') {
      return res.status(403).json({ message: "Access denied - Buyer only" });
    }
    
    const orderId = `ORD${Date.now().toString().slice(-6)}`;
    const order = new Order({
      id: orderId,
      buyerId: req.user.buyerId || req.user.id.toString(),
      buyerName: req.user.name,
      manufacturerId: req.body.manufacturerId,
      manufacturerName: req.body.manufacturerName,
      product: req.body.product,
      quantity: req.body.quantity,
      price: req.body.price,
      total: req.body.total,
      status: req.body.status || 'Pending',
      orderDate: req.body.orderDate || new Date()
    });
    
    await order.save();
    console.log(`✅ New order created: ${orderId} by ${req.user.name}`);
    
    res.json({
      message: "Order created successfully",
      id: orderId,
      orderId,
      _id: order._id
    });
  } catch (err) {
    console.error("❌ Order creation error:", err);
    res.status(500).json({ message: "Order creation failed", error: err.message });
  }
});
// 🔥 ADD THESE 2 ROUTES TO YOUR BACKEND (after existing manufacturer orders route)

// ✅ ROUTE 1: Manufacturer Orders (Frontend expects this EXACT path)
app.get("/api/manufacturer/orders", authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'manufacturer') {
      return res.status(403).json({ message: "Access denied - Manufacturer only" });
    }
    
    const orders = await Order.find({ 
      manufacturerId: req.user.id 
    })
    .sort({ createdAt: -1 })
    .select('-__v');
    
    // Frontend expects { orders: [...] } format
    res.json({ 
      orders: orders,
      count: orders.length 
    });
    
    console.log(`📦 Manufacturer ${req.user.companyName} orders: ${orders.length}`);
  } catch (err) {
    console.error("❌ Manufacturer orders error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ ROUTE 2: Update Order Status (Frontend expects this EXACT path)
app.put("/api/manufacturer/orders/update", authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'manufacturer') {
      return res.status(403).json({ message: "Access denied - Manufacturer only" });
    }

    const { orderId, status } = req.body;
    
    if (!orderId || !status) {
      return res.status(400).json({ message: "orderId and status required" });
    }

    const order = await Order.findOne({ 
      _id: orderId, 
      manufacturerId: req.user.id 
    });
    
    if (!order) {
      return res.status(404).json({ message: "Order not found or not authorized" });
    }

    // Validate status workflow
    const statusWorkflow = {
      'Pending': ['Allowed', 'Cancelled'],
      'Allowed': ['Approved', 'Cancelled'],
      'Approved': ['Delivered', 'Cancelled'],
      'Delivered': [],
      'Cancelled': []
    };

    const validNextStatuses = statusWorkflow[order.status] || [];
    if (!validNextStatuses.includes(status)) {
      return res.status(400).json({ 
        message: `Invalid status transition from ${order.status} to ${status}`,
        allowed: validNextStatuses
      });
    }

    const updatedOrder = await Order.findByIdAndUpdate(
      order._id,
      { 
        status, 
        statusUpdatedAt: new Date() 
      },
      { new: true }
    );

    console.log(`✅ Order ${orderId} updated to ${status} by ${req.user.companyName}`);
    
    res.json({ 
      message: "Status updated successfully",
      order: updatedOrder 
    });
  } catch (err) {
    console.error("❌ Order update error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// 🔥 FRONTEND EXPECTS THIS EXACT ROUTE - BACKWARD COMPATIBILITY
app.get("/api/buyer/:buyerId/orders", async (req, res) => {
  try {
    const orders = await Order.find({ buyerId: req.params.buyerId })
      .sort({ createdAt: -1 })
      .select('-__v');
    
    console.log(`📦 Buyer ${req.params.buyerId} orders: ${orders.length}`);
    res.json(orders);
  } catch (err) {
    console.error("❌ Buyer orders error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// 🔥 PROTECTED ROUTES
app.put("/api/manufacturer/update-products", authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'manufacturer') {
      return res.status(403).json({ message: "Access denied" });
    }

    const { products } = req.body;
    if (!Array.isArray(products)) {
      return res.status(400).json({ message: "Products must be an array" });
    }

    const manufacturer = await Manufacturer.findByIdAndUpdate(
      req.user.id,
      { products, updatedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!manufacturer) {
      return res.status(404).json({ message: "Manufacturer not found" });
    }

    res.json(manufacturer);
  } catch (error) {
    res.status(500).json({ message: "Failed to update products", error: error.message });
  }
});

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

app.get("/api/manufacturer/all", async (req, res) => {
  try {
    const manufacturers = await Manufacturer.find({}, { password: 0 });
    res.json(manufacturers);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

// 🔥 FIXED: Buyer orders endpoint (frontend expects /api/orders/buyer)
app.get("/api/orders/buyer", authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'buyer') {
      return res.status(403).json({ message: "Access denied" });
    }
    const orders = await Order.find({ buyerId: req.user.buyerId || req.user.id })
      .sort({ createdAt: -1 })
      .select('-__v');
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// 🔥 Manufacturer orders endpoint
app.get("/api/orders/manufacturer", authenticateToken, async (req, res) => {
  try {
    if (req.user.type !== 'manufacturer') {
      return res.status(403).json({ message: "Access denied" });
    }
    const orders = await Order.find({ manufacturerId: req.user.id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// 🔥 Order status update (manufacturer only)
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
    
    await Order.findByIdAndUpdate(req.params.id, { 
      status: req.body.status,
      statusUpdatedAt: new Date()
    });
    res.json({ message: "Status updated" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// 🔥 BACKWARD COMPATIBILITY (Frontend expects these)
app.get("/api/orders/manufacturer/:id", async (req, res) => {
  console.warn("⚠️ Deprecated route: /api/orders/manufacturer/:id");
  const orders = await Order.find({ manufacturerId: req.params.id }).sort({ createdAt: -1 });
  res.json(orders);
});

app.get("/api/orders/buyer/:id", async (req, res) => {
  console.warn("⚠️ Deprecated route: /api/orders/buyer/:id");
  const orders = await Order.find({ buyerId: req.params.id }).sort({ createdAt: -1 });
  res.json(orders);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔗 Health: http://localhost:${PORT}/api/health`);
  console.log(`🔗 Orders: POST http://localhost:${PORT}/api/orders`);
  console.log(`🔗 Buyer orders: GET http://localhost:${PORT}/api/orders/buyer`);
  console.log(`🔗 All manufacturers: GET http://localhost:${PORT}/api/manufacturer/all`);
});
