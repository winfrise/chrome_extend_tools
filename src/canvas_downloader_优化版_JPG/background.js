// background.js

let creatingOffscreen = null;

async function setupOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL('offscreen.html');
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });
  if (existingContexts.length > 0) return;

  if (creatingOffscreen) {
    await creatingOffscreen;
  } else {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['BLOBS'],
      justification: '将 Canvas DataURL 转换为 Blob URL 以减轻内存压力'
    });
    await creatingOffscreen;
    creatingOffscreen = null;
  }
}

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

// 向 offscreen 请求将 dataURL 转为 blob URL
function dataUrlToBlobUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const messageId = Math.random().toString(36).slice(2);
    const listener = (msg) => {
      if (msg.target === 'background' && msg.type === 'blob-url-result' && msg.id === messageId) {
        chrome.runtime.onMessage.removeListener(listener);
        if (msg.error) reject(new Error(msg.error));
        else resolve(msg.blobUrl);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'dataurl-to-blob',
      id: messageId,
      dataUrl
    }).catch(reject);
  });
}

chrome.action.onClicked.addListener(async (tab) => {
  try {
    // 1. 提取 Canvas DataURL（只传字符串，不传二进制）
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const images = [];
        document.querySelectorAll('canvas').forEach((canvas) => {
          try {
            images.push(canvas.toDataURL('image/jpeg', 0.85));
          } catch (e) {
            console.warn('Canvas 导出失败', e);
          }
        });
        return images;
      }
    });

    const canvasImages = results[0]?.result || [];
    if (canvasImages.length === 0) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => alert('当前页面未检测到任何可导出的 Canvas 元素！')
      });
      return;
    }

    // 2. 确认
    const confirmResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (count) => confirm(`检测到 ${count} 个 Canvas 元素。\n\n是否保存到 Downloads 文件夹？`),
      args: [canvasImages.length]
    });
    if (!confirmResult[0]?.result) return;

    // 3. 确保 offscreen 存在
    await setupOffscreenDocument();

    const timestamp = getFormattedTimestamp();

    // 4. 逐个转为 Blob URL 并下载（串行，避免瞬时资源争抢）
    for (let i = 0; i < canvasImages.length; i++) {
      const blobUrl = await dataUrlToBlobUrl(canvasImages[i]);
      const filename = `Canvas_${timestamp}/canvas_${i + 1}.jpg`;

      await chrome.downloads.download({
        url: blobUrl,
        filename,
        saveAs: false
      });

      // 延迟释放 Blob URL，确保下载管理器已读完数据
      // 如果文件特别大，可适当延长此时间
      setTimeout(() => {
        // 通知 offscreen 释放（可选，页面关闭会自动回收）
        chrome.runtime.sendMessage({
          target: 'offscreen',
          type: 'revoke-blob',
          blobUrl
        }).catch(() => {});
      }, 120000); // 2 分钟后释放
    }

  } catch (err) {
    console.error(`插件执行失败: ${err}`);
  }
});