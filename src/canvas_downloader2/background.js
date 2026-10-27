chrome.action.onClicked.addListener(async (tab) => {
  try {

    function getFormattedTimestamp() {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');

      return `${year}${month}${day}_${hours}时${minutes}分${seconds}秒`;
    }

    // 监听下载状态变化，用于错误追踪和进度反馈
    let downloadStatus = new Map();

    chrome.downloads.onChanged.addListener((downloadItem) => {
      const id = downloadItem.id;
      if (id && downloadStatus.has(id)) {
        const state = downloadItem.state;
        if (state && state.current === 'complete') {
          console.log(`[下载完成] ${downloadStatus.get(id)} - ID: ${id}`);
          downloadStatus.delete(id);
        } else if (state && state.current === 'interrupted') {
          const reason = state.reason;
          console.error(`[下载失败] ${downloadStatus.get(id)} - 原因: ${reason}`);
          downloadStatus.delete(id);
        }
      }
    });

    // 1. 注入脚本，提取所有 canvas 并转为 Base64 数组
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const images = [];
        document.querySelectorAll('canvas').forEach((canvas) => {
          try {
            const dataUrl = canvas.toDataURL('image/png');
            images.push(dataUrl);
          } catch (e) {
            console.warn('Canvas 跨域污染或导出失败', e);
          }
        });
        return images;
      }
    });

    const canvasImages = results[0]?.result || [];

    // 如果没有检测到任何 canvas，直接提示并退出
    if (canvasImages.length === 0) {
      // background script 中 alert 不可用，使用 console 或 chrome.notifications
      console.warn('当前页面未检测到任何可导出的 Canvas 元素！');
      // 尝试使用 chrome.notifications 弹出提示（需要权限）
      try {
        await chrome.notifications.create({
          type: 'basic',
          title: 'Canvas 导出',
          message: '当前页面未检测到任何可导出的 Canvas 元素！',
          iconUrl: 'icon.png'
        });
      } catch (notifErr) {
        console.warn('通知创建失败:', notifErr);
      }
      return;
    }

    // 2. 弹出原生确认框，让用户确认是否下载
    const confirmResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (count) => {
        return confirm(`检测到 ${count} 个 Canvas 元素。\n\n是否将它们保存到 Downloads 文件夹中？`);
      },
      args: [canvasImages.length]
    });

    // 如果用户点击了"取消"，则直接结束，不执行下载
    if (!confirmResult[0]?.result) {
      return;
    }

    // 3. 用户点击"确认"，获取当前时间戳并开始下载
    const timestamp = getFormattedTimestamp();
    const dirPath = `Canvas_${timestamp}`;

    // 【改进1】分批下载，控制并发数，避免同时发起过多下载请求
    const batchSize = 5; // 每批最多5个并发下载
    let failedCount = 0;

    for (let i = 0; i < canvasImages.length; i += batchSize) {
      const batch = canvasImages.slice(i, i + batchSize);

      await Promise.all(
        batch.map((dataUrl, idx) => {
          const index = i + idx;
          const filePath = `${dirPath}/canvas_${index + 1}.png`;

          return new Promise((resolve) => {
            // 【改进2】在发起下载前检查 data URL 长度，过大时使用 blob URL 降级
            const useBlobFallback = dataUrl.length > 2 * 1024 * 1024; // 2MB 阈值

            let downloadUrl = dataUrl;

            if (useBlobFallback) {
              // data URL 过长，尝试通过 blob + createObjectURL 方式
              console.warn(`canvas_${index + 1} 数据较大，使用 blob URL 降级策略`);
              try {
                const base64Data = dataUrl.split(',')[1];
                const byteCharacters = atob(base64Data);
                const byteArrays = [];

                for (let offset = 0; offset < byteCharacters.length; offset += 512) {
                  const slice = byteCharacters.slice(offset, offset + 512);
                  const byteNumbers = new Array(slice.length);
                  for (let j = 0; j < slice.length; j++) {
                    byteNumbers[j] = slice.charCodeAt(j);
                  }
                  byteArrays.push(new Uint8Array(byteNumbers));
                }

                const blob = new Blob(byteArrays, { type: 'image/png' });
                downloadUrl = URL.createObjectURL(blob);
              } catch (blobErr) {
                console.error(`canvas_${index + 1} blob 转换失败，回退到 data URL:`, blobErr);
                downloadUrl = dataUrl; // 回退
              }
            }

            // 【改进3】接收下载返回值，检测下载任务创建是否失败
            const downloadId = chrome.downloads.download({
              url: downloadUrl,
              filename: filePath,
              saveAs: false
            }, (downloadId) => {
              if (downloadId === null) {
                console.error(`[下载失败] canvas_${index + 1} - 下载任务创建失败(filename可能过长或格式无效)`);
                failedCount++;
                downloadStatus.delete(`canvas_${index + 1}`);
                resolve(null);
                return;
              }

              // 记录下载任务 ID 用于状态追踪
              downloadStatus.set(downloadId, `canvas_${index + 1}`);

              // 【改进4】对 blob URL 在适当时候释放内存
              if (useBlobFallback && downloadUrl.startsWith('blob:')) {
                // 延迟释放 blob URL，等待下载完成
                setTimeout(() => {
                  URL.revokeObjectURL(downloadUrl);
                }, 5000);
              }
            });

            // 【改进5】如果 chrome.downloads.download 不支持回调（某些旧版浏览器），
            // 使用返回值方式获取 ID
            if (downloadId !== undefined && downloadId !== null) {
              downloadStatus.set(downloadId, `canvas_${index + 1}`);
            }
          });
        })
      );

      console.log(`[下载进度] 已处理 ${Math.min(i + batchSize, canvasImages.length)}/${canvasImages.length} 个 Canvas`);
    }

    // 等待所有下载状态更新完成（最多等待 60 秒）
    const maxWaitTime = 60000;
    const checkInterval = 1000;
    let elapsedTime = 0;

    await new Promise((resolve) => {
      const timer = setInterval(() => {
        elapsedTime += checkInterval;
        if (downloadStatus.size === 0 || elapsedTime >= maxWaitTime) {
          clearInterval(timer);
          // 打印最终统计
          console.log(`[下载统计] 总计: ${canvasImages.length} 个, 成功: ${canvasImages.length - failedCount}, 失败: ${failedCount}`);
          resolve();
        }
      }, checkInterval);
    });

  } catch (err) {
    console.error(`插件执行失败: ${err}`);
  }
});