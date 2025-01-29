const createError = require("http-errors");
const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const logger = require("morgan");
const multer = require("multer");
const responseFormatter = require("./lib/middleware/responseFormatter");

const indexRouter = require("./routes/index");
const usersRouter = require("./routes/users");
const menuRouter = require("./routes/menu");

const app = express();
const db = require("./lib/dbConnection");
const upload = multer();

const bodyParserMiddleware = [
  express.json(),
  express.urlencoded({ extended: true }),
  upload.none(),
];

// Middleware
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParserMiddleware);
app.use(responseFormatter);

// Routes
app.use("/", indexRouter);
app.use("/users", usersRouter);
app.use("/master-menu", menuRouter);

// Error Handling
app.use((req, res, next) => {
  next(createError(404));
});

app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    message: err.message,
    error: req.app.get("env") === "development" ? err : {},
  });
});

// Database Connection
db.getConnection((err, connection) => {
  if (err) {
    console.error("Error connecting to MySQL:", err.message);
  } else {
    console.log("Connected to MySQL database!");
    connection.release();
  }
});

// **This is required for Vercel deployment**
const serverless = require("serverless-http");
module.exports = serverless(app);
