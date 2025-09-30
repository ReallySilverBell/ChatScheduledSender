// @ts-nocheck
import { registerSlashCommand, extension_settings, eventSource, event_types } from './src/deps.js';
import { loadSettingsHTML, updateEmptyStateUI, populateUIWithSettings, recomputeAndDisplayNext, setupCollapsible, setupAppointmentListListeners, toggleNewFormVisibility, handleNewAppointmentSubmit, setupTabs, renderHistoryList, setupHistoryButtons } from './src/ui.js';
import { loadSettings, migrateLegacySettings, attachUpdateListener } from './src/settings.js';
import { scheduleAllAppointments, cancelAllAppointmentTimers, scheduleAllAppointmentsForKey } from './src/appointments.js';
import { getCurrentChatKey } from './src/context.js';

const extensionNames = ['third-party/ChatScheduledSender', 'ChatScheduledSender'];

function handleEnabledToggle() {
    if (!extension_settings.idle.enabled) {
        cancelAllAppointmentTimers();
        recomputeAndDisplayNext();
    } else {
        scheduleAllAppointments();
        recomputeAndDisplayNext();
    }
}

function setupListeners() {
    const settingsToWatch = [
        ['idle_enabled', 'enabled', true],
        ['idle_include_timestamp', 'includeTimestamp', true],
        ['idle_include_prompt', 'includePrompt', true],
        ['idle_write_context', 'writeToContext', true],
        ['idle_sendAs', 'sendAs'],
    ];
    settingsToWatch.forEach(setting => attachUpdateListener(...setting));
    $('#idle_enabled').on('change', handleEnabledToggle);
    $('#idle_refresh_next').on('click', () => recomputeAndDisplayNext());
    // 新增预约：类型切换与提交
    $('#idle_new_type_group').on('change', 'input[name="idle_new_type"]', () => toggleNewFormVisibility());
    $('#idle_new_submit').on('click', handleNewAppointmentSubmit);
}

jQuery(async () => {
    await loadSettingsHTML(extensionNames);
    await loadSettings();
    migrateLegacySettings();
    populateUIWithSettings();
    updateEmptyStateUI();
    setupCollapsible();
    setupTabs();
    setupAppointmentListListeners();
    setupHistoryButtons();
    setupListeners();
    if (extension_settings.idle.enabled) scheduleAllAppointments();
    registerSlashCommand('idle', () => {
        extension_settings.idle.enabled = !extension_settings.idle.enabled;
        $('#idle_enabled').prop('checked', extension_settings.idle.enabled).trigger('change');
    }, [], '—— 切换定时任务', true, true);
    setInterval(updateEmptyStateUI, 1000);

    // 监听聊天切换：根据当前窗口绑定的聊天键重排程与刷新UI
    try {
        eventSource?.on?.(event_types?.CHAT_CHANGED, () => {
            updateEmptyStateUI();
            populateUIWithSettings();
            recomputeAndDisplayNext();
            renderHistoryList();
            if (extension_settings.idle.enabled) {
                scheduleAllAppointmentsForKey(getCurrentChatKey());
            }
        });
    } catch (e) {
        // 静默失败：没有事件总线时忽略
    }

    // 无调试日志按钮
});