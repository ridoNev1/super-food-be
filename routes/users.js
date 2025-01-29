const express = require("express");
const router = express.Router();
const db = require("../lib/dbConnection");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ✅ 1. LOGIN - Authenticate User
router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.formatResponse(400, false, "Email and Password are required");
  }

  const query = "SELECT * FROM user WHERE email = ? LIMIT 1";
  db.query(query, [email], async (err, results) => {
    if (err) {
      console.error("Database Error:", err.message);
      return res.formatResponse(500, false, "Internal Server Error", null, {
        error: err.message,
      });
    }

    if (results.length === 0) {
      return res.formatResponse(401, false, "Invalid email or password");
    }

    const user = results[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.formatResponse(401, false, "Invalid email or password");
    }

    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        email: user.email,
        user_level: user.user_level,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES }
    );

    res.formatResponse(200, true, "Login successful", {
      token,
      user: {
        id: user.id,
        nama: user.nama,
        email: user.email,
        phone_number: user.phone_number,
        username: user.username,
        user_level: user.user_level,
      },
    });
  });
});

// ✅ 2. REGISTER - Create New User
router.post("/register", async (req, res) => {
  try {
    const {
      nama,
      alamat,
      email,
      password,
      phone_number,
      user_level,
      username,
      image_profile,
    } = req.body;

    if (!nama || !email || !password || !phone_number || !username) {
      return res.formatResponse(
        400,
        false,
        "Nama, Email, Password, Phone Number, and Username are required"
      );
    }

    const checkQuery = `SELECT id FROM user WHERE email = ? OR phone_number = ? OR username = ? LIMIT 1`;
    db.query(
      checkQuery,
      [email, phone_number, username],
      async (err, results) => {
        if (err) {
          console.error("Database Error:", err.message);
          return res.formatResponse(500, false, "Internal Server Error", null, {
            error: err.message,
          });
        }

        if (results.length > 0) {
          return res.formatResponse(
            400,
            false,
            "Email, Phone Number, or Username already exists"
          );
        }

        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const insertQuery = `
      INSERT INTO user (nama, alamat, email, password, phone_number, user_level, username, image_profile, created_at, update_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;

        db.query(
          insertQuery,
          [
            nama,
            alamat || null,
            email,
            hashedPassword,
            phone_number,
            user_level || 2,
            username,
            image_profile || null,
          ],
          (err, results) => {
            if (err) {
              console.error("Database Error:", err.message);
              return res.formatResponse(
                500,
                false,
                "Internal Server Error",
                null,
                { error: err.message }
              );
            }
            res.formatResponse(201, true, "User registered successfully", {
              userId: results.insertId,
            });
          }
        );
      }
    );
  } catch (error) {
    console.error("Error:", error);
    res.formatResponse(500, false, "Internal Server Error");
  }
});

module.exports = router;
