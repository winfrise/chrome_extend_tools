chrome.action.onClicked.addListener(async (tab) => {
  // 1. 检查是不是对应的网址
  const targetPattern = "https://www.qmjianli.com/";  // 改成你的网址前缀
  if (!tab.url || !tab.url.startsWith(targetPattern)) {
    // 提示用户当前不是对应网址（可用通知或控制台）
    console.warn("当前页面不是目标网址，不执行操作");
    // 可选：用徽标提示
    chrome.action.setBadgeText({ tabId: tab.id, text: "✗" });
    chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "red" });
    setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: "" }), 1500);
    return;
  }

  // 2. 注入 CSS 和 JS
  try {
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ["style.css"]
    });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });

    chrome.action.setBadgeText({ tabId: tab.id, text: "✓" });
    chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "green" });
    setTimeout(() => chrome.action.setBadgeText({ tabId: tab.id, text: "" }), 1500);
  } catch (err) {
    console.error("注入失败:", err);
  }
});