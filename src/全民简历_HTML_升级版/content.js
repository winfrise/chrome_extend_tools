(async function () {
  'use strict';

  const TARGET_ID = 'resume_pc';
  const isConfirm = confirm("是否将当前页面导出为压缩包（含HTML、CSS、图片）？");
  if (!isConfirm) return;

  const el = document.getElementById(TARGET_ID);
  if (!el) {
    alert('未找到要导出的元素：#' + TARGET_ID);
    return;
  }

  // 记录抓取到的资源，防止重复下载 { 原始URL: "images/1.png" }
  const resourceMap = new Map();
  let imageCounter = 0;
  let fontCounter = 0;
  let fileCounter = 0;

  // 辅助函数：将任意 URL 转为 Blob，并记录映射关系
  async function fetchAsBlob(url, folder) {
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) return url;
    const absoluteUrl = new URL(url, window.location.href).href;
    
    if (resourceMap.has(absoluteUrl)) {
      return resourceMap.get(absoluteUrl);
    }

    try {
      const response = await fetch(absoluteUrl);
      const contentType = response.headers.get('content-type') || '';
      
      // 如果抓取到的是 HTML（防爬拦截），则不走本地化
      if (contentType.includes('text/html') && absoluteUrl.match(/\.(woff2?|ttf|otf|eot)$/i)) {
         console.warn('拦截了字体下载', absoluteUrl);
         return absoluteUrl;
      }

      const blob = await response.blob();
      
      // 确定扩展名
      let ext = 'png';
      if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
      else if (contentType.includes('svg')) ext = 'svg';
      else if (contentType.includes('woff2')) ext = 'woff2';
      else if (contentType.includes('woff')) ext = 'woff';
      else if (contentType.includes('ttf')) ext = 'ttf';
      else if (url.match(/\.([a-zA-Z0-9]+)(\?.*)?$/)) {
         ext = url.match(/\.([a-zA-Z0-9]+)(\?.*)?$/)[1];
      }

      let fileName = '';
      if (folder === 'images') fileName = `images/image_${imageCounter++}.${ext}`;
      else if (folder === 'fonts') fileName = `fonts/font_${fontCounter++}.${ext}`;
      else fileName = `${folder}/file_${fileCounter++}.${ext}`;

      resourceMap.set(absoluteUrl, fileName);
      
      // 将 blob 存入 zip 对象中 (稍后统一打包)
      zip.file(fileName, blob);
      
      return fileName;
    } catch (e) {
      console.warn('资源下载失败，保留原链接:', url);
      return url;
    }
  }

  // 初始化 JSZip
  const zip = new JSZip();

  // 辅助函数：处理 CSS 背景图
  async function processBackgroundImage(bgImage) {
    if (!bgImage || bgImage === 'none') return bgImage;
    const match = bgImage.match(/url\(['"]?(.*?)['"]?\)/);
    if (match && match[1]) {
      const localPath = await fetchAsBlob(match[1], 'images');
      return `url("${localPath}")`;
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
        prop === 'animation' || prop === 'transition' || prop === 'cursor' || 
        prop === '-webkit-font-smoothing' || prop === 'will-change'
      ) {
        continue;
      }

      styleStr += `${prop}:${val};`;
    }
    clone.setAttribute('style', styleStr);

    // 处理 IMG，抓取并本地化
    if (node.tagName === 'IMG') {
      const localPath = await fetchAsBlob(node.src, 'images');
      clone.src = localPath;
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

  // 提取字体样式并保存到 style 文件夹
  async function extractAndSaveStyles() {
    let mainStyleCss = '';
    let fontFaceCss = '';
    const urlRegex = /url\(['"]?(.*?)['"]?\)/g;

    // 1. 遍历页面样式表提取 Icon 和 Font-face
    for (let i = 0; i < document.styleSheets.length; i++) {
      try {
        const rules = document.styleSheets[i].cssRules;
        for (let j = 0; j < rules.length; j++) {
          const rule = rules[j];
          
          if (rule.type === CSSRule.FONT_FACE_RULE) {
            let cssText = rule.cssText;
            const matches = [...cssText.matchAll(urlRegex)];
            
            for (const match of matches) {
              const originalUrl = match[1];
              if (originalUrl.startsWith('data:')) continue; 
              
              // 字体存到 fonts 文件夹
              const localPath = await fetchAsBlob(originalUrl, 'fonts');
              cssText = cssText.replace(originalUrl, `../${localPath}`);
            }
            fontFaceCss += cssText + '\n';
          } 
          else if (rule.selectorText && /icon|fa-|iconfont/i.test(rule.selectorText)) {
            mainStyleCss += rule.cssText + '\n';
          }
        }
      } catch (e) {}
    }

    // 2. 构建完整的 style.css
    const finalCss = `
      /* 基础重置 */
      html, body {
        margin: 0; padding: 0; background: #f5f5f5; 
        display: flex; justify-content: center;
      }
      #${TARGET_ID} {
        width: 100%; max-width: 800px; background: #fff;
        box-sizing: border-box; margin: 20px 0;
        box-shadow: 0 0 10px rgba(0,0,0,0.1);
      }
      img { max-width: 100%; height: auto; }

      /* 字体定义 */
      ${fontFaceCss}
      
      /* 图标类定义 */
      ${mainStyleCss}
    `;

    // 把 CSS 存入 zip
    zip.file("style/style.css", finalCss);
  }

  try {
    const originalTitle = document.title;
    document.title = '正在打包资源...';

    // 1. 抓取 DOM 和图片
    const clonedElement = await cloneNodeWithStyles(el);
    
    // 2. 抓取字体和 CSS
    await extractAndSaveStyles();

    // 3. 生成 HTML 字符串
    const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${originalTitle}</title>
  <link rel="stylesheet" href="style/style.css">
</head>
<body>
  ${clonedElement.outerHTML}
</body>
</html>`;

    // 把 HTML 存入 zip
    zip.file("index.html", htmlContent);

    document.title = '正在压缩...';

    // 4. 生成 zip 并触发下载
    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    
    // 文件名：简历_时间戳
    const safeTitle = "简历"; 
    a.download = `${safeTitle}_${new Date().getTime()}.zip`; 
    document.body.appendChild(a);
    a.click();

    document.title = originalTitle;
    
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);

  } catch (err) {
    console.error('导出 ZIP 失败:', err);
    alert('导出失败，请查看控制台');
  }
})();