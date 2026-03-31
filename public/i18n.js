// i18n.js - Frontend Localization Logic
const SUPPORTED_LANGUAGES = ['en', 'ru'];
const DEFAULT_LANGUAGE = 'en';

let translations = {};
let currentLanguage = localStorage.getItem('quizLanguage');

if (!currentLanguage || !SUPPORTED_LANGUAGES.includes(currentLanguage)) {
    // try to get from browser
    const browserLang = navigator.language.split('-')[0];
    currentLanguage = SUPPORTED_LANGUAGES.includes(browserLang) ? browserLang : DEFAULT_LANGUAGE;
}

/**
 * Loads translation file for a given language
 */
async function loadTranslations(lang) {
    try {
        const response = await fetch(`/i18n/${lang}.json`);
        if (!response.ok) {
            throw new Error(`Failed to load ${lang} translations`);
        }
        translations = await response.json();
    } catch (error) {
        console.error('Error loading translations:', error);
        if (lang !== DEFAULT_LANGUAGE) {
            console.log('Falling back to default language');
            await loadTranslations(DEFAULT_LANGUAGE);
            currentLanguage = DEFAULT_LANGUAGE;
        }
    }
}

/**
 * Gets a translated string by key. Supports parameter replacement like {name}.
 */
function t(key, params = {}) {
    if (!key) return '';
    
    const keys = key.split('.');
    let value = translations;
    
    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = value[k];
        } else {
            value = undefined;
            break;
        }
    }
    
    if (value === undefined) {
        console.warn(`Translation key not found: ${key}`);
        return key; // return the key itself if not found
    }
    
    if (typeof value === 'string') {
        let result = value;
        for (const [paramKey, paramValue] of Object.entries(params)) {
            result = result.replace(new RegExp(`{${paramKey}}`, 'g'), String(paramValue));
        }
        return result;
    }
    
    return value;
}

/**
 * Applies translations to all elements with data-i18n attribute
 */
function applyTranslationsToDOM() {
    document.documentElement.lang = currentLanguage;
    
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        
        // Handle placeholders for input fields
        if (el.tagName === 'INPUT' && el.hasAttribute('placeholder')) {
            el.placeholder = t(key);
        } else if (el.tagName === 'SELECT') {
            const defaultOption = el.querySelector('option[value=""]');
            if (defaultOption && el.getAttribute('data-i18n-select') === "true") {
                 defaultOption.textContent = t(key);
            }
        } else {
            // Keep child elements if any (like spans with count), only replace text node if needed
            // But usually we just replace textContent, or use innerHTML if we have spans
            // Let's check for specific elements we want to keep inner structure
            if (el.hasAttribute('data-i18n-html')) {
                el.innerHTML = t(key);
            } else {
                el.textContent = t(key);
            }
        }
    });

    // Handle Title tags
    const titleKey = document.title.includes('Host') ? 'host.pageTitle' : 
                     document.title.includes('Player') ? 'player.pageTitle' : 
                     document.title.includes('Admin') ? 'admin.pageTitle' : null;
    if (titleKey) document.title = t(titleKey);
    
    // Update language switcher UI if present
    updateLangSwitcherUI();
}

/**
 * Switches the language and reloads UI
 */
window.switchLanguage = async function(lang) {
    if (SUPPORTED_LANGUAGES.includes(lang) && lang !== currentLanguage) {
        currentLanguage = lang;
        localStorage.setItem('quizLanguage', lang);
        await loadTranslations(lang);
        applyTranslationsToDOM();
        
        // Dispatch custom event so that specific scripts (like admin.js showing error messages) can react
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));
    }
};

function updateLangSwitcherUI() {
    const sw = document.getElementById('langSwitcher');
    if (sw) {
        sw.value = currentLanguage;
    }
}

// Inject Lang Switcher Button if there's a container or body
function createLangSwitcher() {
    const wrapper = document.createElement('div');
    wrapper.className = 'lang-switcher-wrapper';
    
    const select = document.createElement('select');
    select.id = 'langSwitcher';
    SUPPORTED_LANGUAGES.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang;
        option.textContent = lang === 'en' ? '🇬🇧 EN' : '🇷🇺 RU';
        if (lang === currentLanguage) {
            option.selected = true;
        }
        select.appendChild(option);
    });
    
    select.addEventListener('change', (e) => {
        switchLanguage(e.target.value);
    });
    
    wrapper.appendChild(select);
    document.body.appendChild(wrapper);
}

// Global initialization
window.initI18n = async function() {
    await loadTranslations(currentLanguage);
    createLangSwitcher();
    applyTranslationsToDOM();
};

// Start initialization when DOM is ready
document.addEventListener('DOMContentLoaded', window.initI18n);
