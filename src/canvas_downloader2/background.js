chrome.action.onClicked.addListener(async (tab) => {
  try {

    function getFormattedTimestamp() {
      const now = new Date();
      const year = now.getFullYear();
      // getMonth() 返回 0-11，所以需要 +1；padStart(2, '0') 用于不足两位时补零
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');

      return `${year}${month}${day}_${hours}时${minutes}分${seconds}秒`;
    }

    // 1. 注入脚本，提取所有 canvas 并转为 Base64 数组
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const images = [];
        document.querySelectorAll('canvas').forEach((canvas) => {
          try {
            const dataUrl = canvas.toDataURL('image/jpeg');
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
      alert('当前页面未检测到任何可导出的 Canvas 元素！');
      return;
    }

    // 2. 弹出原生确认框，让用户确认是否下载
    // 注意：confirm 必须在 executeScript 中执行，因为它需要访问网页的 DOM 上下文
    const confirmResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (count) => {
        return confirm(`检测到 ${count} 个 Canvas 元素。\n\n是否将它们保存到 Downloads 文件夹中？`);
      },
      args: [canvasImages.length]
    });

    // 如果用户点击了“取消”，则直接结束，不执行下载
    if (!confirmResult[0]?.result) {
      return; 
    }

    // 3. 用户点击“确认”，获取当前时间戳并开始下载
    const timestamp = getFormattedTimestamp(); 

    canvasImages.forEach((dataUrl, index) => {
      // 格式为：Downloads/时间戳/canvas_时间戳_序号.png
      const filePath = `Canvas_${timestamp}/canvas_${index + 1}.jpg`;

      chrome.downloads.download({
        url: dataUrl,
        filename: filePath, 
        saveAs: false 
      });
    });

  } catch (err) {
    console.error(`插件执行失败: ${err}`);
  }
});