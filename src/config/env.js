require('dotenv').config();
function req(k) { const v=process.env[k]; if(!v) throw new Error(`[ENV] Thiếu: ${k}`); return v; }
function opt(k,d) { return process.env[k]||d; }

module.exports = {
  NODE_ENV:  opt('NODE_ENV','development'),
  PORT:      parseInt(opt('PORT','3000')),
  IS_PROD:   process.env.NODE_ENV==='production',
  MONGODB_URI: req('MONGODB_URI'),
  RPC_URL:   req('RPC_URL'),
  WS_RPC_URL: opt('WS_RPC_URL', 'ws://127.0.0.1:8545'),
  CHAIN_ID:  parseInt(opt('CHAIN_ID','11155111')),
  BACKEND_PRIVATE_KEY:    req('BACKEND_PRIVATE_KEY'),
  BACKEND_WALLET_ADDRESS: req('BACKEND_WALLET_ADDRESS'),
  CONTRACTS: {
    USER_MANAGER:            req('USER_MANAGER_PROXY'),
    WORKSPACE_MANAGER:       req('WORKSPACE_MANAGER_PROXY'),
    PRODUCT_MANAGER:         req('PRODUCT_MANAGER_PROXY'),
    PRODUCT_MAPPING_MANAGER: req('PRODUCT_MAPPING_MANAGER_PROXY'),
    BATCH_MANAGER:           req('BATCH_MANAGER_PROXY'),
    INVITE_MANAGER:          req('INVITE_MANAGER_PROXY'),
    CERTIFICATION_MANAGER:   req('CERTIFICATION_MANAGER_PROXY'),
    CROP_MANAGER:            req('CROP_MANAGER_PROXY'),
  },
  GAS_LIMIT_DEFAULT:    parseInt(opt('GAS_LIMIT_DEFAULT','300000')),
  GAS_PRICE_MULTIPLIER: parseFloat(opt('GAS_PRICE_MULTIPLIER','1.2')),
  START_BLOCK:          parseInt(opt('START_BLOCK','0')),
  // Verify job chạy định kỳ so sánh DB vs chain
  VERIFY_INTERVAL_MS:   parseInt(opt('VERIFY_INTERVAL_MS', String(60*60*1000))), // mặc định 1 giờ
  // IPFS (Pinata)
  PINATA_API_KEY:    opt('PINATA_API_KEY', ''),
  PINATA_SECRET_KEY: opt('PINATA_SECRET_KEY', ''),
  PINATA_GATEWAY:    opt('PINATA_GATEWAY', 'https://gateway.pinata.cloud'),
  JWT_SECRET:       req('JWT_SECRET'),
  JWT_EXPIRES:   opt('JWT_EXPIRES', '7d'),
  FRONTEND_URL:     req('FRONTEND_URL'),
};