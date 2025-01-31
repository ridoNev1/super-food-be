const express = require("express");
const router = express.Router();
const db = require("../lib/dbConnection");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const uploadMiddleware = require("../lib/middleware/uploadFile");
const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");

// 🔹 Configure AWS S3
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const S3_BUCKET = process.env.S3_BUCKET_NAME;

// ✅ 1. LOGIN - Authenticate User
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.formatResponse(400, false, "Email and Password are required");
    }

    const connection = await db.getConnection();
    const [users] = await connection.query(
      "SELECT * FROM users WHERE email = ? LIMIT 1",
      [email]
    );
    connection.release();

    if (users.length === 0) {
      return res.formatResponse(401, false, "Invalid email or password");
    }

    const user = users[0];

    // ✅ Compare password securely
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.formatResponse(401, false, "Invalid email or password");
    }

    // ✅ Generate JWT Token
    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        email: user.email,
        user_level: user.user_level,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES || "7d" }
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
        image_profile: user.image_profile || null,
        alamat: user.alamat || null,
      },
    });
  } catch (error) {
    console.error("🚨 Login Error:", error.message);
    res.formatResponse(500, false, "Internal Server Error", null, {
      error: error.message,
    });
  }
});

// ✅ 2. REGISTER - Create New User
router.post("/register", async (req, res) => {
  try {
    const { nama, email, password, phone_number, user_level, username } =
      req.body;

    if (!nama || !email || !password || !phone_number || !username) {
      return res.formatResponse(
        400,
        false,
        "Nama, Email, Password, Phone Number, and Username are required"
      );
    }

    const connection = await db.getConnection();

    // ✅ Check if email, phone number, or username already exists
    const [existingUsers] = await connection.query(
      `SELECT id FROM users WHERE email = ? OR phone_number = ? OR username = ? LIMIT 1`,
      [email, phone_number, username]
    );

    if (existingUsers.length > 0) {
      connection.release();
      return res.formatResponse(
        400,
        false,
        "Email, Phone Number, or Username already exists"
      );
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const [insertResult] = await connection.query(
      `INSERT INTO users (nama, alamat, email, password, phone_number, user_level, username, image_profile, created_at, updated_at) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        nama,
        null,
        email,
        hashedPassword,
        phone_number,
        user_level || 2,
        username,
        null,
      ]
    );

    connection.release();

    res.formatResponse(201, true, "User registered successfully", {
      userId: insertResult.insertId,
    });
  } catch (error) {
    console.error("🚨 Registration Error:", error.message);
    res.formatResponse(500, false, "Internal Server Error", null, {
      error: error.message,
    });
  }
});

/**
 * ✅ PATCH: Update `alamat` (address) or `image_profile`
 */
router.patch(
  "/update-profile/:id",
  uploadMiddleware("image_profile"),
  async (req, res) => {
    try {
      const userId = req.params.id;
      const { alamat } = req.body;
      const newImageUrl = req.fileUrl || null;

      if (!alamat && !newImageUrl) {
        return res.formatResponse(
          400,
          false,
          "Provide at least one field to update (alamat or image_profile)"
        );
      }

      const connection = await db.getConnection();
      const [users] = await connection.query(
        `SELECT image_profile FROM users WHERE id = ? LIMIT 1`,
        [userId]
      );

      if (users.length === 0) {
        connection.release();
        return res.formatResponse(404, false, "User not found");
      }

      const oldImage = users[0].image_profile;

      // 🔹 Update Database
      let updateQuery = `UPDATE users SET updated_at = NOW() `;
      let updateValues = [];

      if (alamat) {
        updateQuery += `, alamat = ?`;
        updateValues.push(alamat);
      }

      if (newImageUrl) {
        updateQuery += `, image_profile = ?`;
        updateValues.push(newImageUrl);

        // 🔹 Delete old image from S3
        if (oldImage) {
          const oldImageKey = oldImage.split(`${S3_BUCKET}/`)[1];
          await s3.send(
            new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: oldImageKey })
          );
        }
      }

      updateQuery += ` WHERE id = ?`;
      updateValues.push(userId);

      await connection.query(updateQuery, updateValues);
      connection.release();

      res.formatResponse(200, true, "Profile updated successfully", {
        userId,
        alamat: alamat || users[0].alamat,
        image_profile: newImageUrl || oldImage,
      });
    } catch (error) {
      console.error("🚨 Profile Update Error:", error.message);
      res.formatResponse(500, false, "Internal Server Error", null, {
        error: error.message,
      });
    }
  }
);

module.exports = router;
