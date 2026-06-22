// ============================================================
//  src/utils/qrcode.js
//  Tạo QR code PNG buffer từ URL.
//  Không ghi disk — stream thẳng buffer lên IPFS.
// ============================================================
const QRCode = require('qrcode');
const logger = require('./logger');

/**
 * Tạo QR code PNG buffer từ URL.
 *
 * @param {string} url          - URL mà QR sẽ encode (public batch page)
 * @param {object} [options]
 * @param {number} [options.width=512]          - kích thước ảnh (px)
 * @param {string} [options.darkColor='#000000']
 * @param {string} [options.lightColor='#ffffff']
 *
 * @returns {Buffer} PNG buffer
 */
async function generateQRCodeBuffer(url, options = {}) {
  if (!url || typeof url !== 'string') {
    throw new Error('URL không hợp lệ: url là bắt buộc và phải là string');
  }

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new Error(`URL không hợp lệ: ${url} - phải bắt đầu bằng http:// hoặc https://`);
  }

  const {
    width      = 512,
    darkColor  = '#000000',
    lightColor = '#ffffff',
    margin     = 4,
  } = options;

  if (width < 100 || width > 2048) {
    throw new Error('Chiều rộng QR code phải từ 100 đến 2048 pixels');
  }

  logger.debug(`[QR] Generating QR for: ${url} (${width}x${width})`);

  try {
    const buffer = await QRCode.toBuffer(url, {
      type: 'png',
      width,
      margin,
      color: {
        dark: darkColor,
        light: lightColor,
      },
      errorCorrectionLevel: 'H', // High - chịu được logo đè lên
    });

    logger.debug(`[QR] Success: buffer size = ${buffer.length} bytes`);
    return buffer;
  } catch (error) {
    logger.error(`[QR] Failed to generate QR for ${url}: ${error.message}`);
    throw new Error(`Không thể tạo QR code: ${error.message}`);
  }
}

module.exports = { generateQRCodeBuffer };