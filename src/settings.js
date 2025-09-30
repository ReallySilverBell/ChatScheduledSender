// @ts-nocheck
import { extension_settings, saveSettingsDebounced } from './deps.js';
import { debounce } from './deps.js';
import { generateApptId } from './appointments.js';

export const defaultSettings = {
    enabled: false,
    includePrompt: false,
    includeTimestamp: true,
    writeToContext: false,
    sendAs: 'char',
    // 已移除调试日志相关设置
    // 已移除跨对话发送开关
    appointments: [],
    appointmentsByChat: {},
    historyByChat: {},
    pendingByChat: {},
    // 旧字段仅用于迁移
    timer: 120,
    // 已移除全局提示词库
    repeats: 1,
    // 以下为旧设置，仅迁移使用
    enableOnceSchedules: false,
    enableDailySchedules: false,
    scheduleOnceList: [],
    scheduleDailyList: [],
    useIdleTimer: false,
};

export async function loadSettings() {
    if (!extension_settings.idle) extension_settings.idle = {};
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (!extension_settings.idle.hasOwnProperty(key)) {
            extension_settings.idle[key] = value;
        }
    }
}

export function migrateLegacySettings() {
    const s = extension_settings.idle;
    s.appointments = Array.isArray(s.appointments) ? s.appointments : [];
    s.appointmentsByChat = s.appointmentsByChat && typeof s.appointmentsByChat === 'object' ? s.appointmentsByChat : {};
    // 清理遗留调试字段
    if (s.hasOwnProperty('debugMode')) delete s.debugMode;
    if (s.hasOwnProperty('debugLog')) delete s.debugLog;

    if (Array.isArray(s.scheduleOnceList) && s.scheduleOnceList.length > 0) {
        for (const item of s.scheduleOnceList) {
            if (!item) continue;
            s.appointments.push({
                id: generateApptId(),
                type: 'once',
                enabled: !!item.enabled,
                when: item.time || '',
                prompt: item.prompt || '',
                nextAt: null,
            });
        }
        s.scheduleOnceList = [];
    }

    if (Array.isArray(s.scheduleDailyList) && s.scheduleDailyList.length > 0) {
        for (const item of s.scheduleDailyList) {
            if (!item) continue;
            s.appointments.push({
                id: generateApptId(),
                type: 'daily',
                enabled: !!item.enabled,
                time: item.time || '',
                prompt: item.prompt || '',
                nextAt: null,
            });
        }
        s.scheduleDailyList = [];
    }

    if (typeof s.timer === 'number' && s.timer > 0) {
        s.appointments.push({
            id: generateApptId(),
            type: 'timer',
            enabled: !!s.useIdleTimer,
            intervalSec: Math.max(1, parseInt(s.timer || 120, 10)),
            repeats: Math.max(0, parseInt(s.repeats || 0, 10)),
            remaining: Math.max(0, parseInt(s.repeats || 0, 10)) || undefined,
            prompts: [],
            nextAt: null,
        });
        s.useIdleTimer = false;
    }

    // 懒迁移：若存在旧的全局 appointments，则在首次激活的聊天下承接
    try {
        const { getCurrentChatKey } = require('./context.js');
        const key = getCurrentChatKey && getCurrentChatKey();
        if (key && Array.isArray(s.appointments) && s.appointments.length > 0) {
            s.appointmentsByChat[key] = s.appointmentsByChat[key] || { appointments: [] };
            const bucket = s.appointmentsByChat[key];
            bucket.appointments = Array.isArray(bucket.appointments) ? bucket.appointments : [];
            bucket.appointments.push(...s.appointments);
            s.appointments = []; // 清空旧结构，避免重复
        }
    } catch (e) {
        // 在浏览器环境 require 不存在，跳过；后续由 appointments 模块的 ensure 逻辑兜底
    }
}

export function attachUpdateListener(elementId, property, isCheckbox = false) {
    const eventName = isCheckbox ? 'change' : 'input';
    $(`#${elementId}`).on(eventName, debounce(() => {
        let value = $(`#${elementId}`).val();
        if (isCheckbox) value = $(`#${elementId}`).prop('checked');
        extension_settings.idle[property] = value;
        saveSettingsDebounced();
    }, 250));
}

