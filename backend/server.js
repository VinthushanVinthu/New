import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./src/routes/auth.js";
import shopRoutes from "./src/routes/shop.js";
import inventoryRoutes from "./src/routes/inventory.js";
import billingRoutes from "./src/routes/billing.js";
import reportRoutes from "./src/routes/reports.js";
import customersRouter from "./src/routes/customers.js";
import staffRouter from "./src/routes/staff.js";
import ownerDashboardRouter from "./src/routes/owner-dashboard.routes.js";
import managerDashboardRouter from "./src/routes/manager-dashboard.routes.js";
import cashierDashboardRouter from "./src/routes/cashier-dashboard.routes.js";
import suppliersRouter from "./src/routes/suppliers.js";
import purchaseOrdersRouter from "./src/routes/purchaseOrders.js";
import emailRouter from  "./src/routes/mail.js"
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
app.use("/api", customersRouter);
app.use("/api/staff", staffRouter);
app.use("/api/owner", ownerDashboardRouter);
app.use('/api/manager', managerDashboardRouter)
app.use('/api/cashier', cashierDashboardRouter)
app.use("/api/mail", emailRouter);
app.use("/api/inventory", suppliersRouter);
app.use("/api/inventory", purchaseOrdersRouter);







// start
const PORT = process.env.PORT || 4000;
db.getConnection()
  .then(conn => { conn.release(); app.listen(PORT, () => console.log("API on", PORT)); })
  .catch(err => { console.error("DB connection failed:", err.message); process.exit(1); });
