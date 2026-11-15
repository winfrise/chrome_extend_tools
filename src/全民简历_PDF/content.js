(function () {
  const BTN_ID = "my-download-btn";
  if (document.getElementById(BTN_ID)) return; // 防止重复添加

  const btn = document.createElement("button");
  btn.id = BTN_ID;
  btn.className = "my-download-btn";
  btn.textContent = "下载";

  document.body.appendChild(btn);

  // ================== 拖动逻辑开始 ==================
  let isDragging = false;
  let startX, startY;
  let startLeft, startTop;

  // 初始化按钮位置（如果不设置，默认为页面初始位置）
  // 为了能准确计算 left/top，我们需要先用 getBoundingClientRect 获取当前位置
  const initPosition = () => {
    const rect = btn.getBoundingClientRect();
    // 将原本的 right/bottom 定位转换为 left/top 定位，方便后续计算
    btn.style.left = rect.left + "px";
    btn.style.top = rect.top + "px";
    btn.style.right = "auto";    // 取消 right 定位
    btn.style.bottom = "auto";   // 取消 bottom 定位
  };

  // 鼠标按下：记录初始位置
  btn.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return; // 只处理左键
    initPosition();             // 第一次拖动前转换坐标系
    isDragging = true;
    
    // 记录鼠标按下的坐标
    startX = e.clientX;
    startY = e.clientY;
    
    // 记录按钮当前的 left/top 值
    startLeft = parseInt(btn.style.left, 10) || 0;
    startTop = parseInt(btn.style.top, 10) || 0;

    btn.style.cursor = "grabbing";
    e.preventDefault(); // 阻止默认的文本选中行为
  });

  // 鼠标移动：更新按钮位置
  document.addEventListener("mousemove", (e) => {
    if (!isDragging) return;

    // 计算鼠标移动的距离
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    // 更新按钮坐标
    btn.style.left = `${startLeft + dx}px`;
    btn.style.top = `${startTop + dy}px`;
  });

  // 鼠标松开：结束拖动
  document.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      btn.style.cursor = "pointer";
    }
  });
  // ================== 拖动逻辑结束 ==================

  // 点击事件（注意：要防止拖动结束时误触点击）
  let hasMoved = false;
  btn.addEventListener("mousedown", () => { hasMoved = false; });
  btn.addEventListener("mousemove", () => { if (isDragging) hasMoved = true; });

  btn.addEventListener("click", (e) => {
    if (hasMoved) return; // 如果发生了拖动，就不触发下载

    console.log("下载按钮被点击");
    // 这里放你的业务逻辑
    const data = {
      title: document.title,
      url: location.href,
      time: new Date().toISOString()
    };
    downloadJSON(data, `page-data-${Date.now()}.json`);
  });

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