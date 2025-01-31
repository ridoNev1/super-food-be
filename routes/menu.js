const express = require("express");
const router = express.Router();
const db = require("../lib/dbConnection");
const uploadMiddleware = require("../lib/middleware/uploadFile");
const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");

// 🔹 Configure AWS S3 (AWS SDK v3)
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const S3_BUCKET = process.env.S3_BUCKET_NAME;

// ✅ 1. CREATE MENU ITEM (WITH IMAGE UPLOAD)
router.post("/menu", uploadMiddleware("images", true), async (req, res) => {
  try {
    const { name, price, description, quantity } = req.body;
    const imageUrls = req.fileUrls || [];

    if (!name || !price || !description || !quantity) {
      return res.formatResponse(
        400,
        false,
        "All fields except images are required"
      );
    }

    const [menuResult] = await db.query(
      `INSERT INTO menu (name, price, description, quantity, created_at, updated_at) 
       VALUES (?, ?, ?, ?, NOW(), NOW())`,
      [name, price, description, quantity]
    );

    const menuId = menuResult.insertId;

    // 🔹 Store images in DB (Save S3 URLs)
    if (imageUrls.length > 0) {
      await Promise.all(
        imageUrls.map((imageUrl) =>
          db.query(
            `INSERT INTO menu_images (menu_id, image_url) VALUES (?, ?)`,
            [menuId, imageUrl]
          )
        )
      );
    }

    res.formatResponse(201, true, "Menu item added successfully with images", {
      menuId,
      images: imageUrls,
    });
  } catch (error) {
    console.error("🚨 Database Error:", error.message);
    res.formatResponse(500, false, "Internal Server Error", null, {
      error: error.message,
    });
  }
});

// ✅ 2. READ ALL MENU ITEMS (WITH IMAGES)
router.get("/menu", async (req, res) => {
  try {
    let { page, limit } = req.query;
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    const offset = (page - 1) * limit;

    const connection = await db.getConnection();

    const [menuItems] = await connection.query(
      `SELECT 
        m.id, m.name, m.price, m.description, m.quantity,
        COALESCE(JSON_ARRAYAGG(
          JSON_OBJECT('id', mi.id, 'url', mi.image_url)
        ), '[]') AS images
      FROM menu m
      LEFT JOIN menu_images mi ON m.id = mi.menu_id
      GROUP BY m.id
      LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    menuItems.forEach((item) => {
      item.images = JSON.parse(item.images);
    });

    const [[{ totalItems }]] = await connection.query(
      `SELECT COUNT(*) AS totalItems FROM menu`
    );
    connection.release();

    res.status(200).json({
      success: true,
      message: "Menu items fetched successfully",
      data: menuItems,
      pagination: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
      },
    });
  } catch (error) {
    console.error("🚨 Database Error:", error.message);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
});

// ✅ 3. GET MENU ITEM BY ID (WITH IMAGES)
router.get("/menu/:id", async (req, res) => {
  try {
    const menuId = req.params.id;
    const connection = await db.getConnection();

    const [results] = await connection.query(
      `SELECT 
        m.id, m.name, m.price, m.description, m.quantity,
        COALESCE(JSON_ARRAYAGG(
          JSON_OBJECT('id', mi.id, 'url', mi.image_url)
        ), '[]') AS images
      FROM menu m
      LEFT JOIN menu_images mi ON m.id = mi.menu_id
      WHERE m.id = ?
      GROUP BY m.id`,
      [menuId]
    );

    connection.release();

    if (results.length === 0) {
      return res.formatResponse(404, false, "Menu item not found");
    }

    results[0].images = JSON.parse(results[0].images);

    res.formatResponse(200, true, "Menu item fetched successfully", results[0]);
  } catch (error) {
    console.error("🚨 Database Error:", error.message);
    res.formatResponse(500, false, "Internal Server Error", null, {
      error: error.message,
    });
  }
});

// ✅ 4. UPDATE MENU ITEM (WITH IMAGE UPDATE)
router.put("/menu/:id", uploadMiddleware("images", true), async (req, res) => {
  try {
    const menuId = req.params.id;
    const { name, price, description, quantity, deleteImages } = req.body;
    const imageUrls = req.fileUrls || [];

    if (!name || !price || !description || !quantity) {
      return res.formatResponse(
        400,
        false,
        "All fields except images are required"
      );
    }

    const connection = await db.getConnection();

    const [updateResult] = await connection.query(
      `UPDATE menu SET name = ?, price = ?, description = ?, quantity = ?, updated_at = NOW() WHERE id = ?`,
      [name, price, description, quantity, menuId]
    );

    if (updateResult.affectedRows === 0) {
      connection.release();
      return res.formatResponse(404, false, "Menu item not found");
    }

    // 🔹 Delete selected images from S3
    if (deleteImages && deleteImages.length > 0) {
      await Promise.all(
        deleteImages.map(async (imageUrl) => {
          const key = imageUrl.split(`${S3_BUCKET}/`)[1];
          await s3.send(
            new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key })
          );
          await connection.query(
            `DELETE FROM menu_images WHERE image_url = ?`,
            [imageUrl]
          );
        })
      );
    }

    // 🔹 Upload new images to DB
    if (imageUrls.length > 0) {
      await Promise.all(
        imageUrls.map((imageUrl) =>
          connection.query(
            `INSERT INTO menu_images (menu_id, image_url) VALUES (?, ?)`,
            [menuId, imageUrl]
          )
        )
      );
    }

    connection.release();
    res.formatResponse(200, true, "Menu item updated successfully", {
      menuId,
      images: imageUrls,
    });
  } catch (error) {
    console.error("🚨 Database Error:", error.message);
    res.formatResponse(500, false, "Internal Server Error", null, {
      error: error.message,
    });
  }
});

// ✅ 5. DELETE MENU ITEM (WITH IMAGE DELETE FROM S3)
router.delete("/menu/:id", async (req, res) => {
  try {
    const menuId = req.params.id;
    const connection = await db.getConnection();

    // 🔹 Fetch images from DB
    const [images] = await connection.query(
      `SELECT image_url FROM menu_images WHERE menu_id = ?`,
      [menuId]
    );

    // 🔹 Delete images from S3
    await Promise.all(
      images.map(async (img) => {
        const key = img.image_url.split(`${S3_BUCKET}/`)[1]; // Extract S3 key
        await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
      })
    );

    // 🔹 Delete from DB
    await connection.query(`DELETE FROM menu_images WHERE menu_id = ?`, [
      menuId,
    ]);
    await connection.query(`DELETE FROM menu WHERE id = ?`, [menuId]);

    connection.release();
    res.formatResponse(200, true, "Menu item and images deleted successfully");
  } catch (error) {
    console.error("🚨 Database Error:", error.message);
    res.formatResponse(500, false, "Internal Server Error", null, {
      error: error.message,
    });
  }
});

module.exports = router;
