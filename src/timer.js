// @ts-nocheck
import { extension_settings, promptQuietForLoudResponse, fs, saveSettingsDebounced, sendMessageAsUser, Generate } from './deps.js';
import { getCurrentChatKey } from './context.js';
import { repeatCounts, isSendingByKey, lastSentAtMs } from './state.js';

// 精简：移除旧 Idle 定时器逻辑，仅保留发送函数

export async function sendIdlePrompt(targetKey = null, customPrompt = '', sendAsOverride = null, isSchedule = false) {
    if (!extension_settings.idle?.enabled) return;
    const currentKey = getCurrentChatKey();
    const key = targetKey || currentKey;
    const currentRepeat = repeatCounts[key] || 0;
    const nowMs = Date.now();
    if (!isSchedule && lastSentAtMs[key] && (nowMs - lastSentAtMs[key] < 500)) return;
    // 由 appointments 负责 nextAt，不再基于 nextIdleTargetTimes
    if ((extension_settings.idle.repeats > 0 && currentRepeat >= extension_settings.idle.repeats) && !isSchedule) return;
    if (key !== currentKey) return;
    if (isSendingByKey[key]) return;
    isSendingByKey[key] = true;

    const includePrompt = !!extension_settings.idle.includePrompt;
    const sendAs = sendAsOverride ?? extension_settings.idle.sendAs ?? 'char';
    const normalizedSendAs = sendAs === 'sys' ? 'system' : sendAs;

    const includeTimestamp = !!extension_settings.idle.includeTimestamp;
    const timestamp = includeTimestamp ? getFullTimestamp() : '';
    const timestampPart = includeTimestamp ? `[${timestamp}]` : '';
    const promptCore = includePrompt ? ` ${customPrompt}` : '';
    const promptToSend = `${timestampPart}${promptCore}`.trim();
    if (!promptToSend) { isSendingByKey[key] = false; return; }
    if (extension_settings.idle?.writeToContext) {
        try {
            await sendMessageAsUser(promptToSend);
            await Generate('normal');
        } catch (e) {
            // 如果前台方式失败，退回原静默方式
            try { promptQuietForLoudResponse(normalizedSendAs, promptToSend); } catch (_) {}
        }
    } else {
        promptQuietForLoudResponse(normalizedSendAs, promptToSend);
    }

    // 历史记录：在发送时写入，并标注“已发送”
    try {
        extension_settings.idle = extension_settings.idle || {};
        extension_settings.idle.historyByChat = extension_settings.idle.historyByChat || {};
        const history = extension_settings.idle.historyByChat[key] = Array.isArray(extension_settings.idle.historyByChat[key]) ? extension_settings.idle.historyByChat[key] : [];
        history.push({
            time: Date.now(),
            key,
            sendAs: normalizedSendAs,
            prompt: promptToSend,
            status: '已发送',
        });
        // 控制容量
        const MAX_HIST = 2000;
        if (history.length > MAX_HIST) history.splice(0, history.length - MAX_HIST);
        saveSettingsDebounced();
        // 若 UI 在历史页，触发一次渲染
        if (document.getElementById('idle_section_history')?.style.display !== 'none') {
            try { window.requestAnimationFrame?.(() => { const evt = new Event('idle_history_updated'); document.dispatchEvent(evt); }); } catch (e) {}
        }
    } catch (e) {
        // ignore history errors
    }

    if (!isSchedule) repeatCounts[key] = (repeatCounts[key] || 0) + 1;
    lastSentAtMs[key] = nowMs;
    // 不再此处重置；由 appointments 负责调度下一次
    isSendingByKey[key] = false;
}

export function getFullTimestamp() {
    const now = new Date();
    return now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + ' ' +
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0') + ':' +
        String(now.getSeconds()).padStart(2, '0');
}

