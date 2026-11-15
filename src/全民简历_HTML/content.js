(async function () {
  'use strict';

  const TARGET_ID = 'resume_pc'; // 要提取的目标元素 ID

  // 1. 弹出确认框
  const isConfirm = confirm("是否下载当前页面的 HTML？");
  if (!isConfirm) return;

  const el = document.getElementById(TARGET_ID);
  if (!el) {
    alert('未找到要导出的元素：#' + TARGET_ID);
    return;
  }

  // 辅助函数：将图片或字体 URL 转换为 Base64
  async function getBase64Resource(url) {
    if (!url || url.startsWith('data:')) return url;
    try {
      // 补全为绝对路径，防止相对路径在 fetch 时找不到
      const absoluteUrl = new URL(url, window.location.href).href;
      const response = await fetch(absoluteUrl);
      const blob = await response.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => resolve(absoluteUrl); // 失败则回退到绝对路径
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      console.warn('资源转 Base64 失败:', url);
      // 失败则回退到绝对路径
      return new URL(url, window.location.href).href; 
    }
  }

  // 辅助函数：处理 CSS 里的背景图
  async function processBackgroundImage(bgImage) {
    if (!bgImage || bgImage === 'none') return bgImage;
    const match = bgImage.match(/url\(['"]?(.*?)['"]?\)/);
    if (match && match[1]) {
      const base64 = await getBase64Resource(match[1]);
      return `url("${base64}")`;
    }
    return bgImage;
  }

  // 核心：递归克隆节点
  async function cloneNodeWithStyles(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(node.nodeValue);
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return node.cloneNode(false);
    }

    const clone = node.cloneNode(false);
    const computedStyle = window.getComputedStyle(node);
    let styleStr = '';

    for (let i = 0; i < computedStyle.length; i++) {
      const prop = computedStyle[i];
      if (prop === 'position' && computedStyle[prop] === 'fixed') continue; 
      
      let val = computedStyle.getPropertyValue(prop);
      
      if (prop === 'background-image' && val.includes('url(')) {
        val = await processBackgroundImage(val);
      }
      
      if (
        prop === 'animation' || 
        prop === 'transition' || 
        prop === 'cursor' || 
        prop === '-webkit-font-smoothing' || 
        prop === 'will-change'
      ) {
        continue;
      }

      styleStr += `${prop}:${val};`;
    }
    clone.setAttribute('style', styleStr);

    if (node.tagName === 'IMG') {
      clone.src = await getBase64Resource(node.src);
    }

    if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') {
      clone.setAttribute('value', node.value);
    }

    for (let i = 0; i < node.childNodes.length; i++) {
      const childClone = await cloneNodeWithStyles(node.childNodes[i]);
      clone.appendChild(childClone);
    }

    return clone;
  }

  // 【重点修复】：提取并转码字体 CSS
  async function getExternalFontCss() {
    let fontStyles = '';
    const styleSheets = document.styleSheets;

    // 用于从 CSS 中提取 url 的正则
    const urlRegex = /url\(['"]?(.*?)['"]?\)/g;

    for (let i = 0; i < styleSheets.length; i++) {
      try {
        const rules = styleSheets[i].cssRules;
        for (let j = 0; j < rules.length; j++) {
          const rule = rules[j];
          
          if (rule.type === CSSRule.FONT_FACE_RULE) {
            let cssText = rule.cssText;
            // 找到 @font-face 里的所有 url()
            const matches = [...cssText.matchAll(urlRegex)];
            
            // 逐个下载字体并转 Base64
            for (const match of matches) {
              const originalUrl = match[1];
              // 跳过已经是 base64 的
              if (originalUrl.startsWith('data:')) continue; 
              
              const base64Font = await getBase64Resource(originalUrl);
              // 替换原 CSS 中的链接
              cssText = cssText.replace(originalUrl, base64Font);
            }
            fontStyles += cssText + '\n';
          } 
          else if (rule.selectorText && /icon|fa-|iconfont/i.test(rule.selectorText)) {
            fontStyles += rule.cssText + '\n';
          }
        }
      } catch (e) {
        // 忽略跨域样式表读取错误
      }
    }
    return fontStyles;
  }

  try {
    // 提示用户正在处理
    const originalTitle = document.title;
    document.title = '正在导出...';

    // 1. 克隆带有完整内联样式的元素
    const clonedElement = await cloneNodeWithStyles(el);
    
    // 2. 提取并转码字体样式（现在这里已经是完整的 base64 字体了）
    const fontCss = await getExternalFontCss();

    // 3. 拼接最终导出的 HTML
    const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${originalTitle}</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background: #f5f5f5; 
      display: flex;
      justify-content: center;
    }
    #${TARGET_ID} {
      width: 100%;
      max-width: 800px; 
      background: #fff;
      box-sizing: border-box;
      margin: 20px 0;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
    }
    img { max-width: 100%; height: auto; }
    
    /* 注入转码后的图标字体样式 */
    ${fontCss}
  </style>
</head>
<body>
  ${clonedElement.outerHTML}
</body>
</html>`;

    // 恢复网页标题
    document.title = originalTitle;

    // 4. 创建 Blob 并触发下载
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // 清理一下文件名里的特殊字符
    const safeTitle = originalTitle.replace(/[\\/:*?"<>|]/g, '_');
    a.download = `${safeTitle}_${new Date().getTime()}.html`;
    document.body.appendChild(a);
    a.click();
    
    // 清理
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);

  } catch (err) {
    console.error('导出 HTML 失败:', err);
    alert('导出失败，请查看控制台');
  }
})();