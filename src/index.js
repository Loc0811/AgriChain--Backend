// ============================================================
//  src/index.js  —  Bootstrap sequence
//
//  Thứ tự khởi động QUAN TRỌNG:
//  1. Load env → validate ngay
//  2. Kết nối MongoDB
//  3. Kết nối blockchain
//  4. Chạy full sync (index events từ lastBlock đến nay)
//  5. Start HTTP server (nhận request)
//  6. Start real-time indexer (subscribe events mới)
//  7. Start verify job (chạy định kỳ, so sánh DB vs chain)
//
//  Lý do server start TRƯỚC real-time indexer:
//  Full sync và real-time bắt đầu gần nhau → không bỏ sót event
// ============================================================
require('dotenv').config();

const app    = require('./app');
const env    = require('./config/env');
const logger = require('./utils/logger');
const { connectDB }           = require('./config/database');
const { getWeb3, getAccount } = require('./config/web3');
const { runFullSync, startRealtimeIndexer } = require('./events/indexer');
const { startVerifyJob }      = require('./events/verifyJob');
const { testPinataConnection } = require('./utils/ipfs');

async function bootstrap() {
  logger.info('═══════════════════════════════════════════');
  logger.info('  Supply Chain Backend — Starting up       ');
  logger.info('═══════════════════════════════════════════');

  // ── 1. Kết nối MongoDB ──────────────────────────────────
  logger.info('[Boot] Kết nối MongoDB...');
  await connectDB();

  // ── 2. Kết nối & kiểm tra blockchain ───────────────────
  logger.info('[Boot] Kết nối blockchain...');
  const web3 = getWeb3();
  const blockNumber = await web3.eth.getBlockNumber();
  logger.info(`[Boot] Chain OK — block hiện tại: ${blockNumber}`);

  const account = getAccount();
  const balance = await web3.eth.getBalance(account.address);
  const ethBalance = parseFloat(web3.utils.fromWei(balance, 'ether')).toFixed(4);
  logger.info(`[Boot] Wallet: ${account.address} — ${ethBalance} ETH`);

  if (parseFloat(ethBalance) < 0.01) {
    logger.warn('[Boot] ⚠️  ETH balance thấp! Cần nạp thêm để gửi transactions');
  }

  await testPinataConnection(); // không throw nếu fail — chỉ warn

  // ── 3. Full sync blockchain → MongoDB ──────────────────
  logger.info('[Boot] Chạy full sync blockchain events → DB...');
  //await runFullSync();

  // ── 4. Start HTTP server ────────────────────────────────
  const server = app.listen(env.PORT, () => {
    logger.info(`[Boot] ✅ HTTP server: http://localhost:${env.PORT}`);
    logger.info(`[Boot] Môi trường: ${env.NODE_ENV} | Chain ID: ${env.CHAIN_ID}`);
  });

  // ── 5. Start real-time indexer ──────────────────────────
  // Chạy SAU server để không block HTTP
  startRealtimeIndexer();

  // ── 6. Start verify job ─────────────────────────────────
  startVerifyJob();

  // ── Graceful shutdown ───────────────────────────────────
  const shutdown = async (signal) => {
    logger.info(`[Boot] ${signal} received — đóng server...`);
    server.close(async () => {
      const { disconnectDB } = require('./config/database');
      await disconnectDB();
      logger.info('[Boot] Server đã đóng sạch sẽ');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
  process.on('uncaughtException', (err) => {
    logger.error(`[Boot] Uncaught exception: ${err.message}`, { stack: err.stack });
    process.exit(1);
  });
  process.on('unhandledRejection', (err) => {
  logger.error(`[Boot] Unhandled rejection: ${err.message}`);
  // Không exit — chỉ log
});
}

bootstrap().catch((err) => {
  console.error('[Boot] ❌ Bootstrap thất bại:', err.message);
  console.error(err.stack);
  process.exit(1);
});