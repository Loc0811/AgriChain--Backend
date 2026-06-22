// ============================================================
//  src/services/certificationService.js
// ============================================================
const { getContracts } = require('../config/contracts');
const { callContract, buildTransaction, serializeResult } = require('../utils/blockchain');
const Certification = require('../models/Certification');
const PendingUpload = require('../models/PendingUpload');
const { uploadFileToIPFS } = require('../utils/ipfs');

// ─────────────────────────────────────────────────
//  READ — từ MongoDB (nhanh, có filter/sort)
// ─────────────────────────────────────────────────

/**
 * Lấy 1 certification theo certificationId.
 */
async function getCertification(certificationId) {
  const cert = await Certification.findOne({ certificationId: Number(certificationId) });
  if (!cert) throw new Error(`Certification #${certificationId} không tồn tại`);
  return cert;
}

/**
 * Lấy tất cả certs của user.
 */
async function getCertificationsByUser(userId, { page = 1, limit = 10, search, isActive } = {}) {
  const filter = { userId: userId.toLowerCase() };

  if (search) {
    filter.name = { $regex: search, $options: 'i' };
  }

  if (isActive !== undefined && isActive !== '') {
    filter.isActive = isActive === 'true' || isActive === true;
  }

  const skip = (page - 1) * limit;
  const total = await Certification.countDocuments(filter);

  const certifications = await Certification.find(filter)
    .sort({ issueDate: -1 })
    .skip(skip)
    .limit(limit);

  return { data: certifications, total, page: Number(page), pages: Math.ceil(total / limit) };
}


async function extractCertificationFromPdf(fileBuffer) {
  const base64Pdf = fileBuffer.toString('base64');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf },
          },
          {
            type: 'text',
            text: `Đọc chứng nhận PDF này và trả về JSON với đúng field sau, không thêm gì khác:
            {
              "name": "Tên chứng nhận",
              "issuer": "Tổ chức cấp",
              "issueDate": <unix timestamp số nguyên>,
              "expiryDate": <unix timestamp số nguyên>
            }
            Chỉ trả về JSON, không markdown, không giải thích, không text nào khác.`
          },
        ],
      }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Anthropic API error: ${response.status} ${response.statusText} - ${err.error || 'No error message'}`);
  }

  const data = await response.json();
  const text = data.content?.find(b => b.type === 'text')?.text?.trim() || '';
  const clean = text.replace(/^```json\s*/,'').replace(/^```\s*/,'').replace(/```\s*$/,'').trim();

  let extracted;
  try {
    extracted = JSON.parse(clean);
  } catch (e) {
    throw new Error(`Failed to parse Anthropic response as JSON: ${e.message}. Response text: ${clean}`);
  }

  if (extracted.error) {
    throw new Error(`AI cannot extract certification data: ${extracted.error}`);
  }

  const requiredFields =[ 'name', 'issuer', 'issueDate', 'expiryDate' ];
  const missingFields = requiredFields.filter(field => {
    const value = extracted[field];
    return value === undefined || value === null || value === '';
  });
  
  if (missingFields.length > 0) {
    throw new Error(
      `Không thể trích xuất đủ thông tin từ chứng chỉ. Thiếu các trường: ${missingFields.join(', ')}. ` +
      `Dữ liệu nhận được: ${JSON.stringify(extracted)}`
    );
  }

  if (typeof extracted.name !== 'string' || extracted.name.trim() === '') {
    throw new Error('Tên chứng nhận (name) phải là chuỗi không rỗng');
  }

  if (typeof extracted.issuer !== 'string' || extracted.issuer.trim() === '') {
    throw new Error('Tổ chức cấp (issuer) phải là chuỗi không rỗng');
  }

  if (typeof extracted.issueDate !== 'number' || isNaN(extracted.issueDate)) {
    throw new Error('Ngày cấp (issueDate) phải là số nguyên (unix timestamp)');
  }

  if (typeof extracted.expiryDate !== 'number' || isNaN(extracted.expiryDate)) {
    throw new Error('Ngày hết hạn (expiryDate) phải là số nguyên (unix timestamp)');
  }

  if (extracted.issueDate >= extracted.expiryDate) {
    throw new Error(
      `Ngày không hợp lệ: issueDate (${new Date(extracted.issueDate * 1000).toISOString()}) ` +
      `phải trước expiryDate (${new Date(extracted.expiryDate * 1000).toISOString()})`
    );
  }

  // Ngày không được trong tương lai xa (ví dụ: không quá 100 năm)
  const now = Math.floor(Date.now() / 1000);
  const HUNDRED_YEARS = 100 * 365 * 24 * 60 * 60;
  
  if (extracted.issueDate > now + HUNDRED_YEARS) {
    throw new Error(`Ngày cấp (issueDate) không hợp lệ: ${extracted.issueDate} (quá xa trong tương lai)`);
  }
  
  if (extracted.expiryDate > now + HUNDRED_YEARS) {
    throw new Error(`Ngày hết hạn (expiryDate) không hợp lệ: ${extracted.expiryDate} (quá xa trong tương lai)`);
  }

  // expiryDate không được quá 100 năm trong quá khứ
  if (extracted.expiryDate < now - HUNDRED_YEARS) {
    throw new Error(`Chứng chỉ đã hết hạn quá lâu (hơn 100 năm), không thể cấp lại`);
  }

  return extracted;
}


// ────────────────────────────────────────────
// READ — từ chain (chậm, không filter/sort)
// ────────────────────────────────────────────

/**
 * Gọi getCertification() trực tiếp từ smart contract.
 * Dùng để debug / verify data DB vs chain (verifyJob).
 */
async function getCertificationFromChain(certificationId) {
  const { certificationManager } = getContracts();
  const result = await callContract(certificationManager.methods.getCertification(certificationId));
  return serializeResult(result);
}

// ────────────────────────────────────────────────────────────────
//  WRITE — lên blockchain (tốn gas, cần validate kỹ)
// ────────────────────────────────────────────────────────────────

/**
 * Cấp chứng nhận mới (lưu IPFS hash lên blockchain).
 */
async function issueCertificationFromPdf(file, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');
  if (!file) throw new Error('File PDF certification không được để trống');

  let extracted;
  try {
    extracted = await extractCertificationFromPdf(file.buffer);
  } catch (e) {
    throw new Error(`[EXTRACTION_FAILED] ${e.message}`);
  }

  const ipfs = await uploadFileToIPFS(file, 'certifications');
  await PendingUpload.findOneAndUpdate(
    { imageHash: ipfs.hash },
    { imageUrl: ipfs.ipfsUrl, imageCid: ipfs.cid },
    { upsert: true }
  );

  const { certificationManager } = getContracts();
  const txData = await buildTransaction(
    certificationManager.methods.issueCertification(extracted.name, extracted.issuer, extracted.issueDate, extracted.expiryDate, ipfs.hash),
    callerAddress,
    certificationManager.options.address
  );

  return { txData, file: file ? { fileHash: ipfs.hash, fileUrl: ipfs.ipfsUrl, fileCid: ipfs.cid } : null };
}

/**
 * Đánh dấu chứng nhận đã hết hạn.
 * Pre-check từ DB trước để tránh tốn gas.
 */
async function expireCertification(certificationId, callerAddress) {
  if (!callerAddress) throw new Error('Thiếu x-wallet-address header');

  const cert = await getCertification(certificationId);

  if (!cert.isActive) {
    throw new Error(`Certification #${certificationId} đã hết hạn rồi`);
  }

  const now = new Date();
  if (cert.expiryDate > now) {
    const daysLeft = Math.ceil((cert.expiryDate.getTime() - now.getTime()) / 86400000);
    throw new Error(`Certification #${certificationId} chưa hết hạn (còn ${daysLeft} ngày)`);
  }

  const { certificationManager } = getContracts();
  const txData = await buildTransaction(
    certificationManager.methods.expireCertification(certificationId),
    callerAddress,
    certificationManager.options.address
  );

  return { txData };
}

module.exports = {
  getCertification,
  getCertificationsByUser,
  getCertificationFromChain,
  extractCertificationFromPdf,
  issueCertificationFromPdf,
  expireCertification,
};
