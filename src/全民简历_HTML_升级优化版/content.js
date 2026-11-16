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
    
    // url 传进来必须是绝对路径
    const absoluteUrl = url;

    if (resourceMap.has(absoluteUrl)) {
      return resourceMap.get(absoluteUrl);
    }

    try {
      const response = await fetch(absoluteUrl);
      if (!response.ok) {
        console.warn('资源请求失败(HTTP状态码):', response.status, absoluteUrl);
        return null;
      }
      
      const blob = await response.blob();

      // 读取前 4 个字节，判断是不是 HTML 错误页面
      const arrayBuffer = await blob.slice(0, 4).arrayBuffer();
      const header = new TextDecoder().decode(arrayBuffer);

      if (header.includes('<') || header === '<!DO' || header.toLowerCase() === '<htm') {
        console.warn('拦截了无效资源（服务器返回了HTML）：', absoluteUrl);
        return null;
      }

      const contentType = response.headers.get('content-type') || '';

      let ext = 'png';
      if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
      else if (contentType.includes('svg')) ext = 'svg';
      else if (contentType.includes('woff2')) ext = 'woff2';
      else if (contentType.includes('woff')) ext = 'woff';
      else if (contentType.includes('ttf')) ext = 'ttf';
      else if (contentType.includes('otf')) ext = 'otf';
      else if (contentType.includes('eot')) ext = 'eot';
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
      console.warn('资源下载失败:', url, e);
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
          // 背景图相对路径基于当前页面解析
          const absUrl = new URL(match[1], window.location.href).href;
          const localPath = await fetchAsBlob(absUrl, 'images');
          if (localPath) {
            val = `url("../${localPath}")`;
          } else {
            val = 'none';
          }
        }
      }

      if (prop === 'animation' || prop === 'transition' || prop === 'cursor') continue;
      styleStr += `${prop}:${val};`;
    }
    clone.setAttribute('style', styleStr);

    if (node.tagName === 'IMG') {
      const absUrl = new URL(node.src, window.location.href).href;
      const localPath = await fetchAsBlob(absUrl, 'images');
      if (localPath) {
        clone.src = localPath;
      } else {
        clone.removeAttribute('src');
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

  // 提取完整的 CSS 逻辑
  async function extractAndSaveStyles() {
    let allCssText = '';

    // 1. 遍历页面的 style 和 link[rel=stylesheet]
    const styleNodes = document.querySelectorAll('style, link[rel="stylesheet"]');
    for (const node of styleNodes) {
      if (node.tagName === 'STYLE') {
        allCssText += node.innerHTML + '\n';
      } else if (node.tagName === 'LINK' && node.href) {
        try {
          const res = await fetch(node.href);
          const cssContent = await res.text();
          allCssText += cssContent + '\n';
        } catch (e) {}
      }
    }

    // 2. 从样式表规则中提取字体 URL。
    // 这一步的关键：必须基于 sheet.href（CSS 文件的地址）来解析相对路径，而不是 window.location.href
    const fontUrlsToDownload = new Set();
    const fontUrlMap = new Map(); // absoluteUrl -> localPath

    for (const sheet of Array.from(document.styleSheets)) {
      let rules = null;
      try {
        rules = sheet.cssRules;
      } catch (e) {
        // 跨域样式表读不到规则，忽略，因为跨域字体通常会用绝对路径
      }

      if (rules) {
        const walk = (ruleList, baseHref) => {
          for (const rule of Array.from(ruleList)) {
            if (rule.type === CSSRule.FONT_FACE_RULE) {
              const src = rule.style.getPropertyValue('src') || '';
              const urlRegex = /url\(\s*['"]?([^'")]+)['"]?\s*\)/g;
              let match;
              while ((match = urlRegex.exec(src)) !== null) {
                let rawUrl = match[1];
                if (rawUrl.startsWith('data:')) continue;
                
                // 【核心修复】：使用 CSS 文件的绝对路径 (baseHref) 作为基准去解析
                const absoluteUrl = new URL(rawUrl, baseHref).href;
                fontUrlsToDownload.add(absoluteUrl);
              }
            } else if (rule.cssRules) {
              walk(rule.cssRules, baseHref);
            }
          }
        };
        // 传入 sheet.href 作为基准地址
        walk(rules, sheet.href || window.location.href);
      }
    }

    // 3. 下载字体
    for (const absoluteUrl of fontUrlsToDownload) {
      const localPath = await fetchAsBlob(absoluteUrl, 'fonts');
      fontUrlMap.set(absoluteUrl, localPath);
    }

    // 4. 将 CSS 中的字体 URL 替换为本地路径
    // 这里用正则全局替换，同样需要识别相对路径并解析为绝对路径去匹配
    allCssText = allCssText.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g, (match, rawUrl) => {
      if (rawUrl.startsWith('data:') || rawUrl.startsWith('blob:')) return match;
      
      try {
        // 尝试用多种基准路径去解析，只要能匹配到我们下载过的字体就行
        const baseHrefs = [window.location.href, ...Array.from(document.styleSheets).map(s => s.href).filter(Boolean)];
        
        for (const baseHref of baseHrefs) {
          const currentAbs = new URL(rawUrl, baseHref).href;
          if (fontUrlMap.has(currentAbs)) {
            const localPath = fontUrlMap.get(currentAbs);
            if (localPath) {
              return `url("../${localPath}")`;
            } else {
              return `url(local(""))`; // 失败则消除请求
            }
          }
        }
      } catch(e) {}
      return match; // 不是字体或没匹配上，保留原样
    });

    // 5. 构建最终 style.css
    const finalCss = `
      /* 基础排版重置 */
      html, body { margin: 0; padding: 0; background: #f5f5f5; display: flex; justify-content: center; }
      #${TARGET_ID} { width: 100%; max-width: 800px; background: #fff; box-sizing: border-box; margin: 20px 0; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
      img { max-width: 100%; height: auto; }

      /* 提取的原始样式（字体已替换） */
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