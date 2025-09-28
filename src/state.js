// 会话内状态容器
export const repeatCounts = {};
export const isSendingByKey = {};
export const lastSentAtMs = {};

// 按聊天键存储的预约定时器桶：{ [chatKey]: { [apptId]: TimeoutId } }
export const appointmentTimersByKey = {};

// 旧 idleTimers / next* / lastDaily* 已移除

// 取消并清空某个聊天键下的所有预约定时器
export function clearAppointmentTimersForKey(chatKey) {
    if (!chatKey) return;
    const bucket = appointmentTimersByKey[chatKey];
    if (!bucket) return;
    for (const apptId in bucket) {
        const t = bucket[apptId];
        if (t) clearTimeout(t);
        delete bucket[apptId];
    }
}

// 为指定聊天键注册/覆盖一个定时器句柄
export function setAppointmentTimer(chatKey, apptId, handle) {
    if (!chatKey || !apptId) return;
    appointmentTimersByKey[chatKey] = appointmentTimersByKey[chatKey] || {};
    appointmentTimersByKey[chatKey][apptId] = handle;
}

// 查询某个聊天键下的定时器句柄
export function getAppointmentTimer(chatKey, apptId) {
    return appointmentTimersByKey[chatKey]?.[apptId];
}

// 删除某个聊天键下的定时器句柄（不清除已存在的定时器）
export function unsetAppointmentTimer(chatKey, apptId) {
    if (!chatKey || !apptId) return;
    if (!appointmentTimersByKey[chatKey]) return;
    delete appointmentTimersByKey[chatKey][apptId];
}

