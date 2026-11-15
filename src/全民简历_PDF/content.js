(function () {
  'use strict';

  const BTN_ID = 'my-download-btn';
  const TARGET_ID = 'resume_pc'; 

  if (document.getElementById(BTN_ID)) return;

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
  
  // 辅助函数：将图片 URL 转换为 Base64
  async function getBase64Image(imgUrl) {
    if (!imgUrl || imgUrl.startsWith('data:')) return imgUrl;
    try {
      const response = await fetch(imgUrl);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => resolve(imgUrl);
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      return imgUrl; 
    }
  }

  async function processBackgroundImage(bgImage) {
    if (!bgImage || bgImage === 'none') return bgImage;
    const match = bgImage.match(/url\(['"]?(.*?)['"]?\)/);
    if (match && match[1]) {
      const base64 = await getBase64Image(match[1]);
      return `url("${base64}")`;
    }
    return bgImage;
  }

  // 核心：递归克隆并提取内联样式（并给每个节点打上唯一 ID 方便写伪元素样式）
  let nodeIdCounter = 0;
  let pseudoCssStr = '';

  async function cloneNodeWithStyles(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(node.nodeValue);
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return node.cloneNode(false);
    }

    const clone = node.cloneNode(false);
    
    // 给克隆的节点加一个唯一 ID，用于后续应用伪元素
    const uniqueId = `print-node-${nodeIdCounter++}`;
    clone.setAttribute('data-print-id', uniqueId);

    const computedStyle = window.getComputedStyle(node);
    let styleStr = '';

    for (let i = 0; i < computedStyle.length; i++) {
      const prop = computedStyle[i];
      if (prop === 'position' && computedStyle[prop] === 'fixed') continue; 
      
      let val = computedStyle.getPropertyValue(prop);
      
      // 处理背景图
      if (prop === 'background-image' && val.includes('url(')) {
        val = await processBackgroundImage(val);
      }
      styleStr += `${prop}:${val};`;
    }
    clone.setAttribute('style', styleStr);

    // 【重点修复1】处理伪元素样式
    const beforeStyle = window.getComputedStyle(node, '::before');
    if (beforeStyle && beforeStyle.content && beforeStyle.content !== 'none') {
       let bStr = `[data-print-id="${uniqueId}"]::before {`;
       for (let i = 0; i < beforeStyle.length; i++) {
         bStr += `${beforeStyle[i]}:${beforeStyle.getPropertyValue(beforeStyle[i])};`;
       }
       pseudoCssStr += bStr + '}';
    }
    const afterStyle = window.getComputedStyle(node, '::after');
    if (afterStyle && afterStyle.content && afterStyle.content !== 'none') {
       let aStr = `[data-print-id="${uniqueId}"]::after {`;
       for (let i = 0; i < afterStyle.length; i++) {
         aStr += `${afterStyle[i]}:${afterStyle.getPropertyValue(afterStyle[i])};`;
       }
       pseudoCssStr += aStr + '}';
    }

    // 处理 IMG
    if (node.tagName === 'IMG') {
      const base64Src = await getBase64Image(node.src);
      clone.src = base64Src;
    }

    // 处理输入框
    if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') {
      clone.setAttribute('value', node.value);
    }

    // 递归子元素
    for (let i = 0; i < node.childNodes.length; i++) {
      const childClone = await cloneNodeWithStyles(node.childNodes[i]);
      clone.appendChild(childClone);
    }

    return clone;
  }

  async function printOnly(elId) {
    const el = document.getElementById(elId);
    if (!el) {
      alert('未找到要打印的元素：#' + elId);
      return;
    }

    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(frame);

    const doc = frame.contentWindow.document;

    const originalText = btn.textContent;
    btn.textContent = '准备中...';
    btn.disabled = true;

    // 重置伪元素记录
    nodeIdCounter = 0;
    pseudoCssStr = '';

    try {
      // 1) 克隆节点
      const clonedElement = await cloneNodeWithStyles(el);

      // 2) 【重点修复2】提取所有字体样式（Iconfont）和图标样式
      let fontStyles = '';
      const styleSheets = document.styleSheets;
      for (let i = 0; i < styleSheets.length; i++) {
        try {
          const rules = styleSheets[i].cssRules;
          for (let j = 0; j < rules.length; j++) {
            const rule = rules[j];
            // 提取 @font-face
            if (rule.type === CSSRule.FONT_FACE_RULE) {
              fontStyles += rule.cssText;
            } 
            // 提取包含 icon 的类名（如 .iconfont, .el-icon 等）
            else if (rule.selectorText && /icon|fa-|iconfont/i.test(rule.selectorText)) {
               fontStyles += rule.cssText;
            }
          }
        } catch (e) {}
      }

      // 3) 构建 iframe，把所有内容塞进去
      const extraCss = `
        <style>
          @page { margin: 10mm; }
          html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          #${elId} { width: 100% !important; display: block !important; box-sizing: border-box !important; position: relative !important; left: auto !important; top: auto !important; }
          img { max-width: 100% !important; height: auto !important; }
          /* 强制打印 SVG */
          svg { max-width: 100%; max-height: 100%; }
          /* 注入 Iconfont 和原页面提取到的伪元素样式 */
          ${fontStyles}
          ${pseudoCssStr}
        </style>
      `;

      doc.open();
      doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8">${extraCss}</head><body></body></html>`);
      doc.body.appendChild(clonedElement);
      doc.close();

      // 4) 打印与清理
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
        if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
        btn.textContent = originalText;
        btn.disabled = false;
      }

      setTimeout(doPrint, 500);
      window.addEventListener('afterprint', cleanup);
      setTimeout(cleanup, 60000);

    } catch (err) {
      console.error('打印准备失败:', err);
      alert('生成打印页面失败，请重试');
      btn.textContent = originalText;
      btn.disabled = false;
    }
  }
  // ================== 打印逻辑结束 ==================

  btn.addEventListener('click', (e) => {
    if (hasMoved) return;
    printOnly(TARGET_ID);
  });
})();