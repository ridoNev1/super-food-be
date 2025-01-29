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

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "jade");
app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParserMiddleware);
app.use(responseFormatter);
app.use("/", indexRouter);
app.use("/users", usersRouter);
app.use("/master-menu", menuRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

db.getConnection((err, connection) => {
  if (err) {
    console.error("Error connecting to MySQL:", err.message);
  } else {
    console.log("Connected to MySQL database!");
    connection.release();
  }
});

module.exports = app;
