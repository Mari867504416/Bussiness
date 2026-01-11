const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
app.use(cors());

// ===== MongoDB Connection =====


const mongoURI = process.env.MONGO_URI;

if (!mongoURI) {
  console.error("❌ MONGO_URI not found in environment variables");
  process.exit(1);
}

mongoose
  .connect(mongoURI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ MongoDB connection error:", err.message));


// ====== SCHEMAS ======

// Manufacturer
const manufacturerSchema = new mongoose.Schema({
  companyName: String,
  ownerName: String,
  mobile: String,
  email: String,
  username: String,
  password: String
});

// Buyer
const buyerSchema = new mongoose.Schema({
  name: String,
  mobile: String,
  email: String,
  username: String,
  password: String
});

// Orders
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

const Manufacturer = mongoose.model("Manufacturer", manufacturerSchema);
const Buyer = mongoose.model("Buyer", buyerSchema);
const Order = mongoose.model("Order", orderSchema);


// ====== API ROUTES ======

// Manufacturer Registration
app.post("/api/manufacturer/register", async (req,res)=>{
  const data = req.body;

  const hashed = await bcrypt.hash(data.password, 10);

  const m = new Manufacturer({...data, password: hashed});
  await m.save();
  res.send({message:"Manufacturer Registered"});
});

// Manufacturer Login
// Manufacturer Login (FINAL)
app.post("/api/manufacturer/login", async (req,res)=>{
  const { username, password } = req.body;

  // user can login using username OR email
  const user = await Manufacturer.findOne({
    $or: [
      { username: username },
      { email: username }
    ]
  });

  if(!user) return res.status(400).send({ message:"User not found" });

  const ok = await bcrypt.compare(password, user.password);
  if(!ok) return res.status(400).send({ message:"Invalid password" });

  res.send({
    message:"Login success",
    user:{
      _id:user._id,
      companyName:user.companyName,
      email:user.email,
      mobile:user.mobile
    }
  });
});



// Buyer Registration
app.post("/api/buyer/register", async (req,res)=>{
  const data = req.body;

  const hashed = await bcrypt.hash(data.password, 10);

  const b = new Buyer({...data, password: hashed});
  await b.save();
  res.send({message:"Buyer Registered"});
});


// Buyer Login
app.post("/api/buyer/login", async (req,res)=>{
  const {username,password} = req.body;

  const user = await Buyer.findOne({username});
  if(!user) return res.status(400).send({message:"User not found"});

  const ok = await bcrypt.compare(password,user.password);
  if(!ok) return res.status(400).send({message:"Invalid password"});

  res.send({message:"Login success", user});
});


// Create Order (Buyer)
app.post("/api/order/create", async(req,res)=>{
  const order = new Order(req.body);
  await order.save();
  res.send({message:"Order Placed"});
});

// Get Orders for Manufacturer Dashboard
app.get("/api/orders/manufacturer/:id", async(req,res)=>{
  const list = await Order.find({manufacturerId:req.params.id});
  res.send(list);
});

// Get Orders for Buyer Dashboard
app.get("/api/orders/buyer/:id", async(req,res)=>{
  const list = await Order.find({buyerId:req.params.id});
  res.send(list);
});

// Update Order Status
app.put("/api/order/status/:id", async(req,res)=>{
  await Order.findByIdAndUpdate(req.params.id,{status:req.body.status});
  res.send({message:"Updated"});
});
app.post("/api/manufacturer/register", async (req,res)=>{
  const { username, email, password } = req.body;

  const exists = await Manufacturer.findOne({ username });
  if (exists) return res.status(400).send({ message: "Username already exists" });

  const hashed = await bcrypt.hash(password, 10);
  const m = new Manufacturer({ ...req.body, password: hashed });

  await m.save();
  res.send({ message: "Manufacturer Registered" });
});



// Run server
app.listen(5000,()=>console.log("Server running on 5000"));


