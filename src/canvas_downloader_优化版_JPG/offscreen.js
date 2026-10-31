// offscreen.js

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'dataurl-to-blob') {
    try {
      // 将 dataURL 拆分为头部和 Base64 数据
      const [header, base64Data] = message.dataUrl.split(',');
      const mimeMatch = header.match(/data:([^;]+);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';

      // Base64 解码为二进制
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const blob = new Blob([bytes], { type: mime });
      const blobUrl = URL.createObjectURL(blob);

      chrome.runtime.sendMessage({
        target: 'background',
        type: 'blob-url-result',
        id: message.id,
        blobUrl
      });
    } catch (e) {
      chrome.runtime.sendMessage({
        target: 'background',
        type: 'blob-url-result',
        id: message.id,
        error: e.message
      });
    }
    return true;
  }

  if (message.type === 'revoke-blob') {
    URL.revokeObjectURL(message.blobUrl);
    return true;
  }
});