const express = require("express");
const createError = require("http-errors");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const cors = require("cors");
const responseFormatter = require("./lib/middleware/responseFormatter");
require("dotenv").config();
const indexRouter = require("./routes/index");
const usersRouter = require("./routes/users");
const menuRouter = require("./routes/menu");
const orderRouter = require("./routes/order");
const db = require("./lib/dbConnection");
const verifyToken = require("./lib/middleware/verifyToken");

const app = express();

// ✅ CORS Middleware
app.use(
  cors({
    origin: "*",
    methods: "GET,POST,PUT,DELETE,OPTIONS",
    allowedHeaders: "Content-Type, Authorization",
  })
);

// ✅ Middleware
app.use(logger("dev"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "public")));
app.use(responseFormatter);

// ✅ Token Verification Middleware
app.use(verifyToken);

// ✅ Routes
app.use("/", indexRouter);
app.use("/users", usersRouter);
app.use("/master-menu", menuRouter);
app.use("/order", orderRouter);

// ✅ Error Handling
app.use((req, res, next) => {
  next(createError(404));
});
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    message: err.message,
    error: req.app.get("env") === "development" ? err : {},
  });
});

// ✅ Database Connection
db.getConnection((err, connection) => {
  if (err) {
    console.error("❌ Error connecting to MySQL:", err.message);
  } else {
    console.log("✅ Connected to MySQL database!");
    connection.release();
  }
});

if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}

// ✅ Export for Vercel
module.exports = app;
