// @ts-nocheck
import { renderExtensionTemplateAsync, extension_settings, saveSettingsDebounced } from './deps.js';
import { hasActiveChat } from './context.js';
import { getNearestNextAt, scheduleAppointment, cancelAppointmentTimer, generateApptId } from './appointments.js';
import { getCurrentChatKey } from './context.js';
import { getAppointmentsForKey as __getAppointmentsForKey } from './appointments.js';

export async function loadSettingsHTML(extensionNames) {
    let settingsHtml = null;
    for (const name of extensionNames) {
        try {
            settingsHtml = await renderExtensionTemplateAsync(name, 'dropdown');
            if (settingsHtml) break;
        } catch (e) {
            // try next name
        }
    }
    if (!settingsHtml) {
        console.error('[ChatScheduledSender] 无法加载模板 dropdown.html');
        return;
    }
    const getContainer = () => $(document.getElementById('idle_container') ?? document.getElementById('extensions_settings2'));
    getContainer().append(settingsHtml);
}

export function updateNextTimeDisplay(date) {
    if (!date) {
        $('#idle_next_time').text('--');
    } else {
        $('#idle_next_time').text(date.toLocaleString());
    }
}

export function updateEmptyStateUI() {
    const container = $('#idle_container');
    if (!container.length) return;
    const header = $('#idle-container-header');
    const content = $('#idle-container-content');
    const placeholderId = 'idle_empty_placeholder';
    if (!hasActiveChat()) {
        header.hide();
        content.hide();
        if (!document.getElementById(placeholderId)) {
            container.append(`<div id="${placeholderId}" class="idle-empty-state" style="padding: 8px 6px; color: var(--text_primary);">定时任务需要与对话绑定</div>`);
        }
    } else {
        header.show();
        const p = document.getElementById(placeholderId);
        if (p) p.remove();
    }
}

export function recomputeAndDisplayNext() {
    if (!extension_settings.idle?.enabled) {
        updateNextTimeDisplay(null);
        return;
    }
    const key = getCurrentChatKey();
    const list = __getAppointmentsForKey(key);
    const next = getNearestNextAt(list || []);
    updateNextTimeDisplay(next);
}

export function setupCollapsible() {
    $('#idle-container-header').off('click').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const content = $('#idle-container-content');
        const icon = $(this).find('.inline-drawer-icon');
        if (!content.length) return;
        if (content.is(':visible')) {
            content.slideUp(200);
            icon.removeClass('up').addClass('down');
        } else {
            content.slideDown(200);
            icon.removeClass('down').addClass('up');
        }
    });
}

// 选项卡切换
export function setupTabs() {
    const tabs = $('#idle_nav .idle-nav-item');
    tabs.off('click').on('click', function() {
        const tab = $(this).data('tab');
        $('#idle_nav .idle-nav-item').removeClass('idle-nav-active');
        $(this).addClass('idle-nav-active');
        $('#idle_section_global').toggle(tab === 'global');
        $('#idle_section_list').toggle(tab === 'list');
        $('#idle_section_new').toggle(tab === 'new');
        $('#idle_section_history').toggle(tab === 'history');
    });
}

// ---- 历史记录 ----
export function renderHistoryList() {
    const list = getCurrentHistory();
    const container = $('#idle_history_list').empty();
    if (!list || list.length === 0) {
        container.append('<div class="idle-empty-state" style="padding: 6px 4px; color: var(--text_secondary);">暂无历史</div>');
        return;
    }
    list.slice().reverse().forEach(item => {
        const time = new Date(item.time).toLocaleString();
        const status = item.status || '已发送';
        const who = item.sendAs || 'char';
        const prompt = (item.prompt || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const apptType = item.apptType || '';
        const apptId = item.apptId || '';
        container.append(`
            <div class="idle-history-entry" style="border: var(--idle-border); border-radius: var(--idle-radius); padding: 6px; margin: 6px 0; background: var(--idle-card-bg);">
                <div style="display:flex; justify-content:space-between; gap:6px;">
                    <span>${time}</span>
                    <span style="color: var(--text_secondary);">${status}</span>
                </div>
                <div style="margin-top:4px; word-break: break-word;">${prompt}</div>
                <div style="margin-top:4px; color: var(--text_secondary); font-size: 12px;">发送身份: ${who}${apptType ? ` | 类型: ${apptType}` : ''}${apptId ? ` | ID: ${apptId}` : ''}</div>
            </div>
        `);
    });
}

export function setupHistoryButtons() {
    $(document).on('click', '#idle_history_export', function() {
        const list = getCurrentHistory();
        const blob = new Blob([JSON.stringify(list || [], null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'idle-history.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
    });
    $(document).on('click', '#idle_history_clear', function() {
        const key = getCurrentChatKey();
        if (!key) return;
        const idle = extension_settings.idle = extension_settings.idle || {};
        idle.historyByChat = idle.historyByChat || {};
        idle.historyByChat[key] = [];
        saveSettingsDebounced();
        renderHistoryList();
        if (window.toastr?.success) toastr.success('已清空历史');
    });
}

function getCurrentHistory() {
    const key = getCurrentChatKey();
    const idle = extension_settings.idle = extension_settings.idle || {};
    idle.historyByChat = idle.historyByChat || {};
    idle.historyByChat[key] = Array.isArray(idle.historyByChat[key]) ? idle.historyByChat[key] : [];
    return idle.historyByChat[key];
}

// 监听来自 timer 的刷新事件
document.addEventListener('idle_history_updated', () => {
    try { renderHistoryList(); } catch (e) {}
});

// --- 预约 UI ---
function escapeHtml(input) {
    if (input == null) return '';
    return String(input)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function renderAppointmentsList() {
    const container = $('#idle_appointments').empty();
    const list = __getAppointmentsForKey(getCurrentChatKey());
    list.forEach(appt => {
        // 若缺失 nextAt，则即时计算并调度一次，确保 UI 显示正确
        try {
            if (appt && appt.enabled && !appt.nextAt) {
                scheduleAppointment(appt);
            }
        } catch (e) {}
        const id = escapeHtml(appt.id);
        const enabled = appt.enabled ? 'checked' : '';
        const type = String(appt.type || '').toLowerCase();
        let timeFieldHtml = '';
        let promptFieldHtml = '';
        let promptViewHtml = '';
        let promptGroupHtml = '';
        if (type === 'once') {
            const when = escapeHtml(appt.when || '');
            timeFieldHtml = `<input type="datetime-local" class="appt-time" value="${when}">`;
            promptViewHtml = `<div class="appt-prompt-view">${escapeHtml(appt.prompt || '')}</div>`;
            promptFieldHtml = `<textarea class="appt-prompt-input" rows="2" placeholder="Prompt" style="display:none;">${escapeHtml(appt.prompt || '')}</textarea>`;
            promptGroupHtml = `${promptViewHtml}${promptFieldHtml}`;
        } else if (type === 'daily') {
            const t = escapeHtml(appt.time || '');
            timeFieldHtml = `<input type="time" class="appt-time" value="${t}">`;
            promptViewHtml = `<div class="appt-prompt-view">${escapeHtml(appt.prompt || '')}</div>`;
            promptFieldHtml = `<textarea class="appt-prompt-input" rows="2" placeholder="Prompt" style="display:none;">${escapeHtml(appt.prompt || '')}</textarea>`;
            promptGroupHtml = `${promptViewHtml}${promptFieldHtml}`;
        } else if (type === 'timer') {
            const interval = Number(appt.intervalSec) || 120;
            const repeats = Number(appt.repeats) || 1;
            const prompts = Array.isArray(appt.prompts) ? appt.prompts.join('\n') : '';
            const promptsView = (Array.isArray(appt.prompts) ? appt.prompts : (prompts ? prompts.split('\n') : []))
                .map(line => escapeHtml(line))
                .join('<br>');
            promptViewHtml = `<div class="appt-prompts-view">${promptsView || ''}</div>`;
            promptFieldHtml = `<textarea class="appt-prompts-input" rows="3" placeholder="每行一条 Prompt" style="display:none;">${escapeHtml(prompts)}</textarea>`;
            timeFieldHtml = `
                <div class="timer-fields">
                    <label>间隔(秒)<input type="number" class="appt-interval" min="1" value="${interval}"></label>
                    <label>重复(0 无限)<input type="number" class="appt-repeats" min="0" value="${repeats}"></label>
                </div>
                `;

            promptGroupHtml = `${promptViewHtml}${promptFieldHtml}`;
        }

        const nextAtText = appt.nextAt ? new Date(appt.nextAt).toLocaleString() : '--';

        container.append(`
            <div class="appointment-entry" data-id="${id}" data-type="${type}">
                <input type="checkbox" class="appt-enabled" ${enabled}>
                <span class="appt-type">${type === 'once' ? '一次性' : type === 'daily' ? '每日' : '定时'}</span>
                <div class="appt-when">${timeFieldHtml}</div>
                <button type="button" class="appt-delete">删除预约</button>
                <div class="prompt-wrap">${promptGroupHtml}</div>
                <div class="appt-actions">
                    <button type="button" class="appt-edit">✎ 修改</button>
                    <button type="button" class="appt-save">保存</button>
                    <span class="appt-next">下次：${escapeHtml(nextAtText)}</span>
                </div>
            </div>
        `);
    });
}

export function setupAppointmentListListeners() {
    $('#idle_appointments').on('click', '.appt-delete', function() {
        const id = $(this).closest('.appointment-entry').data('id');
        const list = __getAppointmentsForKey(getCurrentChatKey()) || [];
        const idx = list.findIndex(x => x && x.id === id);
        if (idx >= 0) {
            cancelAppointmentTimer(id);
            list.splice(idx, 1);
            saveSettingsDebounced();
            renderAppointmentsList();
            recomputeAndDisplayNext();
        }
    });

    $('#idle_appointments').on('change', '.appt-enabled', function() {
        const row = $(this).closest('.appointment-entry');
        const id = row.data('id');
        const appt = (__getAppointmentsForKey(getCurrentChatKey()) || []).find(x => x && x.id === id);
        if (!appt) return;
        appt.enabled = this.checked;
        saveSettingsDebounced();
        // 无论全局开关如何，都用调度函数同步 nextAt / 定时器
        scheduleAppointment(appt);
        saveSettingsDebounced();
        recomputeAndDisplayNext();
        renderAppointmentsList();
        // 反馈提示
        if (!appt.enabled) {
            if (window.toastr?.info) toastr.info('该预约已取消，已从计划中移除');
        } else {
            const when = appt.nextAt ? new Date(appt.nextAt).toLocaleString() : '--';
            if (window.toastr?.info) toastr.info(`该预约已启用，下次：${when}`);
        }
    });

    // 切换 Prompt 编辑模式（支持三类预约）
    $('#idle_appointments').on('click', '.appt-edit', function() {
        const row = $(this).closest('.appointment-entry');
        const type = String(row.data('type'));
        const btn = $(this);
        // 一次性/每日：prompt 在 .prompt-wrap 内
        if (type === 'once' || type === 'daily') {
            const wrap = row.find('.prompt-wrap');
            const view = wrap.find('.appt-prompt-view');
            const input = wrap.find('.appt-prompt-input');
            const editing = input.is(':visible');
            if (editing) {
                input.hide();
                view.text(input.val()).show();
                btn.text('✎ 修改');
            } else {
                view.hide();
                input.show().trigger('focus');
                btn.text('取消修改');
            }
            return;
        }
        // 定时：与一次性/每日一致，prompt 在 .prompt-wrap 内
        if (type === 'timer') {
            const wrap = row.find('.prompt-wrap');
            const view = wrap.find('.appt-prompts-view');
            const input = wrap.find('.appt-prompts-input');
            const editing = input.is(':visible');
            if (editing) {
                input.hide();
                const lines = String(input.val() || '').split('\n').map(s => s.trim()).filter(Boolean);
                view.html(lines.map(l => escapeHtml(l)).join('<br>')).show();
                btn.text('✎ 修改');
            } else {
                view.hide();
                input.show().trigger('focus');
                btn.text('取消修改');
            }
        }
    });

    $('#idle_appointments').on('click', '.appt-save', function() {
        const row = $(this).closest('.appointment-entry');
        const id = row.data('id');
        const appt = (__getAppointmentsForKey(getCurrentChatKey()) || []).find(x => x && x.id === id);
        if (!appt) return;

        if (appt.type === 'once') {
            appt.when = String(row.find('.appt-time').val() || '').trim();
            appt.prompt = String(row.find('.appt-prompt-input').val() || '').trim();
        } else if (appt.type === 'daily') {
            appt.time = String(row.find('.appt-time').val() || '').trim();
            appt.prompt = String(row.find('.appt-prompt-input').val() || '').trim();
        } else if (appt.type === 'timer') {
            appt.intervalSec = Math.max(1, parseInt(row.find('.appt-interval').val() || '0', 10));
            appt.repeats = Math.max(0, parseInt(row.find('.appt-repeats').val() || '0', 10));
            const text = String(row.find('.appt-prompts-input').val() || '');
            appt.prompts = text.split('\n').map(s => s.trim()).filter(Boolean);
            if (appt.repeats > 0 && (typeof appt.remaining !== 'number' || appt.remaining < 0)) {
                appt.remaining = appt.repeats;
            }
        }

        saveSettingsDebounced();
        // 立即重新调度（会在禁用状态下只更新 nextAt 而不建定时器）
        scheduleAppointment(appt);
        recomputeAndDisplayNext();
        // 如果在编辑模式，保存后退回查看模式并更新视图文本
        const type = String(row.data('type'));
        if (type === 'once' || type === 'daily') {
            const wrap = row.find('.prompt-wrap');
            const view = wrap.find('.appt-prompt-view');
            const input = wrap.find('.appt-prompt-input');
            view.text(input.val());
            input.hide();
            view.show();
            row.find('.appt-edit').text('✎ 修改');
        } else if (type === 'timer') {
            const wrap = row.find('.prompt-wrap');
            const view = wrap.find('.appt-prompts-view');
            const input = wrap.find('.appt-prompts-input');
            const lines = String(input.val() || '').split('\n').map(s => s.trim()).filter(Boolean);
            view.html(lines.join('<br>'));
            input.hide();
            view.show();
            row.find('.appt-edit').text('✎ 修改');
        }
        // 局部刷新 nextAt 文案
        const nextText = appt.nextAt ? new Date(appt.nextAt).toLocaleString() : '--';
        row.find('.appt-next').text(`下次：${nextText}`);
    });
}

export function setupNewAppointmentForm() {
    toggleNewFormVisibility();
}

export function toggleNewFormVisibility() {
    const val = $('input[name="idle_new_type"]:checked').val();
    $('#idle_new_form_once').toggle(val === 'once');
    $('#idle_new_form_daily').toggle(val === 'daily');
    $('#idle_new_form_timer').toggle(val === 'timer');
}

export function handleNewAppointmentSubmit() {
    const type = String($('input[name="idle_new_type"]:checked').val() || '').toLowerCase();
    const appt = { id: generateApptId(), type, enabled: true };
    if (type === 'once') {
        appt.when = String($('#idle_new_once_time').val() || '').trim();
        appt.prompt = String($('#idle_new_once_prompt').val() || '').trim();
        if (!appt.when) { toastr.warning('请填写一次性预约的时间'); return; }
        const d = new Date(appt.when);
        if (!(d instanceof Date) || isNaN(d.getTime()) || d <= new Date()) { toastr.warning('一次性时间需为未来'); return; }
    } else if (type === 'daily') {
        appt.time = String($('#idle_new_daily_time').val() || '').trim();
        appt.prompt = String($('#idle_new_daily_prompt').val() || '').trim();
        if (!appt.time) { toastr.warning('请填写每日时间'); return; }
    } else if (type === 'timer') {
        appt.intervalSec = Math.max(1, parseInt($('#idle_new_timer').val() || '0', 10));
        appt.repeats = Math.max(0, parseInt($('#idle_new_repeats').val() || '0', 10));
        const text = String($('#idle_new_prompts').val() || '');
        appt.prompts = text.split('\n').map(s => s.trim()).filter(Boolean);
        if (appt.repeats > 0) appt.remaining = appt.repeats;
    } else {
        toastr.error('未知预约类型');
        return;
    }

    const list = __getAppointmentsForKey(getCurrentChatKey());
    list.push(appt);
    saveSettingsDebounced();
    if (extension_settings.idle.enabled) scheduleAppointment(appt);
    renderAppointmentsList();
    recomputeAndDisplayNext();

    if (type === 'once') {
        $('#idle_new_once_time').val('');
        $('#idle_new_once_prompt').val('');
    } else if (type === 'daily') {
        $('#idle_new_daily_time').val('');
        $('#idle_new_daily_prompt').val('');
    } else if (type === 'timer') {
        $('#idle_new_timer').val('120');
        $('#idle_new_repeats').val('1');
        $('#idle_new_prompts').val('');
    }
}

export function populateUIWithSettings() {
    $('#idle_enabled').prop('checked', !!extension_settings.idle.enabled).trigger('input');
    $('#idle_include_prompt').prop('checked', !!extension_settings.idle.includePrompt).trigger('input');
    $('#idle_sendAs').val(extension_settings.idle.sendAs).trigger('input');
    renderAppointmentsList();
    setupNewAppointmentForm();
    recomputeAndDisplayNext();
}

