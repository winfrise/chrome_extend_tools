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

  const zip = new JSZip();
  const resourceMap = new Map();
  let imageCounter = 0;
  let fontCounter = 0;

  // 辅助函数：获取文件真实类型并下载
  async function fetchAsBlob(url, folder) {
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) return url;
    const absoluteUrl = new URL(url, window.location.href).href;
    
    if (resourceMap.has(absoluteUrl)) {
      return resourceMap.get(absoluteUrl);
    }

    try {
      const response = await fetch(absoluteUrl);
      const blob = await response.blob();
      
      // 读取前 4 个字节，判断是不是 HTML 错误页面
      const arrayBuffer = await blob.slice(0, 4).arrayBuffer();
      const header = new TextDecoder().decode(arrayBuffer);

      // 如果文件头是 "<!DO", "<htm", "<HTM"，说明这是个报错页面，绝对不能存为字体！
      if (header.includes('<') || header === '<!DO' || header.toLowerCase() === '<htm') {
        console.warn('拦截了无效资源（服务器返回了HTML）：', absoluteUrl);
        return null; // 返回 null 表示丢弃此资源
      }

      const contentType = response.headers.get('content-type') || '';
      
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
      
      resourceMap.set(absoluteUrl, fileName);
      zip.file(fileName, blob);
      
      return fileName;
    } catch (e) {
      console.warn('资源下载失败:', url);
      return null;
    }
  }

  // 克隆节点逻辑
  async function cloneNodeWithStyles(node) {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue);
    if (node.nodeType !== Node.ELEMENT_NODE) return node.cloneNode(false);

    const clone = node.cloneNode(false);
    const computedStyle = window.getComputedStyle(node);
    let styleStr = '';

    for (let i = 0; i < computedStyle.length; i++) {
      const prop = computedStyle[i];
      if (prop === 'position' && computedStyle[prop] === 'fixed') continue; 
      
      let val = computedStyle.getPropertyValue(prop);
      
      if (prop === 'background-image' && val.includes('url(')) {
        const match = val.match(/url\(['"]?(.*?)['"]?\)/);
        if (match && match[1]) {
          const localPath = await fetchAsBlob(match[1], 'images');
          if (localPath) {
            val = `url("../${localPath}")`;
          } else {
            val = 'none'; // 如果背景图失效，干脆不要了
          }
        }
      }
      
      if (prop === 'animation' || prop === 'transition' || prop === 'cursor') continue;
      styleStr += `${prop}:${val};`;
    }
    clone.setAttribute('style', styleStr);

    if (node.tagName === 'IMG') {
      const localPath = await fetchAsBlob(node.src, 'images');
      if (localPath) {
        clone.src = localPath; 
      } else {
        clone.removeAttribute('src'); // 图片失效则移除
      }
    }

    if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA') {
      clone.setAttribute('value', node.value);
    }

    for (let i = 0; i < node.childNodes.length; i++) {
      clone.appendChild(await cloneNodeWithStyles(node.childNodes[i]));
    }
    return clone;
  }

  // 提取完整的 CSS 逻辑（包含字体修复）
  async function extractAndSaveStyles() {
    let allCssText = '';

    // 1. 遍历页面的 style 和 link[rel=stylesheet]
    const styleNodes = document.querySelectorAll('style, link[rel="stylesheet"]');
    for (const node of styleNodes) {
      if (node.tagName === 'STYLE') {
        allCssText += node.innerHTML + '\n';
      } else if (node.tagName === 'LINK' && node.href) {
        // 跨域样式表
        try {
          const res = await fetch(node.href);
          const cssContent = await res.text();
          allCssText += cssContent + '\n';
        } catch (e) {}
      }
    }

    // 2. 正则匹配所有字体 URL
    const urlRegex = /url\(['"]?(.*?)['"]?\)/g;
    let match;
    const fontUrls = new Set();
    
    // 只提取 @font-face 里面的字体
    const fontFaceRegex = /@font-face\s*{[^}]*}/g;
    const fontFaces = allCssText.match(fontFaceRegex) || [];
    
    for (const face of fontFaces) {
      while ((match = urlRegex.exec(face)) !== null) {
        const originalUrl = match[1];
        if (originalUrl.startsWith('data:')) continue;
        // 仅仅抓取字体后缀或者包含 font 关键字的链接
        if (originalUrl.match(/\.(woff2?|ttf|otf|eot)(\?.*)?$/i) || originalUrl.includes('font')) {
          fontUrls.add(originalUrl);
        }
      }
    }

    // 3. 下载并替换字体路径
    for (const fontUrl of fontUrls) {
      const localPath = await fetchAsBlob(fontUrl, 'fonts');
      if (localPath) {
        // 将原 CSS 中的链接替换为相对路径 ../fonts/font_x.woff2
        allCssText = allCssText.split(fontUrl).join(`../${localPath}`);
      } else {
        // 如果字体抓取失败（返回 null），清理掉这个无效的 @font-face
        // 否则浏览器还会报错。
        const regex = new RegExp(`@font-face\\s*{[^}]*${fontUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^}]*}`, 'g');
        allCssText = allCssText.replace(regex, '');
      }
    }

    // 4. 构建最终 style.css
    const finalCss = `
      /* 基础排版重置 */
      html, body { margin: 0; padding: 0; background: #f5f5f5; display: flex; justify-content: center; }
      #${TARGET_ID} { width: 100%; max-width: 800px; background: #fff; box-sizing: border-box; margin: 20px 0; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
      img { max-width: 100%; height: auto; }

      /* 提取的原始样式 */
      ${allCssText}
    `;

    zip.file("style/style.css", finalCss);
  }

  try {
    const originalTitle = document.title;
    document.title = '正在打包资源...';

    const clonedElement = await cloneNodeWithStyles(el);
    await extractAndSaveStyles();

    const htmlContent = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${originalTitle}</title>
  <link rel="stylesheet" href="./style/style.css">
</head>
<body>
  ${clonedElement.outerHTML}
</body>
</html>`;

    zip.file("index.html", htmlContent);
    document.title = '正在压缩...';

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = `简历_${new Date().getTime()}.zip`; 
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