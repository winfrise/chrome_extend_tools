(function () {
  const BTN_ID = "my-download-btn";
  if (document.getElementById(BTN_ID)) return; // 防止重复添加

  const btn = document.createElement("button");
  btn.id = BTN_ID;
  btn.className = "my-download-btn";   // 对应 style.css 中的样式
  btn.textContent = "下载";

  btn.addEventListener("click", () => {
    // 3. 点击下载按钮后执行的逻辑
    console.log("下载按钮被点击");

    // 示例：抓取页面中的数据并生成文件下载
    const data = {
      title: document.title,
      url: location.href,
      time: new Date().toISOString()
    };
    downloadJSON(data, `page-data-${Date.now()}.json`);
  });

  document.body.appendChild(btn);

  // 工具函数：生成并下载文件
  function downloadJSON(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
})();