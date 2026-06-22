const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  imageHash:  { type: String, required: true, unique: true },
  imageCid:   String,
  imageUrl:   String,
  createdAt:  { type: Date, default: Date.now, expires: 3600 } // tự xóa sau 1 giờ
});
module.exports = mongoose.model('PendingUpload', schema);