
import settings from '../../../settings.js';
import prismarineViewer from 'prismarine-viewer';

const mineflayerViewer = prismarineViewer.mineflayer;

export function addBrowserViewer(bot, count_id) {
    mineflayerViewer(bot, { port: 3000+count_id, firstPerson: true, });
}

export class PluginInstance {
    constructor(agent) {
        this.agent = agent;
    }

    init() {
        if (this.agent.prompter.profile.viewer) {
            addBrowserViewer(this.agent.bot, this.agent.count_id)
        }
    }

    getPluginActions() {
        return []
    }
}