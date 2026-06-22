const { getWeb3, getAccount, getGasPrice, estimateGas } = require('../config/web3');
const logger = require('./logger');

// ─────────────────────────────────────────────
//  .call() — Đọc dữ liệu (MIỄN PHÍ, không cần ký)
// ─────────────────────────────────────────────

/**
 * Gọi view/pure function — không tốn gas, không cần private key.
 *
 * @example
 *   const user = await callContract(
 *     contracts.userManager.methods.getUser(address)
 *   );
 *
 * @param {object} method - contract.methods.functionName(args)
 * @param {object} options - { from } (tùy chọn)
 */
async function callContract(method, options = {}) {
  try {
    const result = await method.call(options);
    return result;
  } catch (err) {
    // Phân tích revert reason để trả về lỗi có nghĩa
    const reason = parseRevertReason(err);
    logger.error(`[call] Thất bại: ${reason}`);
    throw new BlockchainError(reason, 'CALL_FAILED');
  }
}

// ─────────────────────────────────────────────
//  .send() — Ghi dữ liệu (tốn gas, cần ký)
// ─────────────────────────────────────────────

/**
 * Backend encode ABI data về cho frontend.
 *
 * @example
 *   const txData = await buildTransaction(
 *     contracts.userManager.methods.registerUser(name, avatar, role, wallet)
 *   );
 *
 * @param {object} method     - contract.methods.functionName(args)
 * @param {string} fromAddress - địa chỉ ký (mặc định backend wallet)
 * @param {object} overrides  - { gas, gasPrice, value } để override
 * @returns {object} encoded transaction data
 */
async function buildTransaction(method, fromAddress, to, overrides = {}) {
  const from = fromAddress;

  const [gas, gasPrice, nonce, chainId] = await Promise.all([
    estimateGas(method, from),
    getGasPrice(),
    getWeb3().eth.getTransactionCount(from, 'pending'),
    getWeb3().eth.getChainId(),
  ]);

  const ethCost = (Number(gas) * Number(gasPrice)) / 1e18;
  logger.info(`[Gas] gas=${gas}, gasPrice=${gasPrice}, estimatedCost=${ethCost.toFixed(6)} ETH`);

  const tx = {
  from,
  to,
  data: method.encodeABI(),
  gas: '0x' + gas.toString(16),
  gasPrice: '0x' + gasPrice.toString(16),
  nonce: '0x' + Number(nonce).toString(16),
  chainId: '0x' + Number(chainId).toString(16),
  ...overrides,
};

console.log('[buildTransaction] txData:', JSON.stringify(tx, (_, v) =>
  typeof v === 'bigint' ? v.toString() : v
));

return tx;
}

// ─────────────────────────────────────────────
//  Event querying — thay thế getter functions
// ─────────────────────────────────────────────

/**
 * Query events từ blockchain — dùng thay cho các getter/filter function.
 * Backend gọi hàm này để lấy dữ liệu thay vì gọi getter on-chain.
 *
 * @example
 *   // Thay thế getAllUsersActive() on-chain:
 *   const events = await getPastEvents(
 *     contracts.userManager,
 *     'UserRegistered',
 *     { fromBlock: START_BLOCK }
 *   );
 *
 * @param {object} contract    - web3 contract instance
 * @param {string} eventName   - tên event (khớp với Solidity)
 * @param {object} filter      - { fromBlock, toBlock, filter: { key: value } }
 */
async function getPastEvents(contract, eventName, filter = {}) {
  const web3 = getWeb3();
  const { fromBlock = 0, toBlock = 'latest', filter: eventFilter = {} } = filter;

  try {
    const events = await contract.getPastEvents(eventName, {
      filter: eventFilter,
      fromBlock,
      toBlock,
    });

    logger.debug(`[events] ${eventName}: ${events.length} events found`);
    return events;

  } catch (err) {
    logger.error(`[events] getPastEvents(${eventName}) thất bại: ${err.message}`);
    throw new BlockchainError(`Không thể query event ${eventName}`, 'EVENT_QUERY_FAILED');
  }
}

/**
 * Subscribe real-time events (WebSocket provider).
 * Dùng trong event indexer — xem src/events/indexer.js
 *
 * @param {object}   contract   - web3 contract instance
 * @param {string}   eventName  - tên event
 * @param {Function} callback   - (event) => void
 */
function subscribeEvent(contract, eventName, callback) {
  const subscription = contract.events[eventName]()
    .on('data', (event) => {
      logger.debug(`[subscribe] ${eventName} #${event.blockNumber}`);
      callback(event);
    })
    .on('error', (err) => {
      logger.error(`[subscribe] ${eventName} error: ${err.message}`);
    });

  return subscription;
}

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

/**
 * Phân tích revert reason từ error object của web3.
 * Solidity revert("message") → trả về message rõ ràng.
 */
function parseRevertReason(err) {
  // web3 v4 đặt reason ở nhiều nơi khác nhau
  if (err.innerError?.message) return err.innerError.message;
  if (err.reason) return err.reason;
  if (err.data?.reason) return err.data.reason;

  // Tìm trong message string
  const match = err.message?.match(/revert(?:ed)? (.+)/i);
  if (match) return match[1].trim();

  return err.message || 'Unknown blockchain error';
}

/**
 * Custom error class cho blockchain errors.
 * Giúp middleware phân biệt lỗi blockchain vs lỗi server.
 */
class BlockchainError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'BlockchainError';
    this.code = code;
    this.statusCode = 400; // Mặc định 400 — lỗi do input/contract logic
  }
}

/**
 * Chuyển BigInt fields trong object thành string (JSON.stringify không handle BigInt).
 */
function serializeResult(obj) {
  return JSON.parse(
    JSON.stringify(obj, (_, value) =>
      typeof value === 'bigint' ? value.toString() : value
    )
  );
}

/**
 * Validate địa chỉ Ethereum.
 */
function isValidAddress(address) {
  const web3 = getWeb3();
  return web3.utils.isAddress(address);
}

module.exports = {
  callContract,
  buildTransaction,
  getPastEvents,
  subscribeEvent,
  parseRevertReason,
  BlockchainError,
  serializeResult,
  isValidAddress,
};