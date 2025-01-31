const express = require("express");
const router = express.Router();
const db = require("../lib/dbConnection");
const crypto = require("crypto");

/**
 * ✅ CREATE ORDER (User Places an Order)
 * - Requires `menu_items` in the request body (array of `{ menu_id, quantity }`)
 */
router.post("/", async (req, res) => {
  try {
    const { menu_items, user_id } = req.body;

    if (
      !menu_items ||
      !Array.isArray(menu_items) ||
      menu_items.length === 0 ||
      !user_id
    ) {
      return res.formatResponse(
        400,
        false,
        "User ID and menu items are required."
      );
    }

    const connection = await db.getConnection();

    // ✅ Generate Unique Order Number
    const orderNumber =
      "ORD-" + crypto.randomBytes(4).toString("hex").toUpperCase();

    // ✅ Insert New Order in `orders`
    const [orderResult] = await connection.query(
      `INSERT INTO orders (order_number, user_id, created_at, updated_at) 
       VALUES (?, ?, NOW(), NOW())`,
      [orderNumber, user_id]
    );
    const orderId = orderResult.insertId;

    // ✅ Insert Each Item into `order_detail`
    const orderDetailsQueries = menu_items.map(({ menu_id, quantity }) => {
      return connection.query(
        `INSERT INTO order_detail (order_id, menu_id, quantity, created_at, updated_at) 
         VALUES (?, ?, ?, NOW(), NOW())`,
        [orderId, menu_id, quantity]
      );
    });

    await Promise.all(orderDetailsQueries);
    connection.release();

    res.formatResponse(201, true, "Order placed successfully.", {
      orderId,
      orderNumber,
    });
  } catch (error) {
    console.error("🚨 Order Creation Error:", error.message);
    res.formatResponse(500, false, "Internal Server Error", null, {
      error: error.message,
    });
  }
});

/**
 * ✅ GET ALL ORDERS FOR A USER
 * - Requires `user_id` in query params
 */
router.get("/", async (req, res) => {
  try {
    const { user_id } = req.query;
    if (!user_id) {
      return res.formatResponse(400, false, "User ID is required.");
    }

    const connection = await db.getConnection();

    // ✅ Fetch all orders related to the user
    const [orders] = await connection.query(
      `SELECT 
        o.id, o.order_number, o.user_id, o.created_at,
        COALESCE(JSON_ARRAYAGG(
          JSON_OBJECT('menu_id', od.menu_id, 'quantity', od.quantity, 'menu_name', m.name, 'price', m.price, 'image', mi.image_url)
        ), '[]') AS order_items
       FROM orders o
       LEFT JOIN order_detail od ON o.id = od.order_id
       LEFT JOIN menu m ON od.menu_id = m.id
       LEFT JOIN menu_images mi ON m.id = mi.menu_id
       WHERE o.user_id = ?
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      [user_id]
    );

    connection.release();

    // ✅ Parse JSON data
    orders.forEach((order) => {
      order.order_items = JSON.parse(order.order_items);
    });

    res.formatResponse(200, true, "Orders fetched successfully.", orders);
  } catch (error) {
    console.error("🚨 Order Fetch Error:", error.message);
    res.formatResponse(500, false, "Internal Server Error", null, {
      error: error.message,
    });
  }
});

/**
 * ✅ GET A SINGLE ORDER BY ID
 * - Requires `user_id` in query params
 */
router.get("/:id", async (req, res) => {
  try {
    const orderId = req.params.id;
    const { user_id } = req.query;
    if (!user_id) {
      return res.formatResponse(400, false, "User ID is required.");
    }

    const connection = await db.getConnection();

    const [orders] = await connection.query(
      `SELECT 
        o.id, o.order_number, o.user_id, o.created_at,
        COALESCE(JSON_ARRAYAGG(
          JSON_OBJECT('menu_id', od.menu_id, 'quantity', od.quantity, 'menu_name', m.name, 'price', m.price, 'image', mi.image_url)
        ), '[]') AS order_items
       FROM orders o
       LEFT JOIN order_detail od ON o.id = od.order_id
       LEFT JOIN menu m ON od.menu_id = m.id
       LEFT JOIN menu_images mi ON m.id = mi.menu_id
       WHERE o.id = ? AND o.user_id = ?
       GROUP BY o.id`,
      [orderId, user_id]
    );

    connection.release();

    if (orders.length === 0) {
      return res.formatResponse(404, false, "Order not found.");
    }

    orders[0].order_items = JSON.parse(orders[0].order_items);

    res.formatResponse(200, true, "Order fetched successfully.", orders[0]);
  } catch (error) {
    console.error("🚨 Order Fetch Error:", error.message);
    res.formatResponse(500, false, "Internal Server Error", null, {
      error: error.message,
    });
  }
});

/**
 * ✅ DELETE ORDER
 * - Requires `user_id` in query params
 */
router.delete("/:id", async (req, res) => {
  try {
    const orderId = req.params.id;
    const { user_id } = req.query;
    if (!user_id) {
      return res.formatResponse(400, false, "User ID is required.");
    }

    const connection = await db.getConnection();

    // ✅ Check if order belongs to the user
    const [orderCheck] = await connection.query(
      `SELECT id FROM orders WHERE id = ? AND user_id = ?`,
      [orderId, user_id]
    );

    if (orderCheck.length === 0) {
      connection.release();
      return res.formatResponse(
        404,
        false,
        "Order not found or not authorized."
      );
    }

    // ✅ Delete order details first (FK Constraint)
    await connection.query(`DELETE FROM order_detail WHERE order_id = ?`, [
      orderId,
    ]);

    // ✅ Delete the order from `orders`
    const [deleteResult] = await connection.query(
      `DELETE FROM orders WHERE id = ?`,
      [orderId]
    );

    connection.release();

    if (deleteResult.affectedRows === 0) {
      return res.formatResponse(404, false, "Order not found.");
    }

    res.formatResponse(200, true, "Order deleted successfully.");
  } catch (error) {
    console.error("🚨 Order Deletion Error:", error.message);
    res.formatResponse(500, false, "Internal Server Error", null, {
      error: error.message,
    });
  }
});

module.exports = router;
