// ============================================================
// 健康证上传 & 审核
// ============================================================
// 这个文件处理健康证的两步流程：
//   1. 用户上传健康证 → 状态设为"待审核"
//   2. 管理员审核 → 通过或驳回
// ============================================================

const { db } = require('./constants');
const { getDoc } = require('./records');

// ============================================================
// healthCertUpload：上传健康证（标记为待审核）
// data：{ id: 促销员ID, fileId: 上传到云存储后的文件ID }
// openid：上传者
// ============================================================
async function healthCertUpload(data, openid) {
  // 找到这条促销员记录
  const doc = await getDoc(data.id);
  if (!doc) return { success: false, message: '记录不存在' };

  // 构造健康证信息对象
  const healthCert = {
    status: 'pending',        // 状态：待审核
    fileId: data.fileId || '', // 云存储中的文件ID
    uploaderId: openid,        // 上传者
    uploadTime: Date.now(),    // 上传时间
    reviewerId: '',            // 审核者（暂空）
    reviewTime: null,          // 审核时间（暂空）
    rejectReason: '',          // 驳回原因（暂空）
  };

  // 更新数据库
  await db.collection('channels').doc(doc._id).update({ data: { healthCert } });
  return { success: true, status: 'pending' };
}

// ============================================================
// healthCertReview：审核健康证
// data：{ id: 促销员ID, status: 'approved'或'rejected', rejectReason: 驳回原因 }
// openid：审核者（必须是管理员才能调用）
// ============================================================
async function healthCertReview(data, openid) {
  // 找到记录
  const doc = await getDoc(data.id);
  if (!doc) return { success: false, message: '记录不存在' };

  const status = data.status; // 'approved' 通过 或 'rejected' 驳回
  if (!['approved', 'rejected'].includes(status)) {
    return { success: false, message: '审核状态无效' };
  }

  // 更新健康证状态
  const update = {
    'healthCert.status': status,
    'healthCert.reviewerId': openid,
    'healthCert.reviewTime': Date.now(),
  };

  // 如果驳回，记录原因
  if (status === 'rejected') {
    update['healthCert.rejectReason'] = data.rejectReason || '未通过审核';
  }

  // 写入数据库
  await db.collection('channels').doc(doc._id).update({ data: update });
  return { success: true, status };
}

module.exports = {
  healthCertUpload,   // 上传健康证
  healthCertReview,   // 审核健康证（通过/驳回）
};
