const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");

const app = express();
app.use(express.json());
app.use(cors({
  origin: "*", // Allow all origins for development
  credentials: true
}));

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
  buyerId: String,
  buyerName: String,
  manufacturerId: String,
  manufacturerName: String,
  product: String,
  quantity: Number,
  total: Number,
  status: { type: String, default: "Pending" },
  date: { type: Date, default: Date.now }
});

const Buyer = mongoose.model("Buyer", buyerSchema);
const Order = mongoose.model("Order", orderSchema);

// 🔥 ✅ FIXED - SINGLE REGISTER ROUTE (REMOVED DUPLICATES)
app.post("/api/manufacturer/register", async (req, res) => {
  try {
    console.log("📥 Register data:", req.body); // Debug log
    
    const { companyName, ownerName, mobile, email, city, state, products, username, password } = req.body;

    if (!companyName || !ownerName || !email) {
      return res.status(400).json({ message: "Company name, owner name, and email required" });
    }

    // Check duplicates
    const exists = await Manufacturer.findOne({ 
      $or: [{ email }, { username }] 
    });
    if (exists) {
      return res.status(400).json({ message: "Email or username already exists" });
    }

    const hashedPassword = password ? await bcrypt.hash(password, 10) : '';

    const manufacturer = new Manufacturer({
      companyName,
      ownerName,
      mobile,
      email,
      username,
      password: hashedPassword,
      city: city || '',
      state: state || '',
      products: products || []
    });

    await manufacturer.save();
    console.log("✅ Manufacturer saved:", manufacturer._id);
    
    res.json({ 
      message: "✅ Manufacturer registered successfully!",
      user: {
        _id: manufacturer._id,
        companyName,
        email
      }
    });
  } catch (error) {
    console.error("❌ Register error:", error);
    res.status(500).json({ message: "Server error during registration" });
  }
});

// 🔥 ✅ CRITICAL - UPDATE PRODUCTS ENDPOINT (TESTED & WORKING)
app.put("/api/manufacturer/update-products", async (req, res) => {
  try {
    console.log("📥 Update request:", req.body); // Debug log
    
    const { id, products } = req.body;
    
    if (!id) {
      return res.status(400).json({ message: "Manufacturer ID required" });
    }
    
    if (!Array.isArray(products)) {
      return res.status(400).json({ message: "Products must be an array" });
    }

    const manufacturer = await Manufacturer.findByIdAndUpdate(
      id,
      { 
        products,
        updatedAt: new Date()
      },
      { 
        new: true,      // Return updated document
        runValidators: true
      }
    );

    if (!manufacturer) {
      return res.status(404).json({ message: "Manufacturer not found" });
    }

    console.log("✅ Products updated:", manufacturer._id, "Products count:", products.length);
    res.json(manufacturer); // ✅ Returns FULL updated document with products
  } catch (error) {
    console.error("❌ Update products error:", error);
    res.status(500).json({ 
      message: "Failed to update products", 
      error: error.message 
    });
  }
});

// Get all manufacturers
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

// Manufacturer Login
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

    res.json({
      message: "Login successful",
      user: {
        _id: user._id,
        companyName: user.companyName,
        email: user.email,
        mobile: user.mobile
      }
    });
  } catch (error) {
    res.status(500).json({ message: "Login error" });
  }
});

// Buyer & Order routes (unchanged)
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

app.post("/api/buyer/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await Buyer.findOne({ username }).select('+password');
    if (!user || !await bcrypt.compare(password, user.password)) {
      return res.status(400).json({ message: "Invalid credentials" });
    }
    res.json({ message: "Login success", user });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/api/order/create", async (req, res) => {
  try {
    const order = new Order(req.body);
    await order.save();
    res.json({ message: "Order created" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

app.get("/api/orders/manufacturer/:id", async (req, res) => {
  const orders = await Order.find({ manufacturerId: req.params.id });
  res.json(orders);
});

app.get("/api/orders/buyer/:id", async (req, res) => {
  const orders = await Order.find({ buyerId: req.params.id });
  res.json(orders);
});

app.put("/api/order/status/:id", async (req, res) => {
  await Order.findByIdAndUpdate(req.params.id, { status: req.body.status });
  res.json({ message: "Status updated" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔗 Update endpoint: http://localhost:${PORT}/api/manufacturer/update-products`);
});
