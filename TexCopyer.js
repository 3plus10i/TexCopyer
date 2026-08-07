// ==UserScript==
// @name         TexCopyer
// @namespace    http://tampermonkey.net/
// @version      1.6
// @license      GPLv3
// @description  双击网页中的LaTex公式，将其复制到剪切板。支持主流AI网站、知乎、IEEE等等
// @description:en Double click on a LaTeX formula on a webpage to copy it to the clipboard
// @author       3plus10i
// @match        *://*.wikipedia.org/*
// @match        *://*.zhihu.com/*
// @match        *://*.chatgpt.com/*
// @match        *://*.stackexchange.com/*
// @match        *://oi-wiki.org/*
// @match        *://*.doubao.com/*
// @match        *://*.deepseek.com/*
// @match        *://*.chatboxai.app/*
// @match        *://ieeexplore.ieee.org/*
// @match        *://*.bohrium.com/*
// @match        *://*.gemini.google.com/*
// @match        *://aistudio.google.com/*
// @match        *://*.grok.com/*
// @match        *://x.com/*
// @match        *://*.z.ai/*
// @match        *://*.qianwen.com/*
// @match        *://*.metaso.cn/*
// @match        *://*.csdn.net/*
// @downloadURL https://update.greasyfork.org/scripts/499346/TexCopyer.user.js
// @updateURL https://update.greasyfork.org/scripts/499346/TexCopyer.meta.js
// ==/UserScript==

(function () {
    'use strict';

    // ---- 工具函数 ----

    function formatLatex(input) {
        while (input.endsWith(' ') || input.endsWith('\\')) {
            input = input.slice(0, -1);
        }
        return '$' + input + '$';
    }

    /** 从元素中用 querySelector 安全取值，失败返回空字符串 */
    function safeText(el, selector) {
        const found = el.querySelector(selector);
        return found ? found.textContent : '';
    }

    /** 从元素中安全读取属性，失败返回空字符串 */
    function safeAttr(el, attr) {
        const val = el.getAttribute(attr);
        return val || '';
    }

    // ---- 站点配置（按需扩展） ----

    const SITE_CONFIGS = [
        {
            match: u => u.includes('wikipedia.org'),
            selector: 'span.mwe-math-element',
            extract: el => formatLatex(safeAttr(el.querySelector('math'), 'alttext')),
        },
        {
            match: u => u.includes('zhihu.com'),
            selector: 'span.ztext-math',
            extract: el => formatLatex(safeAttr(el, 'data-tex')),
        },
        {
            match: u => u.includes('chatgpt.com'),
            selector: '[role="math"][data-math-source]',
            extract: el => formatLatex(
                safeAttr(el, 'data-math-source').trim()
            ),
        },
        // Kimi (moonshot.cn) — Vue生产构建剥离了内部引用，
        // 且仅通过闭包持有LaTeX源码，暂无可靠提取路径。
        {
            match: u => u.includes('stackexchange.com'),
            selector: 'span.math-container',
            extract: el => formatLatex(safeText(el, 'script')),
        },
        {
            match: u => u.includes('oi-wiki.org'),
            selector: 'mjx-container.MathJax',
            extract: el => formatLatex(safeAttr(el.querySelector('mjx-math'), 'data-latex').trim()),
        },
        {
            match: u => u.includes('doubao.com'),
            selector: 'span.math-inline',
            extract: el => {
                const raw = safeAttr(el, 'copy-text');
                // 剥离 \( ... \) 包裹
                const inner = raw.replace(/^\\\(|\\\)$/g, '');
                return inner ? formatLatex(inner) : '';
            },
        },
        {
            match: u => u.includes('deepseek.com'),
            selector: 'span.katex',
            extract: el => formatLatex(safeText(el, 'annotation')),
        },
        {
            match: u => u.includes('chatboxai.app'),
            selector: 'span.katex',
            extract: el => formatLatex(safeText(el, 'annotation')),
        },
        {
            match: u => u.includes('ieeexplore.ieee.org'),
            selector: 'span[id^="MathJax-Element-"][id$="-Frame"]',
            extract(el) {
                const idMatch = el.id.match(/Element-(\w+)-Frame/);
                if (!idMatch) return '';

                const scriptEl = document.getElementById(`MathJax-Element-${idMatch[1]}`);
                if (!scriptEl) return '';

                let latex = scriptEl.textContent;
                latex = latex.replace(/\\begin\{equation\*\}/g, '\\[\\begin{array}{l}');
                latex = latex.replace(/\\end\{equation\*\}/g, '\\end{array}\\]');
                latex = latex.replace(/\\tag\{(\w+)\}/g, '\\\\');
                return formatLatex(latex);
            },
        },
        {
            match: u => u.includes('bohrium.com'),
            selector: '.math.math-inline, .math.math-display',
            extract: el => formatLatex(safeText(el, 'annotation[encoding="application/x-tex"]')),
        },
        {
            match: u => u.includes('gemini.google.com'),
            selector: '.math-inline, .math-block',
            extract: el => formatLatex(safeAttr(el, 'data-math')),
        },
        {
            match: u => u.includes('aistudio.google.com'),
            selector: 'ms-katex.inline, .katex-display, span.katex',
            extract: el => formatLatex(safeText(el, 'annotation[encoding="application/x-tex"]')),
        },
        {
            match: u => u.includes('grok.com') || u.includes('x.com'),
            selector: 'span.katex',
            extract: el => formatLatex(safeText(el, 'annotation')),
        },
        {
            match: u => u.includes('z.ai'),
            selector: 'span.katex',
            extract: el => formatLatex(safeText(el, 'annotation')),
        },
        {
            match: u => u.includes('qianwen.com'),
            selector: 'span.katex, .katex-display',
            extract: el => formatLatex(safeText(el, 'annotation')),
        },
        {
            match: u => u.includes('metaso.cn'),
            selector: 'span.katex',
            extract: el => formatLatex(safeText(el, 'annotation')),
        },
        {
            match: u => u.includes('csdn.net'),
            selector: 'span.katex',
            extract: el => {
                const ml = el.querySelector('.katex-mathml');
                if (!ml) return '';
                // 真正的 LaTeX 表达式始终在最后一行非空文本。
                const lines = ml.textContent.split('\n')
                    .map(s => s.trim())
                    .filter(s => s.length > 0);
                let tex = lines.pop() || '';
                tex = tex.replace(/^\\displaystyle\s+/, '');
                return formatLatex(tex);
            },
        },
    ];

    /** 返回当前 URL 匹配的第一个站点配置，无匹配返回 null */
    function resolveSite(url) {
        return SITE_CONFIGS.find(cfg => cfg.match(url)) || null;
    }

    // 模块级缓存，页面生命周期内不变
    const currentSite = resolveSite(window.location.href);

    // ---- DOM / UI ----

    const css = `
        .latex-tooltip { position: fixed; background-color: rgba(0, 0, 0, 0.85); color: #fff; padding: 5px 10px; border-radius: 5px; font-size: 11px; z-index: 1000; opacity: 0; transition: opacity 0.2s; pointer-events: none; }
    `;
    const styleSheet = document.createElement('style');
    styleSheet.type = 'text/css';
    styleSheet.innerText = css;
    document.head.appendChild(styleSheet);

    const tooltip = document.createElement('div');
    tooltip.classList.add('latex-tooltip');
    document.body.appendChild(tooltip);

    // ---- 事件绑定 ----

    const DATA_FLAG = 'data-texcopyer-processed';
    let successLock = false; // 复制成功1s内禁止 mouseleave 隐藏 tooltip

    function showTooltip(el, text) {
        tooltip.textContent = text;
        const rect = el.getBoundingClientRect();
        tooltip.style.display = 'block';
        tooltip.style.left = `${rect.left + rect.width / 2 - tooltip.offsetWidth / 2}px`;
        tooltip.style.top = `${rect.top - tooltip.offsetHeight - 5}px`;
        tooltip.style.opacity = '0.8';
    }

    function hideTooltip() {
        if (successLock) return;
        tooltip.style.display = 'none';
        tooltip.style.opacity = '0';
    }

    function showCopyResult(el) {
        successLock = true;
        showTooltip(el, '✔ 已复制');
        setTimeout(() => {
            successLock = false;
            hideTooltip();
        }, 1000);
    }

    function bindToNewElements() {
        if (!currentSite) return;

        document.querySelectorAll(currentSite.selector).forEach(el => {
            if (el.hasAttribute(DATA_FLAG)) return;
            el.setAttribute(DATA_FLAG, '');

            let bindTimer = null;
            let clickTimer = null;
            let clickCount = 0;

            el.addEventListener('mouseenter', function () {
                el.style.cursor = 'pointer';
                bindTimer = setTimeout(() => showTooltip(el, currentSite.extract(el)), 1000);
            });

            el.addEventListener('mouseleave', function () {
                el.style.cursor = 'auto';
                clearTimeout(bindTimer);
                clearTimeout(clickTimer);
                clickCount = 0;
                hideTooltip();
            });

            el.addEventListener('click', function () {
                clickCount++;

                if (clickCount === 1) {
                    clickTimer = setTimeout(() => {
                        clickCount = 0;
                        clearTimeout(bindTimer);
                        showTooltip(el, '💡 双击复制LaTeX公式');
                    }, 300);
                } else {
                    // click2 within 300ms → double-click
                    clearTimeout(clickTimer);
                    clearTimeout(bindTimer);
                    clickCount = 0;
                    const latex = currentSite.extract(el);
                    if (latex) {
                        console.log(`LaTeX copied: ${latex}`);
                        navigator.clipboard.writeText(latex).then(() => showCopyResult(el));
                    }
                    window.getSelection().removeAllRanges();
                }
            });
        });
    }

    // 初始绑定 & DOM 变化时重新绑定（防抖 300ms）
    document.addEventListener('DOMContentLoaded', bindToNewElements);
    let debounceId;
    new MutationObserver(() => {
        clearTimeout(debounceId);
        debounceId = setTimeout(bindToNewElements, 300);
    }).observe(document.documentElement, { childList: true, subtree: true });

})();
