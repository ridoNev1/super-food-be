const express = require("express");
const router = express.Router();
const db = require("../lib/dbConnection");
const uploadMiddleware = require("../lib/middleware/uploadFile");
const fs = require("fs");

// ✅ 1. Create a New Menu Item with Image Upload
router.post("/menu", uploadMiddleware("images", true), async (req, res) => {
  try {
    const { name, price, description, quantity } = req.body;
    const images = req.files;

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

    if (images && images.length > 0) {
      const imageQueries = images.map((image) => {
        return db.query(
          `INSERT INTO menu_images (menu_id, image_url) VALUES (?, ?)`,
          [menuId, `/uploads/${image.filename}`]
        );
      });

      await Promise.all(imageQueries);
    }

    res.formatResponse(201, true, "Menu item added successfully with images", {
      menuId,
    });
  } catch (error) {
    console.error("🚨 Database Error:", error.message);
    res.formatResponse(500, false, "Internal Server Error", null, {
      error: error.message,
    });
  }
});

// ✅ 2. READ - Get all menu items with images
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

/**
 * ✅ UPDATE MENU - Update a menu item with optional image update
 */
router.put("/menu/:id", uploadMiddleware("images", true), async (req, res) => {
  try {
    const menuId = req.params.id;
    const { name, price, description, quantity, deleteImages } = req.body;
    const images = req.files;

    if (!name || !price || !description || !quantity) {
      return res.formatResponse(
        400,
        false,
        "All fields except images are required"
      );
    }

    const connection = await db.getConnection();

    const [updateResult] = await connection.query(
      `UPDATE menu 
       SET name = ?, price = ?, description = ?, quantity = ?, updated_at = NOW() 
       WHERE id = ?`,
      [name, price, description, quantity, menuId]
    );

    if (updateResult.affectedRows === 0) {
      connection.release();
      return res.formatResponse(404, false, "Menu item not found");
    }

    if (deleteImages && deleteImages.length > 0) {
      const [oldImages] = await connection.query(
        `SELECT image_url FROM menu_images WHERE id IN (?) AND menu_id = ?`,
        [deleteImages, menuId]
      );

      oldImages.forEach((img) => {
        const filePath = "." + img.image_url;
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      });

      await connection.query(
        `DELETE FROM menu_images WHERE id IN (?) AND menu_id = ?`,
        [deleteImages, menuId]
      );
    }

    if (images && images.length > 0) {
      const imageQueries = images.map((image) => {
        return connection.query(
          `INSERT INTO menu_images (menu_id, image_url) VALUES (?, ?)`,
          [menuId, `/uploads/${image.filename}`]
        );
      });

      await Promise.all(imageQueries);
    }

    connection.release();
    res.formatResponse(
      200,
      true,
      "Menu item updated successfully (selected images deleted, new images added)"
    );
  } catch (error) {
    console.error("🚨 Database Error:", error.message);
    res.formatResponse(500, false, "Internal Server Error", null, {
      error: error.message,
    });
  }
});

/**
 * ✅ DELETE MENU - Delete a menu item and its images
 */
router.delete("/menu/:id", async (req, res) => {
  try {
    const menuId = req.params.id;
    const connection = await db.getConnection();

    const [images] = await connection.query(
      `SELECT image_url FROM menu_images WHERE menu_id = ?`,
      [menuId]
    );

    images.forEach((img) => {
      const filePath = "." + img.image_url;
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });

    await connection.query(`DELETE FROM menu_images WHERE menu_id = ?`, [
      menuId,
    ]);

    const [deleteResult] = await connection.query(
      `DELETE FROM menu WHERE id = ?`,
      [menuId]
    );

    connection.release();

    if (deleteResult.affectedRows === 0) {
      return res.formatResponse(404, false, "Menu item not found");
    }

    res.formatResponse(200, true, "Menu item and images deleted successfully");
  } catch (error) {
    console.error("🚨 Database Error:", error.message);
    res.formatResponse(500, false, "Internal Server Error", null, {
      error: error.message,
    });
  }
});

module.exports = router;
