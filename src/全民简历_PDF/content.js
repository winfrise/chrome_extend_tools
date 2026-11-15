(function () {
  'use strict';

  // ================= 配置区 =================
  const BTN_ID = 'my-download-btn';
  const TARGET_ID = 'resume_pc'; // 要打印的目标元素 ID
  // ==========================================

  if (document.getElementById(BTN_ID)) return; // 防重复

  const btn = document.createElement('button');
  btn.id = BTN_ID;
  btn.className = 'my-download-btn';
  btn.textContent = '打印简历';
  btn.type = 'button';

  document.body.appendChild(btn);

  // ================== 拖动逻辑 ==================
  let isDragging = false;
  let startX, startY, startLeft, startTop;

  const initPosition = () => {
    const rect = btn.getBoundingClientRect();
    btn.style.left = rect.left + 'px';
    btn.style.top = rect.top + 'px';
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';
  };

  btn.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    initPosition();
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = parseInt(btn.style.left, 10) || 0;
    startTop = parseInt(btn.style.top, 10) || 0;
    btn.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    btn.style.left = `${startLeft + dx}px`;
    btn.style.top = `${startTop + dy}px`;
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      btn.style.cursor = 'pointer';
    }
  });

  let hasMoved = false;
  btn.addEventListener('mousedown', () => { hasMoved = false; });
  btn.addEventListener('mousemove', () => { if (isDragging) hasMoved = true; });
  // ================== 拖动逻辑结束 ==================

  // ================== 高级打印逻辑 ==================
  
  /**
   * 递归遍历节点，将原页面元素的内联样式、计算样式、图片地址、SVG 等完整克隆到 documentFragment
   * 这样可以最大程度避免外部 CSS 干扰，并保持 DOM 结构一致
   */
  function cloneNodeWithStyles(node) {
    // 处理文本节点
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(node.nodeValue);
    }
    // 处理非元素节点（如注释）
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return node.cloneNode(false);
    }

    const clone = node.cloneNode(false);
    
    // 1. 获取原元素的全部计算样式
    const computedStyle = window.getComputedStyle(node);
    // 2. 将这些样式全部转换为内联样式
    let styleStr = '';
    for (let i = 0; i < computedStyle.length; i++) {
      const prop = computedStyle[i];
      // 过滤掉一些对打印排版可能有负面影响的属性
      if (prop === 'position' && computedStyle[prop] === 'fixed') continue; 
      styleStr += `${prop}:${computedStyle.getPropertyValue(prop)};`;
    }
    clone.setAttribute('style', styleStr);

    // 3. 处理图片标签，获取绝对路径和 Base64（防止跨域或缓存丢失）
    if (node.tagName === 'IMG') {
      // 如果图片本身带有 src，确保能被 iframe 访问到
      // 在 iframe 中使用当前页面的 origin 和 url 路径，浏览器通常可以正常加载
      clone.src = node.src; 
    }

    // 4. 处理输入框的值
    if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') {
      clone.setAttribute('value', node.value);
    }

    // 5. 递归处理子元素
    node.childNodes.forEach(child => {
      clone.appendChild(cloneNodeWithStyles(child));
    });

    return clone;
  }

  function printOnly(elId) {
    const el = document.getElementById(elId);
    if (!el) {
      alert('未找到要打印的元素：#' + elId);
      return;
    }

    // 1) 创建隐藏 iframe
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(frame);

    const doc = frame.contentWindow.document;

    // 2) 核心：将目标元素及子元素全部转成带有内联样式的 DOM 节点
    const clonedElement = cloneNodeWithStyles(el);

    // 3) 构建 iframe 的 HTML
    // 注意：这里不再引入外部 CSS 文件，避免覆盖和冲突。
    // 完全依赖通过 JS 提取出来的内联样式。
    const extraCss = `
      <style>
        /* 重置打印页面的基础样式 */
        @page { margin: 10mm; } /* 默认四周留一点边距，根据需要调整 */
        html, body {
          margin: 0; padding: 0; background: #fff;
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        /* 确保目标元素的容器宽度正常 */
        #${elId} {
          width: 100% !important;
          display: block !important;
          box-sizing: border-box !important;
          /* 覆盖原网页中可能存在的绝对定位 */
          position: relative !important;
          left: auto !important;
          top: auto !important;
        }
        /* 确保打印的图片不超出边界 */
        img { max-width: 100% !important; height: auto !important; }
      </style>
    `;

    doc.open();
    doc.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8">` +
      extraCss +
      `</head><body></body></html>`
    );
    // 将克隆好的节点直接 append 到 body 中
    doc.body.appendChild(clonedElement);
    doc.close();

    // 4) 打印与清理逻辑
    let isPrinted = false;
    function doPrint() {
      if (isPrinted) return;
      isPrinted = true;
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
      } finally {
        window.removeEventListener('afterprint', cleanup);
        setTimeout(cleanup, 1000);
      }
    }

    function cleanup() {
      if (frame && frame.parentNode) {
        frame.parentNode.removeChild(frame);
      }
    }

    if (frame.readyState === 'complete') {
      setTimeout(doPrint, 300); // 给渲染留一点时间
    } else {
      frame.onload = () => setTimeout(doPrint, 300);
    }

    window.addEventListener('afterprint', cleanup);
    setTimeout(cleanup, 60000);
  }
  // ================== 打印逻辑结束 ==================

  btn.addEventListener('click', (e) => {
    if (hasMoved) return;
    printOnly(TARGET_ID);
  });
})();