chrome.action.onClicked.addListener(async (tab) => {
  // 可选：判断是不是对应的网址（把 example.com 替换成你的目标网址）
  // if (!tab.url.includes("example.com")) {
  //   alert("请在目标网页使用此插件！");
  //   return;
  // }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
  } catch (err) {
    console.error("注入脚本失败:", err);
  }
});