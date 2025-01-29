const express = require("express");
const router = express.Router();
const db = require("../lib/dbConnection");

// ✅ 1. CREATE - Add a new menu item
router.post("/menu", (req, res) => {
  const { name, price, description, quantity, image_id } = req.body;

  if (!name || !price || !description || !quantity) {
    return res.formatResponse(
      400,
      false,
      "All fields except image_id are required"
    );
  }

  const query = `INSERT INTO menu (name, price, description, quantity, image_id, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, NOW(), NOW())`;

  db.query(
    query,
    [name, price, description, quantity, image_id || null],
    (err, results) => {
      if (err) {
        console.error("Database Error:", err.message);
        return res.formatResponse(500, false, "Internal Server Error", null, {
          error: err.message,
        });
      }
      res.formatResponse(201, true, "Menu item added successfully", {
        menuId: results.insertId,
      });
    }
  );
});

// ✅ 2. READ - Get all menu items (with pagination)
router.get("/menu", (req, res) => {
  let { page, limit } = req.query;

  page = parseInt(page) || 1;
  limit = parseInt(limit) || 10;
  if (page < 1 || limit < 1) {
    return res.formatResponse(
      400,
      false,
      "Page and limit must be positive numbers"
    );
  }

  const offset = (page - 1) * limit;
  const query = `SELECT * FROM menu LIMIT ? OFFSET ?`;

  db.query(query, [limit, offset], (err, results) => {
    if (err) {
      console.error("Database Error:", err.message);
      return res.formatResponse(500, false, "Internal Server Error", null, {
        error: err.message,
      });
    }
    db.query("SELECT COUNT(*) AS total FROM menu", (err, countResults) => {
      if (err) {
        console.error("Database Error:", err.message);
        return res.formatResponse(500, false, "Internal Server Error", null, {
          error: err.message,
        });
      }

      const totalItems = countResults[0].total;
      const totalPages = Math.ceil(totalItems / limit);

      res.formatResponse(
        200,
        true,
        "Menu items fetched successfully",
        results,
        {
          page,
          limit,
          totalItems,
          totalPages,
        }
      );
    });
  });
});

// ✅ 3. READ - Get a single menu item by ID
router.get("/menu/:id", (req, res) => {
  const menuId = req.params.id;
  const query = "SELECT * FROM menu WHERE id = ?";

  db.query(query, [menuId], (err, results) => {
    if (err) {
      console.error("Database Error:", err.message);
      return res.formatResponse(500, false, "Internal Server Error", null, {
        error: err.message,
      });
    }
    if (results.length === 0) {
      return res.formatResponse(404, false, "Menu item not found");
    }
    res.formatResponse(200, true, "Menu item fetched successfully", results[0]);
  });
});

// ✅ 4. UPDATE - Update a menu item
router.put("/menu/:id", (req, res) => {
  const menuId = req.params.id;
  const { name, price, description, quantity, image_id } = req.body;

  if (!name || !price || !description || !quantity) {
    return res.formatResponse(
      400,
      false,
      "All fields except image_id are required"
    );
  }

  const query = `UPDATE menu SET name = ?, price = ?, description = ?, quantity = ?, image_id = ?, updated_at = NOW() 
                 WHERE id = ?`;

  db.query(
    query,
    [name, price, description, quantity, image_id || null, menuId],
    (err, results) => {
      if (err) {
        console.error("Database Error:", err.message);
        return res.formatResponse(500, false, "Internal Server Error", null, {
          error: err.message,
        });
      }
      if (results.affectedRows === 0) {
        return res.formatResponse(404, false, "Menu item not found");
      }
      res.formatResponse(200, true, "Menu item updated successfully");
    }
  );
});

// ✅ 5. DELETE - Delete a menu item
router.delete("/menu/:id", (req, res) => {
  const menuId = req.params.id;
  const query = "DELETE FROM menu WHERE id = ?";

  db.query(query, [menuId], (err, results) => {
    if (err) {
      console.error("Database Error:", err.message);
      return res.formatResponse(500, false, "Internal Server Error", null, {
        error: err.message,
      });
    }
    if (results.affectedRows === 0) {
      return res.formatResponse(404, false, "Menu item not found");
    }
    res.formatResponse(200, true, "Menu item deleted successfully");
  });
});

module.exports = router;
