// 这里配置你允许的网址前缀（记得替换成你真实的网址）
const ALLOWED_URL_PATTERNS = [
  "https://www.qmjianli.com/"
];

chrome.action.onClicked.addListener(async (tab) => {
  // 1. 获取当前标签页的 URL
  const currentUrl = tab.url || "";

  // 2. 检查 URL 是否匹配允许的前缀
  const isAllowed = ALLOWED_URL_PATTERNS.some(pattern => currentUrl.startsWith(pattern));

  if (!isAllowed) {
    // 3. 不符合：执行一段脚本弹出提示框
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          alert("暂不支持当前网页！请在目标简历页面使用此插件。");
        }
      });
    } catch (e) {
      console.error("提示注入失败", e);
    }
    return; // 终止后续逻辑
  }

  // 4. 符合：注入原本的 content.js 逻辑
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["jszip.min.js", "content.js"] // 先注入 jszip，再注入 content
    });
  } catch (err) {
    console.error("注入脚本失败:", err);
  }
});