const { Web3 } = require('web3');
const env = require('./env');
const logger = require('../utils/logger');

let web3HttpInstance = null;
let web3WsInstance = null;
let accountInstance = null;

/**
 * Lấy Web3 singleton.
 * Kết nối WebSocket để nhận events real-time.
 */
function getWeb3() {
  if (!web3HttpInstance) {
    // Dùng WebSocketProvider để subscribe events
    // Nếu chỉ cần HTTP thì dùng new Web3(env.RPC_URL)
    web3HttpInstance = new Web3(env.RPC_URL);
    logger.info(`[Web3] Kết nối tới ${env.RPC_URL}`);
  }
  return web3HttpInstance;
}

function getWeb3Ws() {
  if (!web3WsInstance) {
    web3WsInstance = new Web3(env.WS_RPC_URL);
    logger.info(`[Web3] WebSocket kết nối tới ${env.WS_RPC_URL}`);
  }
  return web3WsInstance;
}

/**
 * Lấy account dùng để ký transaction (backend wallet).
 * Private key đọc từ .env — không bao giờ hardcode.
 */
function getAccount() {
  if (!accountInstance) {
    const web3 = getWeb3();
    accountInstance = web3.eth.accounts.privateKeyToAccount(
      env.BACKEND_PRIVATE_KEY
    );
    // Thêm vào wallet để web3 tự ký khi send()
    web3.eth.accounts.wallet.add(accountInstance);
    logger.info(`[Web3] Backend wallet: ${accountInstance.address}`);
  }
  return accountInstance;
}

/**
 * Lấy gas price hiện tại x multiplier để đảm bảo tx không bị stuck.
 */
async function getGasPrice() {
  const web3 = getWeb3();
  const baseGasPrice = await web3.eth.getGasPrice();
  // Nhân hệ số để ưu tiên tx được mine nhanh hơn
  return BigInt(Math.floor(Number(baseGasPrice) * env.GAS_PRICE_MULTIPLIER));
}

/**
 * Estimate gas cho một transaction + buffer 20%.
 * @param {object} txObject - web3 contract method object
 * @param {string} from     - địa chỉ người gửi
 */
async function estimateGas(txObject, from) {
  try {
    const estimated = await txObject.estimateGas({ from });
    // Thêm 20% buffer để tránh out-of-gas
    return BigInt(Math.floor(Number(estimated) * 1.2));
  } catch (err) {
    logger.warn(`[Gas] estimateGas thất bại, dùng default: ${err.message}`);
    return BigInt(env.GAS_LIMIT_DEFAULT);
  }
}

module.exports = { getWeb3, getWeb3Ws, getAccount, getGasPrice, estimateGas };