const jwt = require("jsonwebtoken");

/**
 * ✅ Middleware: Verify JWT Token
 */
const verifyToken = (req, res, next) => {
  // ✅ Define public routes that don't require authentication
  const publicRoutes = [
    { method: "GET", path: "/master-menu/menu" },
    { method: "GET", path: /^\/master-menu\/menu\/\d+$/ },
    { method: "POST", path: "/users/login" },
    { method: "POST", path: "/users/register" },
  ];

  // ✅ Allow public routes to bypass authentication
  for (const route of publicRoutes) {
    if (
      req.method === route.method &&
      (route.path instanceof RegExp
        ? route.path.test(req.path)
        : req.path === route.path)
    ) {
      return next();
    }
  }

  // ✅ Get token from Authorization header
  const token = req.headers["authorization"];
  if (!token) {
    return res.formatResponse(401, false, "Access denied. No token provided.");
  }

  try {
    // ✅ Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.formatResponse(403, false, "Invalid or expired token.");
  }
};

module.exports = verifyToken;
