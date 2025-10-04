import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./src/routes/auth.js";
import shopRoutes from "./src/routes/shop.js";
import inventoryRoutes from "./src/routes/inventory.js";
import billingRoutes from "./src/routes/billing.js";
import reportRoutes from "./src/routes/reports.js";
import { db } from "./src/config/db.js";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// health
app.get("/api/health", (req, res) => res.json({ ok: true }));

// routes
app.use("/api/auth", authRoutes);
app.use("/api/shop", shopRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/reports", reportRoutes);

// start
const PORT = process.env.PORT || 4000;
db.getConnection()
  .then(conn => { conn.release(); app.listen(PORT, () => console.log("API on", PORT)); })
  .catch(err => { console.error("DB connection failed:", err.message); process.exit(1); });
