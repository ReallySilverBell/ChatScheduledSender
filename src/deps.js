// 统一依赖聚合，便于子模块导入
export { saveSettingsDebounced, substituteParams, eventSource, event_types, sendMessageAsUser, Generate } from '../../../../../script.js';
export { debounce } from '../../../../utils.js';
export { promptQuietForLoudResponse, registerSlashCommand } from '../../../../slash-commands.js';
export { extension_settings, getContext, renderExtensionTemplateAsync } from '../../../../extensions.js';

// 可能的 Node/Electron fs（若不可用，调用方需降级）
export let fs = undefined;
try { fs = (window?.require && window.require('fs')) || undefined; } catch (e) { fs = undefined; }

