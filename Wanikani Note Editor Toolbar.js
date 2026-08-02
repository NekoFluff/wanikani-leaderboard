// ==UserScript==
// @name         Wanikani Note Editor Toolbar
// @namespace    http://tampermonkey.net/
// @version      1.1.0
// @description  Adds one-click buttons to WaniKani's meaning/reading note editors for wrapping or inserting <mark class="..."> highlight tags
// @author       NekoFluff
// @match        https://www.wanikani.com/radicals/*
// @match        https://www.wanikani.com/kanji/*
// @match        https://www.wanikani.com/vocabulary/*
// @match        https://www.wanikani.com/subject-lessons/*
// @match        https://www.wanikani.com/subject-reviews/*
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
    'use strict';

    // WaniKani's own notes support these five highlight classes (see
    // application.css). Colors are pulled straight from WK's CSS variables so
    // the buttons match how the tag will actually render.
    const TAGS = [
        { label: 'Radical', class: 'radical-highlight', text: '#0069AC', background: '#CBEBFF' },
        { label: 'Kanji', class: 'kanji-highlight', text: '#B9007B', background: '#FFD4F1' },
        { label: 'Vocab', class: 'vocabulary-highlight', text: '#8600B9', background: '#EDC8FF' },
        { label: 'Reading', class: 'reading-highlight', text: '#333333', background: '#CAD0D6' },
        { label: 'Meaning', class: 'meaning-highlight', text: '#333333', background: '#CAD0D6' },
    ];

    function setTextareaValue(textarea, value) {
        // Native setter is needed so WK's autogrow/character-count Stimulus
        // controllers (bound via data-action) pick up the change.
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(textarea, value);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function wrapOrInsert(textarea, tagClass) {
        const { selectionStart: start, selectionEnd: end, value } = textarea;
        const open = `<mark class="${tagClass}">`;
        const close = '</mark>';

        let newValue, selStart, selEnd;
        if (start === end) {
            newValue = value.slice(0, start) + open + close + value.slice(end);
            selStart = selEnd = start + open.length;
        } else {
            const selected = value.slice(start, end);
            newValue = value.slice(0, start) + open + selected + close + value.slice(end);
            selStart = start + open.length;
            selEnd = selStart + selected.length;
        }

        setTextareaValue(textarea, newValue);
        textarea.focus();
        textarea.setSelectionRange(selStart, selEnd);
    }

    function buildToolbar(textarea) {
        const toolbar = document.createElement('div');
        toolbar.className = 'note-toolbar';
        TAGS.forEach(function (tag) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = tag.label;
            btn.className = 'note-toolbar__btn';
            btn.style.color = tag.text;
            btn.style.backgroundColor = tag.background;
            btn.title = `<mark class="${tag.class}">`;
            btn.addEventListener('click', function (e) {
                e.preventDefault();
                wrapOrInsert(textarea, tag.class);
            });
            toolbar.appendChild(btn);
        });
        return toolbar;
    }

    function enhance(textarea) {
        if (textarea.dataset.noteToolbarAttached) return;
        textarea.dataset.noteToolbarAttached = 'true';
        textarea.insertAdjacentElement('beforebegin', buildToolbar(textarea));
    }

    function scan(root) {
        root.querySelectorAll('turbo-frame.user-note textarea.wk-form__text-area').forEach(enhance);
    }

    const observer = new MutationObserver(function (mutations) {
        for (const mutation of mutations) {
            mutation.addedNodes.forEach(function (node) {
                if (node.nodeType !== Node.ELEMENT_NODE) return;
                if (node.matches && node.matches('textarea.wk-form__text-area')) enhance(node);
                scan(node);
            });
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    scan(document);

    const style = document.createElement('style');
    style.textContent = `
        .note-toolbar {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
            margin-bottom: 6px;
        }
        .note-toolbar__btn {
            border: none;
            border-radius: 4px;
            padding: 3px 10px;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            opacity: 0.85;
        }
        .note-toolbar__btn:hover {
            opacity: 1;
        }
    `;
    document.head.appendChild(style);
})();
