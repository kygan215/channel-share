// ============================================================
// 云函数：导出渠道信息到 Excel
// 依赖：node-xlsx 生成 xlsx 文件
// 数据来源：优先使用前端传入的 records，回退为查询云数据库
// ============================================================

// 导入云开发 SDK
const cloud = require('wx-server-sdk');
// 导入 Excel 生成库
const xlsx = require('node-xlsx');

// 初始化云环境（使用当前云函数所在环境）
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
// 获取数据库引用
const db = cloud.database();

// 云函数入口
exports.main = async (event, context) => {
  try {
    // ---- 获取数据 ----
    // 优先使用前端传入的数据（本地存储模式）
    // 如果没有传入则回退到查询数据库（云数据库模式）
    let data = event.records;

    // 前端未传入数据时，从云数据库查询
    if (!data) {
      // 获取总记录数
      const countResult = await db.collection('channels').count();
      const total = countResult.total;

      if (total === 0) {
        return { success: false, message: '暂无数据可导出' };
      }

      // 分批获取所有数据（数据库单次最多返回 100 条）
      const MAX_LIMIT = 100;
      const batchTimes = Math.ceil(total / MAX_LIMIT);
      const tasks = [];
      for (let i = 0; i < batchTimes; i++) {
        tasks.push(
          db
            .collection('channels')
            .skip(i * MAX_LIMIT)       // 跳过已获取的数据
            .limit(MAX_LIMIT)           // 每次取 100 条
            .orderBy('province', 'asc')  // 按省份升序
            .orderBy('serialNo', 'asc')  // 同省份内按序号升序
            .get()
        );
      }
      // 并行执行所有分页查询
      const results = await Promise.all(tasks);
      data = [];
      results.forEach((res) => {
        data = data.concat(res.data);
      });
    }

    // 仍无数据则提示
    if (!data || data.length === 0) {
      return { success: false, message: '暂无数据可导出' };
    }

    // ---- 构建 Excel 表格数据 ----
    // 第一行为表头
    const excelData = [
      ['序号', '省份', '城市', '区/镇', '乡/街道', '电话', '微信号'],
    ];

    // 遍历每条记录转为行
    data.forEach((item) => {
      excelData.push([
        item.sn || item.serialNo || '',  // 兼容两种字段名
        item.province || '',
        item.city || '',
        item.district || '',
        item.street || '',
        item.phone || '',
        item.wechat || '',
      ]);
    });

    // 使用 node-xlsx 生成 Excel 文件 buffer
    const buffer = xlsx.build([
      {
        name: '渠道信息',   // sheet 名称
        data: excelData,   // 表格数据
        options: {},
      },
    ]);

    // ---- 上传到云存储 ----
    // 文件名包含时间戳避免重复
    const fileName = `渠道信息_${Date.now()}.xlsx`;
    const uploadResult = await cloud.uploadFile({
      cloudPath: fileName,   // 云存储路径
      fileContent: buffer,    // 文件内容
    });

    // ---- 获取临时下载链接（有效期 1 小时） ----
    const fileList = [{ fileID: uploadResult.fileID, maxAge: 3600 }];
    const tempResult = await cloud.getTempFileURL({ fileList });

    // 返回下载链接
    return {
      success: true,
      downloadUrl: tempResult.fileList[0].tempFileURL,
      total: data.length,
    };
  } catch (err) {
    // 任何异常均返回错误信息
    console.error(err);
    return { success: false, message: err.message };
  }
};
