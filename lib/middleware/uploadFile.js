require("dotenv").config();
const multer = require("multer");
const AWS = require("aws-sdk");
const multerS3 = require("multer-s3");

// 🔹 Configure AWS SDK
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// 🔹 Set up Multer S3 storage
const storage = multerS3({
  s3: s3,
  bucket: process.env.S3_BUCKET_NAME,
  acl: "public-read",
  contentType: multerS3.AUTO_CONTENT_TYPE,
  key: (req, file, cb) => {
    cb(null, `uploads/${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 1.2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(
        new Error("Only .jpeg, .png, and .webp formats are allowed!"),
        false
      );
    }
    cb(null, true);
  },
});

/**
 * ✅ Middleware function that dynamically determines:
 * - `upload.single("image")` for single file uploads
 * - `upload.array("images", 5)` for multiple file uploads
 */
const uploadMiddleware = (fieldName, isMultiple = false) => {
  return (req, res, next) => {
    const uploadHandler = isMultiple
      ? upload.array(fieldName, 5)
      : upload.single(fieldName);

    uploadHandler(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            success: false,
            message: "File size exceeds the 1.2MB limit.",
          });
        }
        if (err.code === "LIMIT_UNEXPECTED_FILE") {
          return res.status(400).json({
            success: false,
            message: "Too many files uploaded. Max limit is 5 files.",
          });
        }
      } else if (err) {
        return res.status(400).json({
          success: false,
          message: err.message || "File upload error.",
        });
      }
      next();
    });
  };
};

module.exports = uploadMiddleware;
