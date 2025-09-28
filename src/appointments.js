// @ts-nocheck
import { extension_settings, saveSettingsDebounced } from './deps.js';
import { getCurrentChatKey } from './context.js';
import { setAppointmentTimer, getAppointmentTimer, unsetAppointmentTimer, clearAppointmentTimersForKey, appointmentTimersByKey } from './state.js';
import { sendIdlePrompt } from './timer.js';

export function generateApptId() {
    return 'appt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

export function cancelAppointmentTimer(apptId, chatKey = null) {
    const key = chatKey || getCurrentChatKey();
    const t = getAppointmentTimer(key, apptId);
    if (t) clearTimeout(t);
    unsetAppointmentTimer(key, apptId);
}

export function cancelAllAppointmentTimersForKey(chatKey) {
    clearAppointmentTimersForKey(chatKey);
}

export function cancelAllAppointmentTimers() {
    // 清理所有聊天键下的定时器，确保切换聊天时只保留当前聊天的计划
    for (const key in appointmentTimersByKey) {
        clearAppointmentTimersForKey(key);
    }
}

export function scheduleAppointment(appt, chatKey = null) {
    if (!appt) return;
    const key = chatKey || getCurrentChatKey();
    cancelAppointmentTimer(appt.id, key);
    if (!appt.enabled) {
        appt.nextAt = null;
        return;
    }
    if (!key) return;

    const now = new Date();
    if (appt.type === 'once') {
        if (!appt.when) { appt.nextAt = null; return; }
        const target = new Date(appt.when);
        if (!(target instanceof Date) || isNaN(target.getTime())) { appt.nextAt = null; return; }
        if (target <= now) { appt.enabled = false; appt.nextAt = null; saveSettingsDebounced(); return; }
        appt.nextAt = target.toISOString();
        const ms = Math.max(0, target.getTime() - now.getTime());
        if (extension_settings.idle?.enabled) {
            setAppointmentTimer(key, appt.id, setTimeout(() => {
                sendIdlePrompt(key, appt.prompt || '', null, true);
                appt.enabled = false;
                appt.nextAt = null;
                saveSettingsDebounced();
            }, ms));
        }
    } else if (appt.type === 'daily') {
        if (!appt.time) { appt.nextAt = null; return; }
        const parts = String(appt.time).split(':');
        const h = Number(parts[0]);
        const m = Number(parts[1]);
        if (!Number.isFinite(h) || !Number.isFinite(m)) { appt.nextAt = null; return; }
        const next = new Date(now);
        next.setSeconds(0, 0);
        next.setHours(h, m, 0, 0);
        if (next <= now) next.setDate(next.getDate() + 1);
        appt.nextAt = next.toISOString();
        const ms = Math.max(0, next.getTime() - now.getTime());
        if (extension_settings.idle?.enabled) {
            setAppointmentTimer(key, appt.id, setTimeout(() => {
                sendIdlePrompt(key, appt.prompt || '', null, true);
                scheduleAppointment(appt, key);
                saveSettingsDebounced();
            }, ms));
        }
    } else if (appt.type === 'timer') {
        const intervalSec = Math.max(1, parseInt(appt.intervalSec || 0, 10));
        const next = new Date(now.getTime() + intervalSec * 1000);
        appt.nextAt = next.toISOString();
        const ms = Math.max(0, next.getTime() - now.getTime());
        if (extension_settings.idle?.enabled) {
            setAppointmentTimer(key, appt.id, setTimeout(() => {
                let chosen = '';
                if (Array.isArray(appt.prompts) && appt.prompts.length > 0) {
                    chosen = appt.prompts[Math.floor(Math.random() * appt.prompts.length)] || '';
                }
                sendIdlePrompt(key, chosen, null, true);
                if (appt.repeats > 0) {
                    if (typeof appt.remaining !== 'number' || appt.remaining <= 0) appt.remaining = appt.repeats;
                    appt.remaining -= 1;
                    if (appt.remaining <= 0) {
                        appt.enabled = false;
                        appt.nextAt = null;
                        saveSettingsDebounced();
                        return;
                    }
                }
                scheduleAppointment(appt, key);
                saveSettingsDebounced();
            }, ms));
        }
    }
}

export function scheduleAllAppointmentsForKey(chatKey) {
    const key = chatKey || getCurrentChatKey();
    cancelAllAppointmentTimersForKey(key);
    const list = getAppointmentsForKey(key);
    list.forEach(appt => scheduleAppointment(appt, key));
}

export function scheduleAllAppointments() {
    const key = getCurrentChatKey();
    scheduleAllAppointmentsForKey(key);
}

// 已移除跨对话统一排程

export function getNearestNextAt(list) {
    const arr = Array.isArray(list) ? list : [];
    let candidate = null;
    for (const appt of arr) {
        if (!appt || !appt.enabled || !appt.nextAt) continue;
        const d = new Date(appt.nextAt);
        if (!candidate || d < candidate) candidate = d;
    }
    return candidate;
}

// --- helpers ---
export function getAppointmentsForKey(chatKey) {
    const key = chatKey || getCurrentChatKey();
    extension_settings.idle = extension_settings.idle || {};
    extension_settings.idle.appointmentsByChat = extension_settings.idle.appointmentsByChat || {};
    const store = extension_settings.idle.appointmentsByChat;
    // 懒迁移：如仍存在旧的全局 appointments，则并入当前聊天并清空旧结构
    if (Array.isArray(extension_settings.idle.appointments) && extension_settings.idle.appointments.length > 0) {
        store[key] = store[key] || { appointments: [] };
        const bucket0 = store[key];
        bucket0.appointments = Array.isArray(bucket0.appointments) ? bucket0.appointments : [];
        bucket0.appointments.push(...extension_settings.idle.appointments);
        extension_settings.idle.appointments = [];
        try { saveSettingsDebounced(); } catch (e) { /* ignore */ }
    }
    if (!store[key]) store[key] = { appointments: [] };
    const bucket = store[key];
    if (!Array.isArray(bucket.appointments)) bucket.appointments = [];
    return bucket.appointments;
}


