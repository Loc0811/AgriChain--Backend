// ============================================================
//  src/utils/ipfs.js
//  Upload file lên Pinata IPFS.
// ============================================================
const PinataSDK = require('@pinata/sdk');
const { Readable } = require('stream');
const { getWeb3 } = require('../config/web3');
const env = require('../config/env');
const logger = require('./logger');

let pinataClient = null;

function getPinata() {
  if (!pinataClient) {
    if (!env.PINATA_API_KEY || !env.PINATA_SECRET_KEY) {
      throw new Error('Thiếu PINATA_API_KEY hoặc PINATA_SECRET_KEY trong .env');
    }
    pinataClient = new PinataSDK(env.PINATA_API_KEY, env.PINATA_SECRET_KEY);
  }
  return pinataClient;
}

/**
 * Upload ANY file lên IPFS - DÙNG CHUNG CHO MỌI LOẠI FILE
 * 
 * @param {Buffer|Object} file - Buffer hoặc Multer file object
 * @param {string} folder - Thư mục phân loại (workspaces, products, certifications, batches, avatars...)
 * @returns {Object} { cid, ipfsUrl, hash, size, mimeType, fileName }
 */
async function uploadFileToIPFS(file, folder = 'general') {
  const pinata = getPinata();

  // Xử lý linh hoạt nhiều dạng input khác nhau
  let buffer, fileName, mimeType;

  if (Buffer.isBuffer(file)) {
    buffer = file;
    fileName = `upload-${Date.now()}`;
    mimeType = 'application/octet-stream';
  } else if (file.buffer) {
    buffer = file.buffer;
    fileName = file.originalname;
    mimeType = file.mimetype;
  } else {
    throw new Error('Invalid file input: must be Buffer or Multer file object');
  }

  const stream = Readable.from(buffer);
  stream.path = fileName; // Pinata dùng .path để lấy tên file

  const result = await pinata.pinFileToIPFS(stream, {
    pinataMetadata: {
      name: fileName,
      keyvalues: { 
        folder,
        mimeType,
        uploadedAt: new Date().toISOString(),
      },
    },
    pinataOptions: {
      cidVersion: 0, 
    },
  });

  const cid     = result.IpfsHash;
  const ipfsUrl = `${env.PINATA_GATEWAY}/ipfs/${cid}`;
  const hash = getWeb3().utils.keccak256(cid); // bytes32 hex để lưu on-chain

  logger.info(`[IPFS] Uploaded "${fileName}" → folder=${folder} type=${mimeType} size=${buffer.length} CID=${cid} hash=${hash}`);

  return { 
    cid, 
    ipfsUrl, 
    hash, 
    size: buffer.length, 
    mimeType, 
    fileName
  };
}

/**
 * Upload location data lên IPFS
 * @param {string} pickupAddress
 * @param {string} deliveryAddress
 * @returns {{ cid, ipfsUrl, hash }} — hash là bytes32 để lưu on-chain
 */
async function uploadLocationToIPFS(pickupAddress, deliveryAddress) {
  const payload = JSON.stringify({ pickupAddress, deliveryAddress });
  const buffer = Buffer.from(payload, 'utf-8');
  return uploadFileToIPFS(
    { buffer, originalname: `location-${Date.now()}.json`, mimetype: 'application/json' },
    'locations'
  );
}

/**
 * Kiểm tra kết nối Pinata (dùng khi bootstrap).
 */
async function testPinataConnection() {
  try {
    const pinata = getPinata();
    await pinata.testAuthentication();
    logger.info('[IPFS] Pinata connected ✅');
    return true;
  } catch (err) {
    logger.warn(`[IPFS] Pinata connection failed: ${err.message}`);
    return false;
  }
}

module.exports = { uploadFileToIPFS, uploadLocationToIPFS, testPinataConnection };