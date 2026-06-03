// ==UserScript==
// @name         TexCopyer
// @namespace    http://tampermonkey.net/
// @version      1.3
// @license      GPLv3
// @description  双击网页中的LaTex公式，将其复制到剪切板
// @description:en Double click on a LaTeX formula on a webpage to copy it to the clipboard
// @author       3plus10i
// @match        *://*.wikipedia.org/*
// @match        *://*.zhihu.com/*
// @match        *://*.chatgpt.com/*
// @match        *://*.moonshot.cn/*
// @match        *://*.stackexchange.com/*
// @match        *://oi-wiki.org/*
// @match        *://*.luogu.com/*
// @match        *://*.luogu.com.cn/*
// @match        *://*.doubao.com/*
// @match        *://*.deepseek.com/*
// @match        *://*.chatboxai.app/*
// @match        *://ieeexplore.ieee.org/*
// @match        *://*.bohrium.com/*
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
            selector: 'span.katex',
            extract: el => formatLatex(safeText(el, 'annotation')),
        },
        {
            match: u => u.includes('moonshot.cn'),
            selector: 'span.katex',
            extract: el => formatLatex(safeText(el, 'annotation')),
        },
        {
            match: u => u.includes('stackexchange.com'),
            selector: 'span.math-container',
            extract: el => formatLatex(safeText(el, 'script')),
        },
        {
            match: u => u.includes('oi-wiki.org'),
            selector: 'mjx-container.MathJax',
            extract: el => formatLatex(safeAttr(el.querySelector('img'), 'title')),
        },
        {
            match: u => u.includes('luogu.com'),
            selector: 'span.katex',
            extract: el => formatLatex(safeText(el, 'annotation')),
        },
        {
            match: u => u.includes('doubao.com'),
            selector: 'span.math-inline',
            extract: el => formatLatex(safeAttr(el, 'data-custom-copy-text')),
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
    ];

    /** 返回当前 URL 匹配的第一个站点配置，无匹配返回 null */
    function resolveSite(url) {
        return SITE_CONFIGS.find(cfg => cfg.match(url)) || null;
    }

    // 模块级缓存，页面生命周期内不变
    const currentSite = resolveSite(window.location.href);

    // ---- DOM / UI ----

    const css = `
        .latex-tooltip { position: fixed; background-color: rgba(0, 0, 0, 0.7); color: #fff; padding: 5px 10px; border-radius: 5px; font-size: 11px; z-index: 1000; opacity: 0; transition: opacity 0.2s; pointer-events: none; }
        .latex-copy-success { position: fixed; bottom: 10%; left: 50%; transform: translateX(-50%); background-color: rgba(0, 0, 0, 0.7); color: #fff; padding: 10px 20px; border-radius: 5px; font-size: 12px; z-index: 1000; transition: opacity 0.2s; pointer-events: none; }
    `;
    const styleSheet = document.createElement('style');
    styleSheet.type = 'text/css';
    styleSheet.innerText = css;
    document.head.appendChild(styleSheet);

    const tooltip = document.createElement('div');
    tooltip.classList.add('latex-tooltip');
    document.body.appendChild(tooltip);

    function showCopySuccess() {
        const el = document.createElement('div');
        el.className = 'latex-copy-success';
        el.innerText = '已复制LaTeX公式';
        document.body.appendChild(el);
        setTimeout(() => {
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 200);
        }, 1000);
    }

    // ---- 事件绑定 ----

    const DATA_FLAG = 'data-texcopyer-processed';
    let bindTimer = null;

    function bindToNewElements() {
        if (!currentSite) return;

        document.querySelectorAll(currentSite.selector).forEach(el => {
            if (el.hasAttribute(DATA_FLAG)) return;
            el.setAttribute(DATA_FLAG, '');

            el.addEventListener('mouseenter', function () {
                el.style.cursor = 'pointer';
                bindTimer = setTimeout(() => {
                    tooltip.textContent = currentSite.extract(el);
                    const rect = el.getBoundingClientRect();
                    tooltip.style.left = `${rect.left}px`;
                    tooltip.style.display = 'block';
                    // 必须在block后计算相对位置，否则offsetHeight为0
                    tooltip.style.top = `${rect.top - tooltip.offsetHeight - 5}px`;
                    tooltip.style.opacity = '0.8';
                }, 1000);
            });

            el.addEventListener('mouseleave', function () {
                el.style.cursor = 'auto';
                clearTimeout(bindTimer);
                tooltip.style.display = 'none';
                tooltip.style.opacity = '0';
            });

            el.ondblclick = function () {
                const latex = currentSite.extract(el);
                if (latex) {
                    console.log(`LaTeX copied: ${latex}`);
                    navigator.clipboard.writeText(latex).then(showCopySuccess);
                }
                window.getSelection().removeAllRanges();
            };
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
