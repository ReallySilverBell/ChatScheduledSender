import { getContext } from './deps.js';

export function getCurrentChatKey() {
    const context = getContext();
    if (!context) return null;
    if (context.groupID) return `group:${context.groupID}`;
    if (context.characterId) return `char:${context.characterId}`;
    return null;
}

export function hasActiveChat() {
    const context = getContext();
    return !!(context && (context.characterId || context.groupID));
}

