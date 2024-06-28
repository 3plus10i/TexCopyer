// ==UserScript==
// @name         TexCopyer
// @namespace    http://tampermonkey.net/
// @version      0.3
// @license      GPLv3
// @description  双击latex公式将其复制到剪切板
// @author       Lysanleo, Epool, yjy
// @match        *://*.wikipedia.org/*
// @match        *://*.zhihu.com/*
// @match        *://*.chatgpt.com/*
// ==/UserScript==

(function() {
    'use strict';

    // 获取悬浮对象和公式对象的选择器
    function getSelectors(url) {
        let rt = {codeSelector: '', elementSelector: ''}
        if (url.includes('wikipedia.org')) {
            rt.codeSelector = '[alt]';
            rt.elementSelector = 'span.mwe-math-element';
            return rt
        } else if (url.includes('zhihu.com')) {
            rt.codeSelector = '[data-tex]';
            rt.elementSelector = 'span.MathJax_SVG';
            return rt
        } else if (url.includes('chatgpt.com')) {
            rt.codeSelector = 'annotation[encoding="application/x-tex"]';
            rt.elementSelector = 'span.katex';
            return rt
        }
        // 待添加更多网站的条件
        return null;
    }

    // 格式化latex
    function formatToLaTeX(input) {
        while (input.endsWith(' ') || input.endsWith('\\')) {
            input = input.slice(0, -1);
        }
        return '$' + input + '$';
    }

    // 将悬浮提示和双击事件绑定到相应元素上
    function addHandler() {
        let sel = getSelectors(window.location.href);
        if (!sel) return;

        let codeSelector = sel.codeSelector;
        // 将双击事件绑定到元素上
        document.querySelectorAll(codeSelector).forEach(element => {
            element.ondblclick = function() {
                let codeAttribute = codeSelector.replace('[', '').replace(']', '');
                const codeValue = element.getAttribute(codeAttribute);
                if (codeValue !== null) {
                    console.log(`LaTeX copied: ${formatToLaTeX(codeValue)}`) // for debug
                    navigator.clipboard.writeText(formatToLaTeX(codeValue)).then(() => {
                        showCopySuccessTooltip();
                    });
                } 
            };
        });

        let elementSelector = sel.elementSelector;
        // 将悬浮事件绑定到元素上
        document.querySelectorAll(elementSelector).forEach(element => {
            let hoverTimer; // 悬浮时间计时器
            let hoverTimeout = 1000; // 悬浮1秒
            // 设置悬浮延时器
            element.addEventListener('mouseenter', () => {
                // 改变光标样式
                element.style.cursor = "pointer";
                hoverTimer = setTimeout(() => {
                    showHoverTooltip(element); // 显示提示的函数
                }, hoverTimeout);
            });
            // 如果鼠标移出，直接清除延时器
            element.addEventListener('mouseleave', () => {
                element.style.cursor = "auto";
                clearTimeout(hoverTimer);
            });
        });
    }

    // 显示复制成功提示
    function showCopySuccessTooltip() {
        const tooltip = document.createElement("div");
        tooltip.innerText = "已复制LaTeX公式";
        tooltip.style.position = "fixed";
        tooltip.style.bottom = "10%"; // 距离底部 10%
        tooltip.style.left = "50%";
        tooltip.style.transform = "translateX(-50%)";
        tooltip.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
        tooltip.style.color = "#fff";
        tooltip.style.padding = "10px 20px";
        tooltip.style.borderRadius = "5px";
        tooltip.style.fontSize = "12px";
        tooltip.style.zIndex = "1000";
        tooltip.style.transition = "opacity 0.2s";
        tooltip.style.pointerEvents = "none"; // 防止提示框影响点击事件

        document.body.appendChild(tooltip);

        tooltip.style.opacity = "1";

        setTimeout(() => {
            tooltip.style.opacity = "0";
            setTimeout(() => {
                document.body.removeChild(tooltip);
            }, 200); // 与transition时间匹配
        }, 1000); // 提示短时间后消失
    }


    // 显示可复制提示
    function showHoverTooltip(element) {
        // 清除之前的延时器（如果有）
        clearTimeout(element._hoverTooltipTimer);
        // 删除当前元素上已有的提示
        if (element._hoverTooltip) {
            document.body.removeChild(element._hoverTooltip);
            element._hoverTooltip = null;
        }

        const tooltip = document.createElement("div");
        tooltip.innerText = "双击复制";
        tooltip.style.position = "fixed";
        tooltip.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
        tooltip.style.color = "#fff";
        tooltip.style.padding = "5px 10px";
        tooltip.style.borderRadius = "5px";
        tooltip.style.fontSize = "11px";
        tooltip.style.zIndex = "1000";
        tooltip.style.opacity = "0.7";
        tooltip.style.transition = "opacity 0.2s";
        tooltip.style.pointerEvents = "none"; // 防止提示框影响点击事件

        document.body.appendChild(tooltip);

        const rect = element.getBoundingClientRect();
        tooltip.style.top = `${rect.top - tooltip.offsetHeight - 5}px`;
        tooltip.style.left = `${rect.left}px`;

        element._hoverTooltip = tooltip; // 保存tooltip以便移除

        // 1秒后自动删除提示
        element._hoverTooltipTimer = setTimeout(() => {
            if (element._hoverTooltip) {
                element._hoverTooltip.style.opacity = "0";
                setTimeout(() => {
                    if (element._hoverTooltip) document.body.removeChild(element._hoverTooltip);
                    element._hoverTooltip = null;
                }, 200); // 与transition时间匹配
            }
        }, 1000);
    }
    
    // 监听页面加载或变化，绑定事件
    document.addEventListener('DOMContentLoaded', addHandler);
    new MutationObserver(addHandler).observe(document.documentElement, {childList: true, subtree: true});

})();