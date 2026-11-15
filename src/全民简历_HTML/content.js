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

  // 辅助函数：将图片 URL 转换为 Base64（防止本地打开 HTML 时图片失效）
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
      return imgUrl; // 遇到防盗链或跨域失败，直接返回原链接
    }
  }

  // 辅助函数：处理 CSS 里的背景图，转为 Base64
  async function processBackgroundImage(bgImage) {
    if (!bgImage || bgImage === 'none') return bgImage;
    const match = bgImage.match(/url\(['"]?(.*?)['"]?\)/);
    if (match && match[1]) {
      const base64 = await getBase64Image(match[1]);
      return `url("${base64}")`;
    }
    return bgImage;
  }

  // 核心：递归克隆节点，将样式变成内联，并处理图片
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
      
      // 处理背景图转 Base64
      if (prop === 'background-image' && val.includes('url(')) {
        val = await processBackgroundImage(val);
      }
      
      // 【关键优化】：因为导出的 HTML 是静态的，我们不需要任何动画、过渡、光标样式等
      // 把不需要的 CSS 属性过滤掉，让 HTML 体积更小
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

    // 处理 IMG 标签
    if (node.tagName === 'IMG') {
      const base64Src = await getBase64Image(node.src);
      clone.src = base64Src;
    }

    // 处理输入框的值
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

  // 辅助函数：提取页面外部的 Iconfont 样式（因为有些小图标是外链 CSS 引入的）
  function getExternalFontCss() {
    let fontStyles = '';
    const styleSheets = document.styleSheets;
    for (let i = 0; i < styleSheets.length; i++) {
      try {
        const rules = styleSheets[i].cssRules;
        for (let j = 0; j < rules.length; j++) {
          const rule = rules[j];
          // 只提取字体定义和图标相关的类
          if (rule.type === CSSRule.FONT_FACE_RULE || 
             (rule.selectorText && /icon|fa-|iconfont/i.test(rule.selectorText))) {
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
    
    // 2. 提取图标样式
    const fontCss = getExternalFontCss();

    // 3. 拼接最终导出的 HTML
    const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${originalTitle}</title>
  <style>
    /* 重置基础样式 */
    html, body {
      margin: 0;
      padding: 0;
      background: #f5f5f5; /* 网页背景稍微灰一点，衬托简历 */
      display: flex;
      justify-content: center;
    }
    /* 让目标内容像一张 A4 纸一样居中显示 */
    #${TARGET_ID} {
      width: 100%;
      max-width: 800px; /* A4 纸的常见网页宽度 */
      background: #fff;
      box-sizing: border-box;
      margin: 20px 0;
      box-shadow: 0 0 10px rgba(0,0,0,0.1);
    }
    /* 防止图片溢出 */
    img { max-width: 100%; height: auto; }
    
    /* 注入提取的图标字体样式 */
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
    a.download = `导出内容_${new Date().getTime()}.html`;
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