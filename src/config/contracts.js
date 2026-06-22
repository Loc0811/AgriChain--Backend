const { getWeb3, getWeb3Ws } = require('./web3');
const env = require('./env');

// Import ABI — mỗi file ABI export array các function/event
const UserManagerABI          = require('../abis/UserManager.json').abi;
const WorkspaceManagerABI     = require('../abis/WorkspaceManager.json').abi;
const ProductManagerABI       = require('../abis/ProductManager.json').abi;
const ProductMappingManagerABI= require('../abis/ProductMappingManager.json').abi;
const BatchManagerABI         = require('../abis/BatchManager.json').abi;
const InviteManagerABI        = require('../abis/InviteManager.json').abi;
const CertificationManagerABI = require('../abis/CertificationManager.json').abi;
const CropManagerABI          = require('../abis/CropManager.json').abi;

let contracts = null;

/**
 * Trả về object chứa tất cả contract instances.
 * Singleton — chỉ khởi tạo 1 lần.
 *
 * Cách dùng:
 *   const { userManager } = getContracts();
 *   const user = await userManager.methods.getUser(address).call();
 */
function getContracts() {
  if (contracts) return contracts;

  const web3 = getWeb3();

  contracts = {
    userManager: new web3.eth.Contract(
      UserManagerABI,
      env.CONTRACTS.USER_MANAGER
    ),
    workspaceManager: new web3.eth.Contract(
      WorkspaceManagerABI,
      env.CONTRACTS.WORKSPACE_MANAGER
    ),
    productManager: new web3.eth.Contract(
      ProductManagerABI,
      env.CONTRACTS.PRODUCT_MANAGER
    ),
    productMappingManager: new web3.eth.Contract(
      ProductMappingManagerABI,
      env.CONTRACTS.PRODUCT_MAPPING_MANAGER
    ),
    batchManager: new web3.eth.Contract(
      BatchManagerABI,
      env.CONTRACTS.BATCH_MANAGER
    ),
    inviteManager: new web3.eth.Contract(
      InviteManagerABI,
      env.CONTRACTS.INVITE_MANAGER
    ),
    certificationManager: new web3.eth.Contract(
      CertificationManagerABI,
      env.CONTRACTS.CERTIFICATION_MANAGER
    ),
    cropManager: new web3.eth.Contract(
      CropManagerABI,
      env.CONTRACTS.CROP_MANAGER
    ),
  };

  return contracts;
}

let wsContracts = null;

function getWsContracts() {
  if (wsContracts) return wsContracts;
  const web3Ws = getWeb3Ws();

  wsContracts = {
    userManager: new web3Ws.eth.Contract(
      UserManagerABI,
      env.CONTRACTS.USER_MANAGER
    ),
    workspaceManager: new web3Ws.eth.Contract(
      WorkspaceManagerABI,
      env.CONTRACTS.WORKSPACE_MANAGER
    ),
    productManager: new web3Ws.eth.Contract(
      ProductManagerABI,
      env.CONTRACTS.PRODUCT_MANAGER
    ),
    productMappingManager: new web3Ws.eth.Contract(
      ProductMappingManagerABI,
      env.CONTRACTS.PRODUCT_MAPPING_MANAGER
    ),
    batchManager: new web3Ws.eth.Contract(
      BatchManagerABI,
      env.CONTRACTS.BATCH_MANAGER
    ),
    inviteManager: new web3Ws.eth.Contract(
      InviteManagerABI,
      env.CONTRACTS.INVITE_MANAGER
    ),
    certificationManager: new web3Ws.eth.Contract(
      CertificationManagerABI,
      env.CONTRACTS.CERTIFICATION_MANAGER
    ),
    cropManager: new web3Ws.eth.Contract(
      CropManagerABI,
      env.CONTRACTS.CROP_MANAGER
    ),
  };

  return wsContracts;
}

module.exports = { getContracts, getWsContracts };