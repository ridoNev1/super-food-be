require("dotenv").config();
const multer = require("multer");
const { S3Client } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");

// ✅ Configure AWS S3 v3 Client
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  endpoint: process.env.S3_ENDPOINT,
  forcePathStyle: false,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// ✅ Configure Multer for Memory Storage (S3 Upload)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 1.2 * 1024 * 1024 }, // ✅ Max file size: 1.2MB
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

// ✅ Upload Function for AWS S3 (v3)
const uploadToS3 = async (fileBuffer, fileName, fileMimeType) => {
  const uploadParams = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `uploads/${Date.now()}-${fileName}`,
    Body: fileBuffer,
    ContentType: fileMimeType,
    ACL: "public-read",
  };

  try {
    const uploadResult = await new Upload({
      client: s3,
      params: uploadParams,
    }).done();

    return uploadResult.Location;
  } catch (error) {
    console.error("🚨 S3 Upload Error:", error);
    throw new Error("Failed to upload file to S3");
  }
};

// ✅ Middleware Function (Single & Multiple File Support)
const uploadMiddleware = (fieldName, isMultiple = false) => {
  return async (req, res, next) => {
    const uploadHandler = isMultiple
      ? upload.array(fieldName, 5)
      : upload.single(fieldName);

    uploadHandler(req, res, async function (err) {
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

      try {
        if (isMultiple) {
          req.fileUrls = await Promise.all(
            req.files.map(async (file) => {
              return await uploadToS3(
                file.buffer,
                file.originalname,
                file.mimetype
              );
            })
          );
        } else if (req.file) {
          req.fileUrl = await uploadToS3(
            req.file.buffer,
            req.file.originalname,
            req.file.mimetype
          );
        }

        next();
      } catch (error) {
        return res.status(500).json({
          success: false,
          message: "S3 Upload Failed",
          error: error.message,
        });
      }
    });
  };
};

module.exports = uploadMiddleware;
