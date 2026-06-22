// ============================================================
//  src/middleware/upload.js
//  Multer config — nhận file ảnh từ multipart/form-data.
//  Lưu vào memory (không ghi disk) vì sẽ stream thẳng lên IPFS.
// ============================================================
const multer = require('multer');

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const PDF_MIME     = ['application/pdf'];

const uploadImage = multer({
  storage: multer.memoryStorage(), // buffer trong RAM, không ghi disk

  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },

  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Chỉ chấp nhận ảnh: ${ALLOWED_MIME.join(', ')}`));
    }
  },
});

const uploadPDF = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max cho PDF
  },
  fileFilter: (req, file, cb) => {
    if (PDF_MIME.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Chỉ chấp nhận file PDF`));
    }
  },
});

module.exports = { uploadImage, uploadPDF };